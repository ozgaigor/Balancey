/**
 * Generowanie miesięcznego podsumowania jako PDF w formacie A5 (148 × 210 mm).
 *
 * Dokument powstaje z HTML renderowanego przez expo-print do prawdziwej strony
 * PDF o wymiarach A5 (420 × 595 punktów), a nie ze zrzutu ekranu.
 */

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

import type { TransactionWithCategory, YearMonth } from '../types';
import { formatMoney } from '../utils/currency';
import { formatDatePL, monthLabel, todayISO } from '../utils/dates';
import { listGoals } from '../db/repositories/savings';
import { getMonthOverview } from './budgetService';

/** A5 w punktach (1 pt = 1/72 cala): 148 mm × 210 mm. */
export const A5_WIDTH_PT = 420;
export const A5_HEIGHT_PT = 595;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface SectionRow {
  label: string;
  value: string;
  muted?: string;
}

function rowsHtml(rows: SectionRow[]): string {
  if (rows.length === 0) {
    return '<tr><td class="empty" colspan="2">Brak pozycji</td></tr>';
  }
  return rows
    .map(
      (row) => `
      <tr>
        <td class="label">${escapeHtml(row.label)}${
          row.muted ? `<span class="muted"> · ${escapeHtml(row.muted)}</span>` : ''
        }</td>
        <td class="value">${escapeHtml(row.value)}</td>
      </tr>`
    )
    .join('');
}

/** Grupuje transakcje danego typu po kategoriach (do sekcji zbiorczych). */
function groupByCategory(transactions: TransactionWithCategory[]): SectionRow[] {
  const totals = new Map<string, number>();
  for (const tx of transactions) {
    const key = tx.categoryName ?? 'Bez kategorii';
    totals.set(key, (totals.get(key) ?? 0) + tx.amount);
  }
  return Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, amount]) => ({ label, value: formatMoney(amount) }));
}

