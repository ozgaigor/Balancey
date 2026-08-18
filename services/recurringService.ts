/**
 * Automatyczne tworzenie transakcji z cykli (rachunki i wydatki powtarzalne).
 *
 * Rachunek cykliczny "Internet, 80 zł, 10 dnia miesiąca" powoduje, że
 * w każdym kolejnym miesiącu pojawia się pozycja z terminem 10. dnia,
 * domyślnie ze statusem "Do zapłaty".
 */

import type { YearMonth } from '../types';
import { addMonths, currentYearMonth, dueDateForMonth, monthsDiff } from '../utils/dates';
import { listRecurringForMonth } from '../db/repositories/recurring';
import { createTransaction, existsForRecurring } from '../db/repositories/transactions';

/** Nie generujemy pozycji dalej niż rok w przód. */
const MAX_MONTHS_AHEAD = 12;

/** Miesiące aktualnie przetwarzane — zabezpieczenie przed podwójnym zapisem. */
const inFlight = new Map<YearMonth, Promise<number>>();

/**
 * Uzupełnia transakcje cykliczne dla wskazanego miesiąca.
 * Zwraca liczbę utworzonych pozycji.
 */
export async function ensureRecurringForMonth(month: YearMonth): Promise<number> {
  const existing = inFlight.get(month);
  if (existing) return existing;

  const task = generate(month).finally(() => {
    inFlight.delete(month);
  });
  inFlight.set(month, task);
  return task;
}

async function generate(month: YearMonth): Promise<number> {
  if (monthsDiff(currentYearMonth(), month) > MAX_MONTHS_AHEAD) return 0;

  const templates = await listRecurringForMonth(month);
  let created = 0;

  for (const template of templates) {
    const alreadyCreated = await existsForRecurring(template.id, month);
    if (alreadyCreated) continue;

    const date = dueDateForMonth(month, template.dayOfMonth);
    const isBill = template.type === 'bill';

    try {
      await createTransaction({
        type: template.type,
        amount: template.amount,
        categoryId: template.categoryId,
        name: template.name,
        description: template.note,
        date,
        paymentMethod: template.paymentMethod,
        isPaid: isBill ? false : true,
        dueDate: isBill ? date : null,
        recurringId: template.id,
        isDemo: template.isDemo,
      });
      created += 1;
    } catch {
      // Unikalny indeks (recurring_id, month) chroni przed duplikatem,
      // gdyby dwa ekrany odświeżyły się w tej samej chwili.
    }
  }

  return created;
}

/**
 * Uzupełnia zaległe miesiące przy starcie aplikacji: bieżący
 * oraz kilka poprzednich, gdyby aplikacja nie była używana przez jakiś czas.
 */
export async function catchUpRecurring(monthsBack = 3): Promise<number> {
  const current = currentYearMonth();
  let created = 0;

  for (let offset = monthsBack; offset >= 0; offset -= 1) {
    created += await ensureRecurringForMonth(addMonths(current, -offset));
  }

  return created;
}
