/**
 * Parser paragonów fiskalnych — zamienia surowy tekst z OCR na listę pozycji.
 *
 * Cała logika jest czysta (bez OCR, bez Reacta, bez bazy), dzięki czemu można
 * ją w całości pokryć testami na prawdziwych paragonach. Rozpoznawanie tekstu
 * odbywa się osobno, na urządzeniu — patrz `services/ocrService.ts`.
 *
 * Wszystkie kwoty wynikowe są w GROSZACH, ilości w tysięcznych częściach
 * jednostki (0,432 kg -> 432), zgodnie z `QUANTITY_SCALE` z types/index.ts.
 */

import type { ISODate } from '../types';

export interface ParsedItem {
  name: string;
  /** Ilość × 1000. */
  quantity: number;
  /** Cena jednostkowa w groszach. */
  unitPrice: number;
  /** Wartość pozycji w groszach. */
  total: number;
  /** Litera stawki VAT z paragonu (A-G), o ile była widoczna. */
  taxRate: string | null;
  /** Linia źródłowa — pokazywana przy ręcznej korekcie. */
  source: string;
}

export type ParseConfidence = 'high' | 'medium' | 'low';

export interface ParsedReceipt {
  merchant: string;
  date: ISODate | null;
  /** Suma odczytana z linii "SUMA PLN" (null, gdy nie znaleziono). */
  total: number | null;
  items: ParsedItem[];
  /** Suma wartości rozpoznanych pozycji. */
  itemsTotal: number;
  /** Różnica `total - itemsTotal`; null, gdy brak sumy do porównania. */
  mismatch: number | null;
  confidence: ParseConfidence;
  /** Komunikaty dla użytkownika: czego parser nie był pewien. */
  warnings: string[];
}

/** Sieci handlowe rozpoznawane po nagłówku paragonu. */
const KNOWN_MERCHANTS: { key: string; name: string }[] = [
  { key: 'biedronka', name: 'Biedronka' },
  { key: 'jeronimomartins', name: 'Biedronka' },
  { key: 'lidl', name: 'Lidl' },
  { key: 'kaufland', name: 'Kaufland' },
  { key: 'auchan', name: 'Auchan' },
  { key: 'carrefour', name: 'Carrefour' },
  { key: 'zabka', name: 'Żabka' },
  { key: 'żabka', name: 'Żabka' },
  { key: 'dino', name: 'Dino' },
  { key: 'netto', name: 'Netto' },
  { key: 'stokrotka', name: 'Stokrotka' },
  { key: 'aldi', name: 'Aldi' },
  { key: 'polomarket', name: 'POLOmarket' },
  { key: 'intermarche', name: 'Intermarché' },
  { key: 'selgros', name: 'Selgros' },
  { key: 'makro', name: 'Makro' },
  { key: 'rossmann', name: 'Rossmann' },
  { key: 'hebe', name: 'Hebe' },
  { key: 'empik', name: 'Empik' },
  { key: 'mediaexpert', name: 'Media Expert' },
  { key: 'mediamarkt', name: 'Media Markt' },
  { key: 'leroymerlin', name: 'Leroy Merlin' },
  { key: 'castorama', name: 'Castorama' },
  { key: 'ikea', name: 'IKEA' },
  { key: 'decathlon', name: 'Decathlon' },
  { key: 'pepco', name: 'Pepco' },
  { key: 'orlen', name: 'Orlen' },
  { key: 'circlek', name: 'Circle K' },
  { key: 'shell', name: 'Shell' },
  { key: 'apteka', name: 'Apteka' },
  { key: 'mcdonald', name: 'McDonald’s' },
  { key: 'kfc', name: 'KFC' },
];

/** Linia, po której kończy się lista produktów. */
const END_MARKERS =
  /^(sprzedaz|sprzedaż|suma|razem|podsuma|ptu|opodatk|rozliczenie|gotowka|gotówka|karta|platnosc|płatność|reszta|do zaplaty|do zapłaty|zaplacono|zapłacono|nr sys|nr wydr|kasjer|nip|paragon nr)/i;

/**
 * Linie, które nigdy nie są produktem.
 * Uwaga: nie ma tu słowa "sklep" — bywa początkiem nazwy ("Sklep spożywczy u Ani").
 */