/** Buduje kompletny dokument HTML podsumowania miesiąca. */
export async function buildMonthHtml(month: YearMonth): Promise<string> {
  const overview = await getMonthOverview(month);
  const goals = await listGoals();
  const { summary, transactions } = overview;

  const incomes = transactions.filter((tx) => tx.type === 'income');
  const bills = transactions.filter((tx) => tx.type === 'bill');
  const expenses = transactions.filter((tx) => tx.type === 'expense');
  const savings = transactions.filter((tx) => tx.type === 'saving');

  const incomeRows = groupByCategory(incomes);
  const billRows: SectionRow[] = bills
    .slice()
    .sort((a, b) => (a.dueDate ?? a.date).localeCompare(b.dueDate ?? b.date))
    .map((bill) => ({
      label: bill.name || bill.categoryName || 'Rachunek',
      muted: bill.isPaid ? 'zapłacone' : 'do zapłaty',
      value: formatMoney(bill.amount),
    }));
  const expenseRows = groupByCategory(expenses);

  const transactionRows = transactions
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
    .map((tx) => {
      const sign = tx.type === 'income' ? '+' : '-';
      return `
      <tr>
        <td class="date">${formatDatePL(tx.date)}</td>
        <td class="name">${escapeHtml(tx.name || tx.categoryName || '—')}</td>
        <td class="cat">${escapeHtml(tx.categoryName ?? '—')}</td>
        <td class="amount ${tx.type === 'income' ? 'plus' : 'minus'}">${sign}${formatMoney(
          tx.amount
        )}</td>
      </tr>`;
    })
    .join('');

  const goalsHtml =
    goals.length > 0
      ? `
    <section>
      <h2>Cele oszczędnościowe</h2>
      <table class="rows">
        ${rowsHtml(
          goals.map((goal) => ({
            label: goal.name,
            muted: `${goal.percent}%`,
            value: `${formatMoney(goal.savedAmount)} / ${formatMoney(goal.targetAmount)}`,
          }))
        )}
      </table>
    </section>`
      : '';

  const budgetHtml = overview.budget.hasLimit
    ? `<tr><td class="label">Budżet wydatków</td><td class="value">${formatMoney(
        overview.budget.spent
      )} / ${formatMoney(overview.budget.limit)} (${overview.budget.percent}%)</td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="utf-8" />
<title>Budżet domowy — ${escapeHtml(monthLabel(month))}</title>
<style>
  @page { size: 148mm 210mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    width: 148mm;
    padding: 10mm 10mm 8mm 10mm;
    font-family: -apple-system, "Helvetica Neue", "Segoe UI", Roboto, Arial, sans-serif;
    font-size: 9pt;
    line-height: 1.35;
    color: #101418;
    background: #ffffff;
    -webkit-print-color-adjust: exact;
  }
  header { border-bottom: 1.5pt solid #101418; padding-bottom: 3mm; margin-bottom: 4mm; }
  .kicker { font-size: 7.5pt; letter-spacing: 0.14em; text-transform: uppercase; color: #5a6672; }
  h1 { font-size: 15pt; margin: 1mm 0 0 0; font-weight: 700; }
  .hero { margin-top: 3mm; display: flex; justify-content: space-between; align-items: flex-end; }
  .hero .caption { font-size: 8pt; color: #5a6672; text-transform: uppercase; letter-spacing: 0.08em; }
  .hero .amount { font-size: 20pt; font-weight: 700; }
  .hero .amount.negative { color: #B3243C; }
  section { margin-bottom: 4mm; page-break-inside: avoid; }
  h2 {
    font-size: 8pt; text-transform: uppercase; letter-spacing: 0.12em; color: #5a6672;
    margin: 0 0 1.5mm 0; padding-bottom: 1mm; border-bottom: 0.5pt solid #c9d1d9;
  }
  table { width: 100%; border-collapse: collapse; }
  table.rows td { padding: 0.9mm 0; vertical-align: top; }
  td.label { text-align: left; }
  td.value { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .muted { color: #7a8794; font-size: 7.5pt; }
  .empty { color: #7a8794; font-style: italic; }
  tr.total td { border-top: 0.5pt solid #c9d1d9; padding-top: 1.2mm; font-weight: 700; }
  table.list { margin-top: 1mm; font-size: 7.8pt; }
  table.list th {
    text-align: left; font-size: 7pt; text-transform: uppercase; letter-spacing: 0.08em;
    color: #5a6672; border-bottom: 0.5pt solid #c9d1d9; padding-bottom: 0.8mm;
  }
  table.list td { padding: 0.7mm 0; border-bottom: 0.25pt solid #e6eaee; vertical-align: top; }
  table.list tr { page-break-inside: avoid; }
  td.date { width: 17mm; color: #5a6672; white-space: nowrap; }
  td.cat { width: 28mm; color: #5a6672; }
  td.amount { text-align: right; white-space: nowrap; width: 24mm; font-variant-numeric: tabular-nums; }
  td.amount.minus { color: #B3243C; }
  td.amount.plus { color: #157F3D; }
  .summary-box { border: 0.75pt solid #101418; padding: 2.5mm 3mm; margin-top: 2mm; }
  .summary-box .row { display: flex; justify-content: space-between; padding: 0.6mm 0; }
  .summary-box .row.big { font-size: 11pt; font-weight: 700; border-top: 0.5pt solid #c9d1d9; margin-top: 1.2mm; padding-top: 1.5mm; }
  footer { margin-top: 4mm; padding-top: 2mm; border-top: 0.5pt solid #c9d1d9; font-size: 7pt; color: #7a8794; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <header>
    <div class="kicker">Budżet domowy</div>
    <h1>${escapeHtml(monthLabel(month))}</h1>
    <div class="hero">
      <span class="caption">Pozostało</span>
      <span class="amount ${summary.remaining < 0 ? 'negative' : ''}">${formatMoney(
        summary.remaining
      )}</span>
    </div>
  </header>

  <section>
    <h2>Podsumowanie</h2>
    <table class="rows">
      <tr><td class="label">Przychody</td><td class="value">${formatMoney(summary.income)}</td></tr>
      <tr><td class="label">Rachunki (zapłacone)</td><td class="value">${formatMoney(
        summary.billsPaid
      )}</td></tr>
      ${
        summary.billsUnpaid > 0
          ? `<tr><td class="label">Rachunki do zapłaty</td><td class="value">${formatMoney(
              summary.billsUnpaid
            )}</td></tr>`
          : ''
      }
      <tr><td class="label">Wydatki</td><td class="value">${formatMoney(summary.expenses)}</td></tr>
      <tr><td class="label">Oszczędności</td><td class="value">${formatMoney(
        summary.savings
      )}</td></tr>
      ${budgetHtml}
      <tr class="total"><td class="label">Pozostało</td><td class="value">${formatMoney(
        summary.remaining
      )}</td></tr>
    </table>
  </section>

  <section>
    <h2>Przychody</h2>
    <table class="rows">
      ${rowsHtml(incomeRows)}
      <tr class="total"><td class="label">Razem</td><td class="value">${formatMoney(
        summary.income
      )}</td></tr>
    </table>
  </section>

  <section>
    <h2>Rachunki</h2>
    <table class="rows">
      ${rowsHtml(billRows)}
      <tr class="total"><td class="label">Razem</td><td class="value">${formatMoney(
        summary.billsTotal
      )}</td></tr>
    </table>
  </section>

  <section>
    <h2>Wydatki według kategorii</h2>
    <table class="rows">
      ${rowsHtml(expenseRows)}
      <tr class="total"><td class="label">Razem</td><td class="value">${formatMoney(
        summary.expenses
      )}</td></tr>
    </table>
  </section>

  <section>
    <h2>Oszczędności</h2>
    <table class="rows">
      ${rowsHtml(groupByCategory(savings))}
      <tr class="total"><td class="label">Razem</td><td class="value">${formatMoney(
        summary.savings
      )}</td></tr>
    </table>
  </section>

  ${goalsHtml}

  <section>
    <h2>Lista transakcji (${transactions.length})</h2>
    <table class="list">
      <thead>
        <tr><th>Data</th><th>Nazwa</th><th>Kategoria</th><th style="text-align:right">Kwota</th></tr>
      </thead>
      <tbody>
        ${
          transactionRows ||
          '<tr><td class="empty" colspan="4">Brak transakcji w tym miesiącu</td></tr>'
        }
      </tbody>
    </table>
  </section>

  <section>
    <h2>Podsumowanie miesiąca</h2>
    <div class="summary-box">
      <div class="row"><span>Przychody</span><span>${formatMoney(summary.income)}</span></div>
      <div class="row"><span>Rachunki</span><span>-${formatMoney(summary.billsPaid)}</span></div>
      <div class="row"><span>Wydatki</span><span>-${formatMoney(summary.expenses)}</span></div>
      <div class="row"><span>Oszczędności</span><span>-${formatMoney(summary.savings)}</span></div>
      <div class="row big"><span>Pozostało</span><span>${formatMoney(summary.remaining)}</span></div>
    </div>
  </section>

  <footer>
    <span>Wygenerowano: ${formatDatePL(todayISO())}</span>
    <span>Dane wyłącznie z tego urządzenia</span>
  </footer>
</body>
</html>`;
}

