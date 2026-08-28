/**
 * Podział kwot między osoby. Najważniejsza własność, sprawdzana w każdym
 * teście: suma udziałów zawsze równa się dzielonej kwocie — ani grosza
 * nie wolno zgubić ani wyprodukować.
 */

import {
  balanceShares,
  balanceDirection,
  netBalance,
  rescaleShares,
  shareEvenly,
  splitByWeights,
  splitEvenly,
  sumSharesFor,
  unassignedAmount,
} from '../utils/split';

const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0);

describe('splitEvenly', () => {
  it('dzieli kwotę podzielną bez reszty', () => {
    expect(splitEvenly(1000, 4)).toEqual([250, 250, 250, 250]);
  });

  it('rozdziela nieparzyste grosze na pierwsze osoby', () => {
    expect(splitEvenly(1000, 3)).toEqual([334, 333, 333]);
  });

  it('nie gubi grosza przy żadnej liczbie osób', () => {
    for (let total = 0; total <= 500; total += 7) {
      for (let people = 1; people <= 9; people += 1) {
        expect(sum(splitEvenly(total, people))).toBe(total);
      }
    }
  });

  it('radzi sobie z kwotą mniejszą niż liczba osób', () => {
    expect(splitEvenly(2, 5)).toEqual([1, 1, 0, 0, 0]);
  });

  it('zwraca pustą listę, gdy nie ma komu przydzielić', () => {
    expect(splitEvenly(1000, 0)).toEqual([]);
  });

  it('zachowuje znak dla kwoty ujemnej', () => {
    expect(splitEvenly(-1000, 3)).toEqual([-334, -333, -333]);
  });
});

describe('splitByWeights', () => {
  it('dzieli proporcjonalnie do wag', () => {
    expect(splitByWeights(1000, [1, 1, 2])).toEqual([250, 250, 500]);
  });

  it('rozdziela resztę metodą największych reszt', () => {
    const parts = splitByWeights(1000, [1, 1, 1]);
    expect(sum(parts)).toBe(1000);
    expect(parts).toEqual([334, 333, 333]);
  });

  it('nie gubi grosza przy trudnych proporcjach', () => {
    const parts = splitByWeights(10000, [3, 5, 7, 11]);
    expect(sum(parts)).toBe(10000);
  });

  it('traktuje wagi ujemne jak zero', () => {
    expect(splitByWeights(1000, [1, -5, 1])).toEqual([500, 0, 500]);
  });

  it('przy samych zerowych wagach dzieli po równo', () => {
    expect(splitByWeights(900, [0, 0, 0])).toEqual([300, 300, 300]);
  });

  it('zwraca pustą listę dla pustych wag', () => {
    expect(splitByWeights(1000, [])).toEqual([]);
  });
});

describe('shareEvenly', () => {
  it('przypisuje udziały konkretnym osobom', () => {
    expect(shareEvenly(1000, [7, 8, 9])).toEqual([
      { personId: 7, amount: 334 },
      { personId: 8, amount: 333 },
      { personId: 9, amount: 333 },
    ]);
  });

  it('bez osób nie tworzy żadnych udziałów', () => {
    expect(shareEvenly(1000, [])).toEqual([]);
  });
});

describe('rescaleShares', () => {
  it('zachowuje proporcje po zmianie kwoty pozycji', () => {
    const shares = [
      { personId: 1, amount: 250 },
      { personId: 2, amount: 750 },
    ];
    const rescaled = rescaleShares(shares, 2000);
    expect(rescaled).toEqual([
      { personId: 1, amount: 500 },
      { personId: 2, amount: 1500 },
    ]);
    expect(sum(rescaled.map((share) => share.amount))).toBe(2000);
  });

  it('po zmianie kwoty suma nadal się zgadza mimo brzydkich proporcji', () => {
    const shares = [
      { personId: 1, amount: 333 },
      { personId: 2, amount: 333 },
      { personId: 3, amount: 334 },
    ];
    const rescaled = rescaleShares(shares, 999);
    expect(sum(rescaled.map((share) => share.amount))).toBe(999);
  });
});

describe('balanceShares', () => {
  it('dosypuje różnicę do ostatniego udziału', () => {
    const corrected = balanceShares(
      [
        { personId: 1, amount: 500 },
        { personId: 2, amount: 400 },
      ],
      1000
    );
    expect(corrected).toEqual([
      { personId: 1, amount: 500 },
      { personId: 2, amount: 500 },
    ]);
  });

  it('nie zmienia udziałów, gdy suma już jest poprawna', () => {
    const shares = [{ personId: 1, amount: 1000 }];
    expect(balanceShares(shares, 1000)).toBe(shares);
  });

  it('nie modyfikuje przekazanej tablicy', () => {
    const shares = [{ personId: 1, amount: 900 }];
    balanceShares(shares, 1000);
    expect(shares[0].amount).toBe(900);
  });
});

describe('sumSharesFor i unassignedAmount', () => {
  const shares = [
    { personId: 1, amount: 300 },
    { personId: 2, amount: 200 },
    { personId: 1, amount: 100 },
  ];

  it('sumuje udziały jednej osoby', () => {
    expect(sumSharesFor(shares, 1)).toBe(400);
    expect(sumSharesFor(shares, 3)).toBe(0);
  });

  it('pokazuje część nieprzypisaną do nikogo', () => {
    expect(unassignedAmount(1000, shares)).toBe(400);
    expect(unassignedAmount(600, shares)).toBe(0);
  });
});

describe('netBalance', () => {
  it('dodatnie saldo oznacza, że osoba jest mi winna', () => {
    expect(netBalance({ personId: 1, owesMe: 5000, iOwe: 0, settled: 0 })).toBe(5000);
  });

  it('rozliczenie zeruje dług', () => {
    expect(netBalance({ personId: 1, owesMe: 5000, iOwe: 0, settled: 5000 })).toBe(0);
  });

  it('uwzględnia paragony opłacone przez drugą osobę', () => {
    expect(netBalance({ personId: 1, owesMe: 2000, iOwe: 3000, settled: 0 })).toBe(-1000);
  });

  it('nazywa kierunek salda', () => {
    expect(balanceDirection(100)).toBe('owes-me');
    expect(balanceDirection(-100)).toBe('i-owe');
    expect(balanceDirection(0)).toBe('settled');
  });
});