const NOISE = /^(paragon|nip|ul\.|al\.|tel\.|www|nr\s|kasa|kasjer|adres|dziekujemy|dziękujemy|zapraszamy)/i;

/** Rabaty i obniżki doliczane do poprzedniej pozycji. */
const DISCOUNT = /(rabat|opust|obnizka|obniżka|promocja)/i;

/** Początek listy produktów. */
const START_MARKER = /paragon\s*fiskalny/i;

/**
 * Naprawia typowe pomyłki OCR w tokenach liczbowych: O->0, l/I->1, S->5, B->8.
 * Zamiana zachodzi tylko wtedy, gdy token i tak wygląda na liczbę — nazwy
 * produktów pozostają nietknięte.
 */
export function repairDigits(token: string): string {
  if (!/\d/.test(token)) return token;
  if (!/^[\dOoIlSsBb ,. ]+$/.test(token)) return token;
  return token
    .replace(/[Oo]/g, '0')
    .replace(/[Il]/g, '1')
    .replace(/[Ss]/g, '5')
    .replace(/[Bb]/g, '8');
}

/**
 * Zamienia zapis kwoty na grosze. Obsługuje "3,49", "3.49", "1 234,56",
 * "1.234,56". Zwraca null dla tekstu, który nie jest kwotą.
 */
export function parseGrosze(text: string): number | null {
  const cleaned = repairDigits(text).replace(/[\s ]/g, '');
  if (!/^\d/.test(cleaned)) return null;

  const separator = Math.max(cleaned.lastIndexOf(','), cleaned.lastIndexOf('.'));

  let whole: string;
  let fraction: string;

  if (separator === -1) {
    whole = cleaned;
    fraction = '00';
  } else {
    const head = cleaned.slice(0, separator);
    const tail = cleaned.slice(separator + 1);
    // Trzy cyfry po ostatnim separatorze i brak innych separatorów wcześniej
    // oznaczają separator tysięcy ("1.500"), a nie część dziesiętną.
    if (tail.length === 3 && !/[,.]/.test(head)) {
      whole = cleaned.replace(/[,.]/g, '');
      fraction = '00';
    } else {
      whole = head.replace(/[,.]/g, '');
      fraction = tail;
    }
  }

  if (!/^\d+$/.test(whole)) return null;
  if (!/^\d*$/.test(fraction)) return null;

  const zloty = Number.parseInt(whole, 10);
  const cents = Number.parseInt(fraction.slice(0, 2).padEnd(2, '0') || '0', 10);
  if (!Number.isFinite(zloty) || !Number.isFinite(cents)) return null;

  return zloty * 100 + cents;
}

/** Zamienia ilość ("2", "0,432", "1,000") na tysięczne części jednostki. */
export function parseQuantity(text: string): number {
  const cleaned = repairDigits(text).replace(/[\s ]/g, '').replace('.', ',');
  const [whole, fraction = ''] = cleaned.split(',');
  const wholeValue = Number.parseInt(whole || '0', 10);
  if (!Number.isFinite(wholeValue)) return 1000;
  const fractionValue = Number.parseInt(fraction.slice(0, 3).padEnd(3, '0') || '0', 10);
  const quantity = wholeValue * 1000 + (Number.isFinite(fractionValue) ? fractionValue : 0);
  return quantity > 0 ? quantity : 1000;
}

/** Kwota w formacie paragonowym — zawsze z dwoma miejscami po przecinku. */
const AMOUNT = '\\d{1,3}(?:[ .\\u00A0]\\d{3})*[,.]\\d{2}';
/** Ilość: liczba całkowita lub z częścią ułamkową (waga). */
const QUANTITY = '\\d+(?:[,.]\\d{1,3})?';

const QTY_PRICE_RE = new RegExp('(' + QUANTITY + ')\\s*[xX*×]\\s*(' + AMOUNT + ')');
const TRAILING_AMOUNT_RE = new RegExp('(' + AMOUNT + ')\\s*([A-G])?\\s*$');
const ANY_AMOUNT_RE = new RegExp(AMOUNT, 'g');
const DATE_ISO_RE = /(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})/;
const DATE_PL_RE = /(\d{1,2})[-.\/](\d{1,2})[-.\/](\d{4})/;

