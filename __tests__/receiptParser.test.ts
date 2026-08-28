/**
 * Parser paragonów. Testy operują na tekście w takiej postaci, w jakiej
 * zwraca go rozpoznawanie tekstu na urządzeniu — łącznie z typowymi
 * błędami OCR (litera O zamiast zera, rozjechane spacje).
 */

import {
  detectDate,
  detectMerchant,
  detectTotal,
  parseGrosze,
  parseQuantity,
  parseReceipt,
  repairDigits,
} from '../utils/receiptParser';

const BIEDRONKA = `
BIEDRONKA CODZIENNIE NISKIE CENY
JERONIMO MARTINS POLSKA S.A.
UL. ZNANIECKIEGO 9, KOSTRZYN
NIP 779-10-11-327
2026-08-17 17:42
PARAGON FISKALNY
Mleko UHT 3,2% 1L 2 x 3,49 6,98 B
Chleb razowy 1 x 4,20 4,20 B
Banany luz 0,432 x 6,99 3,02 C
Papier toaletowy 1 x 12,99 12,99 A
SPRZEDAZ OPODATK. B 11,18
PTU B 8% 0,83
SUMA PLN 27,19
`;

const LIDL_DWIE_LINIE = `
LIDL SP. Z O.O. SP. K.
NIP 781-18-97-358
PARAGON FISKALNY
Ser gouda plastry
1 x 8,99 8,99 B
Pomidory malinowe
0,650 x 12,99 8,44 C
SUMA PLN 17,43
`;

describe('parseGrosze', () => {
  it('czyta zwykłą kwotę z przecinkiem', () => {
    expect(parseGrosze('3,49')).toBe(349);
  });

  it('czyta kwotę z kropką dziesiętną', () => {
    expect(parseGrosze('3.49')).toBe(349);
  });

  it('czyta kwotę z separatorem tysięcy', () => {
    expect(parseGrosze('1 234,56')).toBe(123456);
    expect(parseGrosze('1.234,56')).toBe(123456);
  });

  it('traktuje trzy cyfry po kropce jak separator tysięcy', () => {
    expect(parseGrosze('1.500')).toBe(150000);
  });

  it('naprawia literę O wstawioną przez OCR zamiast zera', () => {
    expect(parseGrosze('1O,OO')).toBe(1000);
  });

  it('odrzuca tekst, który nie jest kwotą', () => {
    expect(parseGrosze('SUMA')).toBeNull();
    expect(parseGrosze('')).toBeNull();
  });
});

describe('parseQuantity', () => {
  it('czyta sztuki', () => {
    expect(parseQuantity('2')).toBe(2000);
  });

  it('czyta wagę z dokładnością do grama', () => {
    expect(parseQuantity('0,432')).toBe(432);
    expect(parseQuantity('1,000')).toBe(1000);
  });

  it('zwraca jedną sztukę dla śmieciowego wejścia', () => {
    expect(parseQuantity('')).toBe(1000);
  });
});

describe('repairDigits', () => {
  it('poprawia tylko tokeny wyglądające na liczby', () => {
    expect(repairDigits('1O,OO')).toBe('10,00');
    expect(repairDigits('Mleko')).toBe('Mleko');
  });

  it('nie rusza tekstu bez cyfr', () => {
    expect(repairDigits('SUMA')).toBe('SUMA');
  });
});

describe('detectMerchant', () => {
  it('rozpoznaje sieć po nagłówku', () => {
    expect(detectMerchant(['BIEDRONKA CODZIENNIE NISKIE CENY'])).toBe('Biedronka');
    expect(detectMerchant(['JERONIMO MARTINS POLSKA S.A.'])).toBe('Biedronka');
    expect(detectMerchant(['LIDL SP. Z O.O.'])).toBe('Lidl');
  });

  it('dla nieznanego sklepu bierze pierwszą sensowną linię', () => {
    expect(detectMerchant(['SKLEP SPOZYWCZY U ANI', 'NIP 123-456-78-90'])).toBe(
      'Sklep Spozywczy U Ani'
    );
  });

  it('zwraca pusty tekst, gdy nagłówek to same numery', () => {
    expect(detectMerchant(['1234567890', 'NIP 123-456-78-90'])).toBe('');
  });
});

