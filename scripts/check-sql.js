/**
 * Smoke test schematu i zapytań SQL na silniku SQLite (node:sqlite).
 * Sprawdza, czy migracja i wszystkie zapytania repozytoriów są poprawne.
 */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const root = process.argv[2] || process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function extractTemplate(source, name) {
  const start = source.indexOf(`const ${name} = \``);
  if (start === -1) throw new Error(`Nie znaleziono ${name}`);
  const from = source.indexOf('`', start) + 1;
  const to = source.indexOf('`', from);
  return source.slice(from, to);
}

/** Wyciąga wszystkie zapytania SQL z pliku repozytorium (szablony w backtickach i apostrofach). */
function extractSql(source) {
  const out = [];
  const regex = /(?:query|queryFirst|run|getFirstAsync|getAllAsync|runAsync)<[^>]*>?\(\s*(`[^`]*`|'[^']*')/g;
  let match;
  while ((match = regex.exec(source))) out.push(match[1].slice(1, -1));
  return out;
}

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON;');

const migrations = read('db/migrations.ts');
db.exec(extractTemplate(migrations, 'MIGRATION_1'));
db.exec(extractTemplate(migrations, 'MIGRATION_2'));
console.log('✓ schemat utworzony (migracje 1-2)');

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all()
  .map((row) => row.name);
console.log('✓ tabele:', tables.join(', '));

const required = [
  'transactions',
  'categories',
  'recurring_transactions',
  'budgets',
  'budget_categories',
  'savings_goals',
  'settings',
  'monthly_plans',
  'merchant_hints',
  'people',
  'receipts',
  'receipt_items',
  'item_shares',
  'settlements',
];
for (const table of required) {
  if (!tables.includes(table)) throw new Error(`Brak wymaganej tabeli: ${table}`);
}

const now = new Date().toISOString();

// dane testowe
db.prepare(
  `INSERT INTO categories (name, kind, icon, color, sort_order, is_default, archived, is_demo, created_at, updated_at)
   VALUES (?, ?, ?, ?, 0, 1, 0, 0, ?, ?)`
).run('Jedzenie', 'expense', 'fast-food-outline', '#F0546B', now, now);
db.prepare(
  `INSERT INTO categories (name, kind, icon, color, sort_order, is_default, archived, is_demo, created_at, updated_at)
   VALUES (?, ?, ?, ?, 1, 1, 0, 0, ?, ?)`
).run('Internet', 'bill', 'wifi-outline', '#4FD1C5', now, now);

db.prepare(
  `INSERT INTO recurring_transactions (type, name, amount, category_id, day_of_month, payment_method, note,
     auto_create, active, start_month, end_month, is_demo, created_at, updated_at)
   VALUES ('bill', 'Internet', 8000, 2, 10, NULL, NULL, 1, 1, '2026-01', NULL, 0, ?, ?)`
).run(now, now);

const insertTx = db.prepare(
  `INSERT INTO transactions (type, amount, category_id, name, description, date, month, payment_method,
     is_paid, due_date, paid_date, goal_id, recurring_id, is_demo, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
insertTx.run('expense', 4250, 1, 'Biedronka', null, '2026-08-17', '2026-08', 'card', 1, null, null, null, null, 0, now, now);
insertTx.run('income', 500000, null, 'Pensja', null, '2026-08-10', '2026-08', null, 1, null, null, null, null, 0, now, now);
insertTx.run('bill', 8000, 2, 'Internet', null, '2026-08-10', '2026-08', null, 0, '2026-08-10', null, null, 1, 0, now, now);

// unikalny indeks: (recurring_id, month)
let duplicateBlocked = false;
try {
  insertTx.run('bill', 8000, 2, 'Internet', null, '2026-08-10', '2026-08', null, 0, '2026-08-10', null, null, 1, 0, now, now);
} catch (error) {
  duplicateBlocked = true;
}
if (!duplicateBlocked) throw new Error('Unikalny indeks (recurring_id, month) nie działa');
console.log('✓ indeks chroni przed podwójnym rachunkiem cyklicznym');

// zapytania z repozytoriów
const repositories = [
  'db/repositories/transactions.ts',
  'db/repositories/categories.ts',
  'db/repositories/budgets.ts',
  'db/repositories/recurring.ts',
  'db/repositories/savings.ts',
  'db/repositories/plans.ts',
  'db/repositories/hints.ts',
  'db/repositories/settings.ts',
  'db/repositories/people.ts',
  'db/repositories/receipts.ts',
  'db/repositories/settlements.ts',
];

const SELECT_WITH_CATEGORY = `
  SELECT t.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
  FROM transactions t
  LEFT JOIN categories c ON c.id = t.category_id
`;
const ORDER = 'ORDER BY t.date DESC, t.id DESC';

const SELECT_RECEIPT = `
  SELECT id, transaction_id, merchant, date, total, payer_id, source,
         raw_text, image_uri, created_at, updated_at
  FROM receipts
`;

/** Każde repozytorium ma własny szablon ${SELECT} — podstawiamy właściwy. */
function selectFor(file) {
  if (file.endsWith('people.ts')) {
    return 'SELECT id, name, color, is_me, archived, is_demo FROM people';
  }
  if (file.endsWith('settlements.ts')) {
    return 'SELECT id, person_id, amount, date, note, created_at FROM settlements';
  }
  if (file.endsWith('categories.ts')) {
    return 'SELECT id, name, kind, icon, color, sort_order, is_default, archived, is_demo FROM categories';
  }
  return '';
}

let checked = 0;
for (const file of repositories) {
  const source = read(file);
  for (const raw of extractSql(source)) {
    const sql = raw
      .replace(/\$\{SELECT_WITH_CATEGORY\}/g, SELECT_WITH_CATEGORY)
      .replace(/\$\{ORDER\}/g, ORDER)
      .replace(/\$\{SELECT_RECEIPT\}/g, SELECT_RECEIPT)
      .replace(/\$\{SELECT\}/g, selectFor(file))
      .replace(/\$\{[^}]*\}/g, '');
    if (!/^\s*(SELECT|INSERT|UPDATE|DELETE|PRAGMA|WITH)/i.test(sql)) continue;
    try {
      db.prepare(sql);
      checked += 1;
    } catch (error) {
      throw new Error(`Błędne zapytanie w ${file}:\n${sql}\n${error.message}`);
    }
  }
}
console.log(`✓ ${checked} zapytań repozytoriów kompiluje się poprawnie`);

// najważniejsze zapytania w praktyce
const monthRows = db.prepare(`${SELECT_WITH_CATEGORY} WHERE t.month = ? ${ORDER}`).all('2026-08');
if (monthRows.length !== 3) throw new Error('listByMonth zwróciło złą liczbę wierszy');

const bills = db
  .prepare(
    `${SELECT_WITH_CATEGORY} WHERE t.month = ? AND t.type = 'bill'
     ORDER BY t.is_paid ASC, COALESCE(t.due_date, t.date) ASC, t.id ASC`
  )
  .all('2026-08');
if (bills.length !== 1 || bills[0].is_paid !== 0) throw new Error('listBills nie działa');

const usage = db
  .prepare(
    `SELECT c.id, c.name, COUNT(t.id) AS uses
     FROM categories c
     LEFT JOIN transactions t ON t.category_id = c.id AND t.type = c.kind
     WHERE c.archived = 0 AND c.kind = ?
     GROUP BY c.id
     ORDER BY uses DESC, c.sort_order, c.name COLLATE NOCASE`
  )
  .all('expense');
if (usage[0].uses !== 1) throw new Error('listCategoriesByUsage nie liczy użyć');

db.prepare(
  `INSERT INTO budgets (month, amount, created_at, updated_at) VALUES (?, ?, ?, ?)
   ON CONFLICT(month) DO UPDATE SET amount = excluded.amount, updated_at = excluded.updated_at`
).run('2026-08', 300000, now, now);
db.prepare(
  `INSERT INTO budgets (month, amount, created_at, updated_at) VALUES (?, ?, ?, ?)
   ON CONFLICT(month) DO UPDATE SET amount = excluded.amount, updated_at = excluded.updated_at`
).run('2026-08', 350000, now, now);
const budget = db.prepare('SELECT amount FROM budgets WHERE month = ?').get('2026-08');
if (budget.amount !== 350000) throw new Error('Upsert budżetu nie działa');

db.prepare(
  `INSERT INTO budget_categories (month, category_id, amount, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?)
   ON CONFLICT(month, category_id) DO UPDATE SET amount = excluded.amount, updated_at = excluded.updated_at`
).run('*', 1, 100000, now, now);
const catBudgets = db
  .prepare(
    `SELECT b.id, b.month, b.category_id, b.amount, c.name AS category_name
     FROM budget_categories b JOIN categories c ON c.id = b.category_id
     WHERE b.month IN ('*', ?) ORDER BY c.sort_order, c.name COLLATE NOCASE`
  )
  .all('2026-08');
if (catBudgets.length !== 1) throw new Error('listCategoryBudgets nie działa');

db.prepare(
  `INSERT INTO savings_goals (name, target_amount, initial_amount, icon, color, archived, is_demo, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`
).run('Nowy komputer', 600000, 190000, 'laptop-outline', '#3FC7C0', now, now);
insertTx.run('saving', 50000, null, 'Odłożone', null, '2026-08-12', '2026-08', null, 1, null, null, 1, null, 0, now, now);
const goal = db
  .prepare(
    `SELECT g.*, (
       SELECT COALESCE(SUM(t.amount), 0) FROM transactions t
       WHERE t.goal_id = g.id AND t.type = 'saving'
     ) AS saved FROM savings_goals g WHERE g.archived = 0`
  )
  .get();
if (goal.saved !== 50000) throw new Error('Suma wpłat na cel nie działa');
if (goal.initial_amount + goal.saved !== 240000) throw new Error('Postęp celu liczony błędnie');

db.prepare(
  `INSERT INTO merchant_hints (name_key, display_name, category_id, type, last_amount, uses, updated_at)
   VALUES (?, ?, ?, ?, ?, 1, ?)
   ON CONFLICT(name_key) DO UPDATE SET
     display_name = excluded.display_name, category_id = excluded.category_id, type = excluded.type,
     last_amount = excluded.last_amount, uses = merchant_hints.uses + 1, updated_at = excluded.updated_at`
).run('biedronka', 'Biedronka', 1, 'expense', 4250, now);
db.prepare(
  `INSERT INTO merchant_hints (name_key, display_name, category_id, type, last_amount, uses, updated_at)
   VALUES (?, ?, ?, ?, ?, 1, ?)
   ON CONFLICT(name_key) DO UPDATE SET
     display_name = excluded.display_name, category_id = excluded.category_id, type = excluded.type,
     last_amount = excluded.last_amount, uses = merchant_hints.uses + 1, updated_at = excluded.updated_at`
).run('biedronka', 'Biedronka', 1, 'expense', 5000, now);
const hint = db.prepare('SELECT * FROM merchant_hints WHERE name_key = ?').get('biedronka');
if (hint.uses !== 2 || hint.last_amount !== 5000) throw new Error('Podpowiedzi (smart defaults) nie działają');

db.prepare(
  `INSERT INTO monthly_plans (month, planned_income, planned_bills, planned_expenses, planned_savings, note, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(month) DO UPDATE SET planned_income = excluded.planned_income, updated_at = excluded.updated_at`
).run('2026-08', 600000, 163000, 250000, 50000, null, now, now);

db.prepare(
  `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`
).run('default_budget', '300000');

// usunięcie kategorii nie kasuje transakcji (ON DELETE SET NULL)
db.prepare('DELETE FROM categories WHERE id = 1').run();
const orphan = db.prepare("SELECT category_id FROM transactions WHERE name = 'Biedronka'").get();
if (orphan.category_id !== null) throw new Error('ON DELETE SET NULL nie działa');
const stillThere = db.prepare('SELECT COUNT(*) AS count FROM transactions').get();
if (stillThere.count !== 4) throw new Error('Usunięcie kategorii skasowało transakcje');
console.log('✓ usunięcie kategorii zachowuje transakcje');

// kasowanie danych demo
db.exec('DELETE FROM transactions WHERE is_demo = 1');
console.log('✓ dane demo dają się usunąć');

/* ---------------------- paragony i podział kosztów ---------------------- */

// wczesniejsza sekcja skasowala kategorie nr 1 - zakladamy wlasna
db.prepare(
  `INSERT INTO categories (name, kind, icon, color, sort_order, is_default, archived, is_demo, created_at, updated_at)
   VALUES (?, ?, ?, ?, 9, 0, 0, 0, ?, ?)`
).run('Zakupy', 'expense', 'cart-outline', '#F5A524', now, now);
const CAT = db.prepare("SELECT id FROM categories WHERE name = 'Zakupy'").get().id;

db.prepare(
  `INSERT INTO people (name, color, is_me, archived, is_demo, created_at, updated_at)
   VALUES (?, ?, 1, 0, 0, ?, ?)`
).run('Ja', '#22C55E', now, now);
db.prepare(
  `INSERT INTO people (name, color, is_me, archived, is_demo, created_at, updated_at)
   VALUES (?, ?, 0, 0, 0, ?, ?)`
).run('Kasia', '#7C9CF5', now, now);
const ME = 1;
const KASIA = 2;

// paragon opłacony przeze mnie, wpięty pod istniejący wydatek
insertTx.run('expense', 3000, CAT, 'Biedronka', 'Paragon: 2 pozycje', '2026-08-18', '2026-08', 'card', 1, null, null, null, null, 0, now, now);
const txId = db.prepare('SELECT MAX(id) AS id FROM transactions').get().id;

db.prepare(
  `INSERT INTO receipts (transaction_id, merchant, date, total, payer_id, source, raw_text, image_uri,
     is_demo, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, 'scan', NULL, NULL, 0, ?, ?)`
).run(txId, 'Biedronka', '2026-08-18', 3000, ME, now, now);
const receiptId = db.prepare('SELECT MAX(id) AS id FROM receipts').get().id;

const insertItem = db.prepare(
  `INSERT INTO receipt_items (receipt_id, name, quantity, unit_price, total, category_id, sort_order, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
insertItem.run(receiptId, 'Mleko', 1000, 1000, 1000, CAT, 0, now, now);
insertItem.run(receiptId, 'Ser', 1000, 2000, 2000, CAT, 1, now, now);
const itemMleko = db.prepare("SELECT id FROM receipt_items WHERE name = 'Mleko'").get().id;
const itemSer = db.prepare("SELECT id FROM receipt_items WHERE name = 'Ser'").get().id;

const insertShare = db.prepare(
  'INSERT INTO item_shares (item_id, person_id, amount) VALUES (?, ?, ?)'
);
// mleko dzielone po połowie, ser w całości dla Kasi
insertShare.run(itemMleko, ME, 500);
insertShare.run(itemMleko, KASIA, 500);
insertShare.run(itemSer, KASIA, 2000);

const itemsTotal = db
  .prepare('SELECT COALESCE(SUM(total), 0) AS total FROM receipt_items WHERE receipt_id = ?')
  .get(receiptId).total;
if (itemsTotal !== 3000) throw new Error('Suma pozycji paragonu nie zgadza się z kwotą wydatku');
console.log('✓ suma pozycji paragonu zgadza się z kwotą wydatku');

// jedna osoba nie może mieć dwóch udziałów w tej samej pozycji
let duplicateShareBlocked = false;
try {
  insertShare.run(itemSer, KASIA, 100);
} catch (error) {
  duplicateShareBlocked = true;
}
if (!duplicateShareBlocked) throw new Error('UNIQUE (item_id, person_id) nie działa');
console.log('✓ indeks chroni przed podwójnym udziałem tej samej osoby');

// zapytanie o salda (db/repositories/receipts.ts -> loadRawBalances)
const balanceSql = `
  SELECT p.id AS person_id,
         (SELECT COALESCE(SUM(s.amount), 0)
            FROM item_shares s
            JOIN receipt_items i ON i.id = s.item_id
            JOIN receipts r ON r.id = i.receipt_id
           WHERE s.person_id = p.id AND COALESCE(r.payer_id, ?) = ?) AS owes_me,
         (SELECT COALESCE(SUM(s.amount), 0)
            FROM item_shares s
            JOIN receipt_items i ON i.id = s.item_id
            JOIN receipts r ON r.id = i.receipt_id
           WHERE s.person_id = ? AND r.payer_id = p.id) AS i_owe
  FROM people p
  WHERE p.id != ?
  ORDER BY p.name COLLATE NOCASE`;

let balances = db.prepare(balanceSql).all(ME, ME, ME, ME);
if (balances.length !== 1) throw new Error('Salda: zła liczba osób');
if (balances[0].owes_me !== 2500) {
  throw new Error(`Kasia powinna być winna 2500 gr, jest ${balances[0].owes_me}`);
}
if (balances[0].i_owe !== 0) throw new Error('Nie powinienem nic być winien');
console.log('✓ saldo liczone z udziałów w pozycjach');

// paragon opłacony przez Kasię odwraca kierunek długu
db.prepare(
  `INSERT INTO receipts (transaction_id, merchant, date, total, payer_id, source, raw_text, image_uri,
     is_demo, created_at, updated_at)
   VALUES (NULL, ?, ?, ?, ?, 'manual', NULL, NULL, 0, ?, ?)`
).run('Lidl', '2026-08-19', 1000, KASIA, now, now);
const receipt2 = db.prepare('SELECT MAX(id) AS id FROM receipts').get().id;
insertItem.run(receipt2, 'Chleb', 1000, 1000, 1000, CAT, 0, now, now);
const itemChleb = db.prepare("SELECT id FROM receipt_items WHERE name = 'Chleb'").get().id;
insertShare.run(itemChleb, ME, 1000);

balances = db.prepare(balanceSql).all(ME, ME, ME, ME);
if (balances[0].i_owe !== 1000) {
  throw new Error('Paragon opłacony przez drugą osobę nie jest liczony');
}
console.log('✓ paragon opłacony przez inną osobę odwraca kierunek długu');

// rozliczenie zeruje saldo
db.prepare(
  `INSERT INTO settlements (person_id, amount, date, note, is_demo, created_at)
   VALUES (?, ?, ?, ?, 0, ?)`
).run(KASIA, 1500, '2026-08-20', 'Zwrot', now);
const settledTotal = db
  .prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM settlements WHERE person_id = ?')
  .get(KASIA).total;
const net = balances[0].owes_me - balances[0].i_owe - settledTotal;
if (net !== 0) throw new Error(`Saldo po rozliczeniu powinno wynosić 0, wynosi ${net}`);
console.log('✓ rozliczenie zeruje saldo');

// usunięcie wydatku kasuje paragon wraz z pozycjami i udziałami
db.prepare('DELETE FROM transactions WHERE id = ?').run(txId);
const orphanReceipts = db.prepare('SELECT COUNT(*) AS count FROM receipts WHERE id = ?').get(receiptId).count;
const orphanItems = db.prepare('SELECT COUNT(*) AS count FROM receipt_items WHERE receipt_id = ?').get(receiptId).count;
const orphanShares = db
  .prepare('SELECT COUNT(*) AS count FROM item_shares WHERE item_id IN (?, ?)')
  .get(itemMleko, itemSer).count;
if (orphanReceipts !== 0 || orphanItems !== 0 || orphanShares !== 0) {
  throw new Error('Usunięcie wydatku nie kasuje paragonu (kaskada nie działa)');
}
console.log('✓ usunięcie wydatku kasuje paragon, pozycje i udziały');

// usunięcie osoby nie rusza kwot pozycji
db.prepare('DELETE FROM people WHERE id = ?').run(KASIA);
const chlebNadal = db.prepare('SELECT total FROM receipt_items WHERE id = ?').get(itemChleb);
if (!chlebNadal || chlebNadal.total !== 1000) {
  throw new Error('Usunięcie osoby zmieniło kwoty pozycji');
}
console.log('✓ usunięcie osoby zachowuje kwoty pozycji');


console.log('\nWSZYSTKIE SPRAWDZENIA SQL PRZESZŁY');