/** Dzieli tekst na znaczące linie. */
function toLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/ /g, ' ').replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);
}

/** Rozpoznaje sklep po nagłówku paragonu. */
export function detectMerchant(lines: string[]): string {
  const header = lines.slice(0, 8);

  for (const line of header) {
    const key = line.toLowerCase().replace(/[^a-ząćęłńóśźż]/g, '');
    for (const merchant of KNOWN_MERCHANTS) {
      if (key.includes(merchant.key)) return merchant.name;
    }
  }

  // Brak znanej sieci — bierzemy pierwszą sensowną linię nagłówka.
  for (const line of header) {
    if (NOISE.test(line)) continue;
    if (/\d{2,}/.test(line)) continue;
    if (line.length < 3) continue;
    return titleCase(line);
  }

  return '';
}

function titleCase(text: string): string {
  return text
    .toLowerCase()
    .split(' ')
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ')
    .trim();
}

/** Szuka daty sprzedaży w dowolnym miejscu paragonu. */
export function detectDate(lines: string[]): ISODate | null {
  for (const line of lines) {
    const iso = DATE_ISO_RE.exec(line);
    if (iso) {
      const candidate = `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
      if (isPlausibleDate(candidate)) return candidate;
    }

    const pl = DATE_PL_RE.exec(line);
    if (pl) {
      const candidate = `${pl[3]}-${pl[2].padStart(2, '0')}-${pl[1].padStart(2, '0')}`;
      if (isPlausibleDate(candidate)) return candidate;
    }
  }
  return null;
}

function isPlausibleDate(iso: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return false;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  return year >= 2000 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

/** Szuka sumy paragonu ("SUMA PLN 42,50"). */
export function detectTotal(lines: string[]): number | null {
  const patterns = [/suma/i, /razem/i, /do\s*zap[lł]aty/i];

  for (const pattern of patterns) {
    for (const line of lines) {
      if (!pattern.test(line)) continue;
      // "SPRZEDAŻ OPODATK. B" i wiersze PTU to sumy cząstkowe, nie całość.
      if (/ptu|opodatk|sprzeda/i.test(line)) continue;
      const amounts = line.match(ANY_AMOUNT_RE);
      if (amounts && amounts.length > 0) {
        const value = parseGrosze(amounts[amounts.length - 1]);
        if (value != null && value > 0) return value;
      }
    }
  }
  return null;
}

/** Czyści nazwę produktu z resztek kodów i znaków interpunkcyjnych. */
function cleanName(raw: string): string {
  return raw
    .replace(/^\d{4,}\s*/, '') // kod towaru na początku linii
    .replace(/[|*_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\s.,;:-]+$/, '')
    .trim();
}

/**
 * Wyodrębnia listę produktów z linii paragonu.
 * Radzi sobie z pozycjami zapisanymi w jednej linii oraz z nazwą i ceną
 * rozbitymi na dwie linie.
 */
function extractItems(lines: string[], warnings: string[]): ParsedItem[] {
  const items: ParsedItem[] = [];
  let pendingName = '';

  for (const line of lines) {
    if (NOISE.test(line)) {
      pendingName = '';
      continue;
    }

    // Rabat obniża ostatnio dodaną pozycję zamiast tworzyć nową.
    if (DISCOUNT.test(line)) {
      const amounts = line.match(ANY_AMOUNT_RE);
      const value = amounts ? parseGrosze(amounts[amounts.length - 1]) : null;
      if (value != null && items.length > 0) {
        const last = items[items.length - 1];
        last.total = Math.max(0, last.total - value);
      }
      pendingName = '';
      continue;
    }

    const qtyPrice = QTY_PRICE_RE.exec(line);

    if (qtyPrice) {
      const quantity = parseQuantity(qtyPrice[1]);
      const unitPrice = parseGrosze(qtyPrice[2]) ?? 0;

      const beforeMatch = line.slice(0, qtyPrice.index).trim();
      const afterMatch = line.slice(qtyPrice.index + qtyPrice[0].length).trim();

      const tail = TRAILING_AMOUNT_RE.exec(afterMatch);
      const total = (tail ? parseGrosze(tail[1]) : null) ?? Math.round((quantity * unitPrice) / 1000);

      const name = cleanName(beforeMatch !== '' ? beforeMatch : pendingName);
      pendingName = '';

      if (name === '') {
        warnings.push(`Pozycja bez nazwy: „${line}”`);
      }

      items.push({
        name: name || 'Pozycja',
        quantity,
        unitPrice,
        total,
        taxRate: tail?.[2] ?? null,
        source: line,
      });
      continue;
    }

    const trailing = TRAILING_AMOUNT_RE.exec(line);

    if (trailing) {
      const total = parseGrosze(trailing[1]);
      const name = cleanName(line.slice(0, trailing.index));

      if (total != null && (name !== '' || pendingName !== '')) {
        const finalName = cleanName(name !== '' ? name : pendingName);
        pendingName = '';
        items.push({
          name: finalName || 'Pozycja',
          quantity: 1000,
          unitPrice: total,
          total,
          taxRate: trailing[2] ?? null,
          source: line,
        });
        continue;
      }
    }

    // Linia bez kwoty — prawdopodobnie nazwa produktu, której cena jest niżej.
    if (line.length >= 2 && !/^\d+$/.test(line)) {
      pendingName = line;
    }
  }

  return items;
}

/** Wycina z paragonu fragment zawierający produkty. */
function itemRegion(lines: string[]): string[] {
  let start = 0;
  for (let index = 0; index < lines.length; index += 1) {
    if (START_MARKER.test(lines[index])) {
      start = index + 1;
      break;
    }
  }

  let end = lines.length;
  for (let index = start; index < lines.length; index += 1) {
    if (END_MARKERS.test(lines[index])) {
      end = index;
      break;
    }
  }

  return lines.slice(start, end);
}

/**
 * Główna funkcja parsera: surowy tekst OCR -> gotowy paragon.
 * Zawsze zwraca wynik; przy słabym rozpoznaniu lista pozycji może być pusta,
 * a `warnings` mówi użytkownikowi, co trzeba poprawić ręcznie.
 */
export function parseReceipt(rawText: string): ParsedReceipt {
  const warnings: string[] = [];
  const lines = toLines(rawText);

  if (lines.length === 0) {
    return {
      merchant: '',
      date: null,
      total: null,
      items: [],
      itemsTotal: 0,
      mismatch: null,
      confidence: 'low',
      warnings: ['Nie rozpoznano żadnego tekstu na zdjęciu.'],
    };
  }

  const merchant = detectMerchant(lines);
  const date = detectDate(lines);
  const total = detectTotal(lines);
  const items = extractItems(itemRegion(lines), warnings);
  const itemsTotal = items.reduce((acc, item) => acc + item.total, 0);
  const mismatch = total != null ? total - itemsTotal : null;

  if (items.length === 0) {
    warnings.push('Nie udało się odczytać pozycji — dopisz je ręcznie.');
  }
  if (total == null) {
    warnings.push('Nie znaleziono sumy paragonu.');
  }
  if (mismatch != null && mismatch !== 0) {
    warnings.push('Suma pozycji różni się od sumy z paragonu — sprawdź kwoty.');
  }
  if (date == null) {
    warnings.push('Nie znaleziono daty — użyto dzisiejszej.');
  }

  return {
    merchant,
    date,
    total,
    items,
    itemsTotal,
    mismatch,
    confidence: rateConfidence(items.length, total, mismatch),
    warnings,
  };
}

/**
 * Ocena jakości odczytu. "high" tylko wtedy, gdy pozycje sumują się
 * dokładnie do sumy z paragonu — wtedy kwotom można ufać bez sprawdzania.
 */
function rateConfidence(
  itemCount: number,
  total: number | null,
  mismatch: number | null
): ParseConfidence {
  if (itemCount === 0) return 'low';
  if (total != null && mismatch === 0) return 'high';
  if (total == null) return 'medium';
  // Rozjazd do 2% sumy traktujemy jako drobiazg do ręcznej poprawki.
  if (Math.abs(mismatch ?? 0) * 50 <= total) return 'medium';
  return 'low';
}