describe('detectDate', () => {
  it('czyta datę w formacie ISO', () => {
    expect(detectDate(['2026-08-17 17:42'])).toBe('2026-08-17');
  });

  it('czyta datę w formacie polskim', () => {
    expect(detectDate(['17.08.2026 17:42'])).toBe('2026-08-17');
  });

  it('pomija liczby, które nie są datą', () => {
    expect(detectDate(['NIP 779-10-11-327'])).toBeNull();
  });
});

describe('detectTotal', () => {
  it('czyta sumę paragonu', () => {
    expect(detectTotal(['SUMA PLN 27,19'])).toBe(2719);
  });

  it('nie myli sumy z wierszem PTU ani sprzedażą opodatkowaną', () => {
    expect(detectTotal(['SPRZEDAZ OPODATK. B 11,18', 'PTU B 8% 0,83'])).toBeNull();
  });

  it('akceptuje "RAZEM" jako sumę', () => {
    expect(detectTotal(['RAZEM 42,50'])).toBe(4250);
  });
});

describe('parseReceipt — paragon z Biedronki', () => {
  const parsed = parseReceipt(BIEDRONKA);

  it('rozpoznaje sklep, datę i sumę', () => {
    expect(parsed.merchant).toBe('Biedronka');
    expect(parsed.date).toBe('2026-08-17');
    expect(parsed.total).toBe(2719);
  });

  it('czyta wszystkie pozycje', () => {
    expect(parsed.items).toHaveLength(4);
    expect(parsed.items[0]).toMatchObject({
      name: 'Mleko UHT 3,2% 1L',
      quantity: 2000,
      unitPrice: 349,
      total: 698,
      taxRate: 'B',
    });
  });

  it('czyta pozycję ważoną', () => {
    expect(parsed.items[2]).toMatchObject({
      name: 'Banany luz',
      quantity: 432,
      unitPrice: 699,
      total: 302,
    });
  });

  it('pozycje sumują się do sumy z paragonu', () => {
    expect(parsed.itemsTotal).toBe(2719);
    expect(parsed.mismatch).toBe(0);
    expect(parsed.confidence).toBe('high');
  });

  it('nie zatrzymuje się na wierszach podatkowych', () => {
    const names = parsed.items.map((item) => item.name);
    expect(names.some((name) => /SPRZEDAZ|PTU|SUMA/i.test(name))).toBe(false);
  });
});

describe('parseReceipt — nazwa i cena w osobnych liniach', () => {
  const parsed = parseReceipt(LIDL_DWIE_LINIE);

  it('skleja nazwę z linii wyżej z ceną z linii niżej', () => {
    expect(parsed.merchant).toBe('Lidl');
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]).toMatchObject({ name: 'Ser gouda plastry', total: 899 });
    expect(parsed.items[1]).toMatchObject({
      name: 'Pomidory malinowe',
      quantity: 650,
      total: 844,
    });
  });

  it('zgadza się z sumą paragonu', () => {
    expect(parsed.itemsTotal).toBe(1743);
    expect(parsed.confidence).toBe('high');
  });
});

describe('parseReceipt — sytuacje awaryjne', () => {
  it('rabat obniża poprzednią pozycję zamiast tworzyć nową', () => {
    const parsed = parseReceipt(
      ['PARAGON FISKALNY', 'Kawa mielona 1 x 24,99 24,99 B', 'RABAT -5,00', 'SUMA PLN 19,99'].join(
        '\n'
      )
    );
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].total).toBe(1999);
    expect(parsed.mismatch).toBe(0);
  });

  it('pusty tekst daje wynik o niskiej pewności, a nie wyjątek', () => {
    const parsed = parseReceipt('');
    expect(parsed.items).toEqual([]);
    expect(parsed.confidence).toBe('low');
    expect(parsed.warnings.length).toBeGreaterThan(0);
  });

  it('sygnalizuje rozjazd sumy pozycji z sumą paragonu', () => {
    const parsed = parseReceipt(
      ['PARAGON FISKALNY', 'Chleb 1 x 4,20 4,20 B', 'SUMA PLN 9,99'].join('\n')
    );
    expect(parsed.mismatch).toBe(579);
    expect(parsed.warnings.some((warning) => /różni się/.test(warning))).toBe(true);
  });

  it('radzi sobie z paragonem bez nagłówka PARAGON FISKALNY', () => {
    const parsed = parseReceipt(['Zabka', 'Hot dog 1 x 7,99 7,99 A', 'SUMA PLN 7,99'].join('\n'));
    expect(parsed.merchant).toBe('Żabka');
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].total).toBe(799);
  });
});