export interface PdfResult {
  uri: string;
  fileName: string;
}

/** Tworzy plik PDF w katalogu dokumentów aplikacji i zwraca jego ścieżkę. */
export async function generateMonthPdf(month: YearMonth): Promise<PdfResult> {
  const html = await buildMonthHtml(month);

  const printed = await Print.printToFileAsync({
    html,
    width: A5_WIDTH_PT,
    height: A5_HEIGHT_PT,
  });

  const fileName = `Budzet-${month}.pdf`;
  const target = new File(Paths.document, fileName);
  if (target.exists) {
    target.delete();
  }

  // move() jest synchroniczne i nie przyjmuje opcji — plik docelowy kasujemy wyżej.
  const source = new File(printed.uri);
  source.move(target);

  return { uri: target.uri, fileName };
}

/** Generuje PDF i otwiera systemowe okno udostępniania / zapisu. */
export async function shareMonthPdf(month: YearMonth): Promise<PdfResult> {
  const result = await generateMonthPdf(month);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(result.uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: `Podsumowanie — ${monthLabel(month)}`,
    });
  }

  return result;
}

/** Otwiera systemowe okno drukowania dla podsumowania miesiąca. */
export async function printMonth(month: YearMonth): Promise<void> {
  const html = await buildMonthHtml(month);
  await Print.printAsync({ html, width: A5_WIDTH_PT, height: A5_HEIGHT_PT });
}
