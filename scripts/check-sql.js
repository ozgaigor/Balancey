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
const schema = extractTemplate(migrations, 'MIGRATION_1');
db.exec(schema);
console.log('✓ schemat utworzony');

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
];

const SELECT_WITH_CATEGORY = `
  SELECT t.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
  FROM transactions t
  LEFT JOIN categories c ON c.id = t.category_id
`;
const ORDER = 'ORDER BY t.date DESC, t.id DESC';

let checked = 0;
for (const file of repositories) {
  const source = read(file);
  for (const raw of extractSql(source)) {
    const sql = raw
      .replace(/\$\{SELECT_WITH_CATEGORY\}/g, SELECT_WITH_CATEGORY)
      .replace(/\$\{ORDER\}/g, ORDER)
      .replace(/\$\{SELECT\}/g, source.includes('FROM categories')
        ? 'SELECT id, name, kind, icon, color, sort_order, is_default, archived, is_demo FROM categories'
        : '')
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

console.log('\nWSZYSTKIE SPRAWDZENIA SQL PRZESZŁY');
