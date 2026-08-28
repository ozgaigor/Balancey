/**
 * Salda i rozliczenia między osobami.
 *
 * Wszystko liczymy względem właściciela telefonu ("Ja"). Saldo dodatnie
 * znaczy, że ktoś jest mi winien; ujemne — że to ja mam oddać. Dzięki temu
 * nie ma potrzeby liczenia grafu długów: każda osoba rozlicza się ze mną.
 */

import type { ISODate, Person, PersonBalance } from '../types';
import { formatMoney } from '../utils/currency';
import { todayISO } from '../utils/dates';
import { netBalance } from '../utils/split';
import { getMe, listPeople } from '../db/repositories/people';
import { loadRawBalances } from '../db/repositories/receipts';
import {
  createSettlement,
  listSettlements,
  sumSettlementsByPerson,
} from '../db/repositories/settlements';
import type { Settlement } from '../types';

/**
 * Salda ze wszystkimi osobami poza mną.
 * Zwraca pustą listę, gdy w bazie nie ma jeszcze właściciela telefonu.
 */
export async function loadBalances(): Promise<PersonBalance[]> {
  const me = await getMe();
  if (!me) return [];

  const [people, raw, settled] = await Promise.all([
    listPeople(),
    loadRawBalances(me.id),
    sumSettlementsByPerson(),
  ]);

  const rawById = new Map(raw.map((row) => [row.person_id, row]));
  const settledById = new Map(settled.map((row) => [row.person_id, row.total]));

  return people
    .filter((person) => person.id !== me.id)
    .map((person) => {
      const entry = rawById.get(person.id);
      const owesMe = entry?.owes_me ?? 0;
      const iOwe = entry?.i_owe ?? 0;
      const settledAmount = settledById.get(person.id) ?? 0;

      return {
        person,
        owesMe,
        iOwe,
        settled: settledAmount,
        balance: netBalance({
          personId: person.id,
          owesMe,
          iOwe,
          settled: settledAmount,
        }),
      };
    });
}

/** Saldo z jedną osobą. */
export async function loadBalance(personId: number): Promise<PersonBalance | null> {
  const balances = await loadBalances();
  return balances.find((entry) => entry.person.id === personId) ?? null;
}

export interface BalanceSummary {
  /** Łącznie do odzyskania od wszystkich osób. */
  toReceive: number;
  /** Łącznie do oddania. */
  toPay: number;
  /** Ile osób ma niezerowe saldo. */
  openCount: number;
}

/** Podsumowanie wszystkich sald — kafelek na ekranie rozliczeń. */
export function summarizeBalances(balances: PersonBalance[]): BalanceSummary {
  let toReceive = 0;
  let toPay = 0;
  let openCount = 0;

  for (const entry of balances) {
    if (entry.balance > 0) toReceive += entry.balance;
    else if (entry.balance < 0) toPay += -entry.balance;
    if (entry.balance !== 0) openCount += 1;
  }

  return { toReceive, toPay, openCount };
}

/**
 * Zapisuje rozliczenie z osobą. Dodatnia kwota = osoba mi oddała.
 * Rozliczenie nie tworzy transakcji w budżecie — wydatek został już
 * zaksięgowany w chwili zakupu, tu jedynie zamykamy dług.
 */
export async function settleWithPerson(
  personId: number,
  amount: number,
  date: ISODate = todayISO(),
  note?: string
): Promise<void> {
  if (amount === 0) return;
  await createSettlement({ personId, amount, date, note: note ?? null });
}

/** Rozlicza całe bieżące saldo z osobą jednym wpisem. */
export async function settleFully(personId: number, date: ISODate = todayISO()): Promise<number> {
  const balance = await loadBalance(personId);
  if (!balance || balance.balance === 0) return 0;

  await settleWithPerson(personId, balance.balance, date, 'Rozliczenie całości');
  return balance.balance;
}

/** Historia rozliczeń z osobą. */
export async function historyFor(personId: number): Promise<Settlement[]> {
  return listSettlements(personId);
}

/** Opis salda gotowy do pokazania na ekranie. */
export function describeBalance(entry: PersonBalance): string {
  if (entry.balance > 0) return `${entry.person.name} jest Ci winien(a) ${formatMoney(entry.balance)}`;
  if (entry.balance < 0) return `Jesteś winien(a) ${formatMoney(-entry.balance)}`;
  return 'Rozliczone';
}

/** Krótka etykieta salda — używana na liście osób. */
export function balanceLabel(balance: number): string {
  if (balance > 0) return `+${formatMoney(balance)}`;
  if (balance < 0) return `-${formatMoney(-balance)}`;
  return 'Rozliczone';
}

/** Osoba do wyświetlenia z jej kolorem — skrót używany w kilku miejscach. */
export function personInitials(person: Person): string {
  const parts = person.name.trim().split(/\s+/);
  if (parts.length === 0 || parts[0] === '') return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
