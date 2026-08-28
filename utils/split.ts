/**
 * Podział kwot między osoby — czysta arytmetyka na liczbach całkowitych.
 * Bez Reacta i bez bazy danych, dzięki czemu całość jest pokryta testami.
 *
 * Zasada nadrzędna: suma udziałów ZAWSZE równa się dzielonej kwocie.
 * Nierówności wynikające z niepodzielności grosza rozdzielamy metodą
 * największych reszt — deterministycznie, więc ten sam podział zawsze
 * daje ten sam wynik.
 */

/**
 * Dzieli kwotę po równo na `count` części.
 * 1000 gr na 3 osoby -> [334, 333, 333] (suma nadal 1000).
 */
export function splitEvenly(total: number, count: number): number[] {
  if (count <= 0) return [];

  const safeTotal = Math.round(total);
  const negative = safeTotal < 0;
  const abs = Math.abs(safeTotal);

  const base = Math.floor(abs / count);
  const remainder = abs - base * count;

  const parts: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const value = base + (index < remainder ? 1 : 0);
    parts.push(negative ? -value : value);
  }
  return parts;
}

/**
 * Dzieli kwotę proporcjonalnie do wag (metoda największych reszt).
 * Wagi ujemne są traktowane jak zero. Gdy wszystkie wagi są zerowe,
 * podział jest równy — inaczej kwota by przepadła.
 */
export function splitByWeights(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];

  const safeWeights = weights.map((weight) => (weight > 0 ? Math.round(weight) : 0));
  const weightSum = safeWeights.reduce((acc, weight) => acc + weight, 0);
  if (weightSum === 0) return splitEvenly(total, weights.length);

  const safeTotal = Math.round(total);
  const negative = safeTotal < 0;
  const abs = Math.abs(safeTotal);

  // Część całkowita udziału oraz reszta z dzielenia — bez liczb zmiennoprzecinkowych.
  const parts = safeWeights.map((weight) => Math.floor((abs * weight) / weightSum));
  const remainders = safeWeights.map((weight) => (abs * weight) % weightSum);

  let left = abs - parts.reduce((acc, part) => acc + part, 0);

  // Największe reszty dostają dodatkowy grosz; przy remisie wygrywa
  // wcześniejsza pozycja, żeby wynik był powtarzalny.
  const order = remainders
    .map((remainder, index) => ({ remainder, index }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  for (const entry of order) {
    if (left <= 0) break;
    parts[entry.index] += 1;
    left -= 1;
  }

  return negative ? parts.map((part) => -part) : parts;
}

/** Udział jednej osoby w jednej pozycji. */
export interface ShareDraft {
  personId: number;
  amount: number;
}

/**
 * Rozdziela wartość pozycji na wskazane osoby po równo.
 * Zwraca puste udziały, gdy nikt nie jest przypisany — pozycja
 * zostaje wtedy "wspólna" i nie wchodzi do żadnego salda.
 */
export function shareEvenly(total: number, personIds: number[]): ShareDraft[] {
  const amounts = splitEvenly(total, personIds.length);
  return personIds.map((personId, index) => ({ personId, amount: amounts[index] }));
}

/**
 * Przelicza udziały po zmianie wartości pozycji, zachowując proporcje.
 * Używane, gdy użytkownik poprawia kwotę źle odczytaną przez OCR.
 */
export function rescaleShares(shares: ShareDraft[], newTotal: number): ShareDraft[] {
  if (shares.length === 0) return [];
  const amounts = splitByWeights(
    newTotal,
    shares.map((share) => share.amount)
  );
  return shares.map((share, index) => ({ personId: share.personId, amount: amounts[index] }));
}

/**
 * Koryguje udziały tak, aby ich suma zgadzała się z wartością pozycji.
 * Różnica trafia do ostatniego udziału — dzięki temu ręczna edycja
 * pojedynczej kwoty nigdy nie rozjeżdża sumy paragonu.
 */
export function balanceShares(shares: ShareDraft[], total: number): ShareDraft[] {
  if (shares.length === 0) return [];
  const sum = shares.reduce((acc, share) => acc + share.amount, 0);
  const difference = Math.round(total) - sum;
  if (difference === 0) return shares;

  const corrected = shares.map((share) => ({ ...share }));
  corrected[corrected.length - 1].amount += difference;
  return corrected;
}

/** Suma udziałów przypisanych do jednej osoby. */
export function sumSharesFor(shares: ShareDraft[], personId: number): number {
  return shares.reduce((acc, share) => (share.personId === personId ? acc + share.amount : acc), 0);
}

/**
 * Część kwoty nieprzypisana do nikogo — koszt wspólny paragonu.
 * Liczona jako wartość pozycji minus suma udziałów.
 */
export function unassignedAmount(total: number, shares: ShareDraft[]): number {
  const assigned = shares.reduce((acc, share) => acc + share.amount, 0);
  return Math.round(total) - assigned;
}

export interface BalanceEntry {
  personId: number;
  /** Udziały tej osoby na paragonach, które opłaciłem ja. */
  owesMe: number;
  /** Moje udziały na paragonach, które opłaciła ta osoba. */
  iOwe: number;
  /** Suma zapisanych rozliczeń (dodatnia = osoba mi oddała). */
  settled: number;
}

/**
 * Saldo z osobą: dodatnie oznacza, że osoba jest mi winna,
 * ujemne — że to ja mam jej oddać.
 */
export function netBalance(entry: BalanceEntry): number {
  return entry.owesMe - entry.iOwe - entry.settled;
}

/** Opis salda w języku naturalnym — używany na liście osób. */
export function balanceDirection(balance: number): 'owes-me' | 'i-owe' | 'settled' {
  if (balance > 0) return 'owes-me';
  if (balance < 0) return 'i-owe';
  return 'settled';
}
