/**
 * Zgadywanie kategorii dla pojedynczej pozycji paragonu.
 *
 * Funkcja zwraca NAZWĘ kategorii domyślnej (z `DEFAULT_CATEGORIES`), a nie jej
 * identyfikator — dzięki temu logika pozostaje czysta i testowalna, a mapowanie
 * na wiersz w bazie robi warstwa serwisu.
 *
 * Słownik celowo operuje na rdzeniach słów ("mlek" zamiast "mleko"), bo nazwy
 * na paragonach są skracane i odmieniane: "MLEKO UHT 3,2%", "MLEKA WIEJSKIE".
 */

/** Nazwa kategorii domyślnej, do której trafia pozycja. */
export type GuessedCategory =
  | 'Jedzenie'
  | 'Dom'
  | 'Zdrowie'
  | 'Zwierzęta'
  | 'Ubrania'
  | 'Rozrywka'
  | 'Hobby'
  | 'Transport'
  | 'Zakupy';

/**
 * Kolejność ma znaczenie — pierwsze dopasowanie wygrywa.
 * Kategorie szczegółowe (chemia, leki) idą przed ogólnym jedzeniem,
 * bo "płyn do naczyń" nie powinien trafić do zakupów spożywczych.
 */
const RULES: { category: GuessedCategory; keywords: string[] }[] = [
  {
    category: 'Zdrowie',
    keywords: [
      'apteka', 'tabletk', 'ibupro', 'paraceta', 'apap', 'rutinos', 'witamin',
      'magnez', 'plaster', 'bandaz', 'bandaż', 'maswc', 'syrop na', 'aspiryn',
      'nurofen', 'gripex', 'strepsil', 'probiot', 'termometr', 'masc', 'maść',
    ],
  },
  {
    category: 'Zwierzęta',
    keywords: [
      'karma', 'whiskas', 'pedigree', 'felix', 'sheba', 'kitekat', 'zwirek',
      'żwirek', 'dla psa', 'dla kota', 'obroza', 'obroża', 'smakolyk', 'smakołyk',
    ],
  },
  {
    category: 'Dom',
    keywords: [
      'plyn do', 'płyn do', 'proszek', 'kapsulk', 'kapsułk', 'domestos', 'cif',
      'ajax', 'ludwik', 'papier toal', 'reczniki pap', 'ręczniki pap', 'chusteczk',
      'worki na', 'gabka', 'gąbka', 'sciereczk', 'ściereczk', 'odswiez', 'odśwież',
      'zarowk', 'żarówk', 'bateri', 'folia', 'sznurek', 'swieca', 'świeca',
      'mydlo', 'mydło', 'szampon', 'pasta do zeb', 'pasta do zęb', 'dezodor',
      'zel pod', 'żel pod', 'golen', 'goleni', 'podpask', 'tampon', 'pieluch',
    ],
  },
  {
    category: 'Transport',
    keywords: [
      'benzyn', 'diesel', 'on ', 'pb95', 'pb 95', 'pb98', 'lpg', 'paliwo',
      'myjnia', 'olej silnik', 'wycieracz', 'plyn do spryskiw', 'płyn do spryskiw',
      'bilet', 'parking', 'autostrad', 'winiet',
    ],
  },
  {
    category: 'Ubrania',
    keywords: [
      'koszul', 'spodni', 'sukienk', 'bluz', 'skarpet', 'majtk', 'bielizn',
      'kurtk', 'czapk', 'szalik', 'rekawicz', 'rękawicz', 'buty', 'obuwie', 'sweter',
    ],
  },
  {
    category: 'Rozrywka',
    keywords: [
      'kino', 'bilet do', 'gra ', 'konsol', 'ksiazk', 'książk', 'plyta', 'płyta',
      'subskryp', 'netflix', 'spotify', 'steam',
    ],
  },
  {
    category: 'Hobby',
    keywords: [
      'farb', 'pedzel', 'pędzel', 'blok rys', 'kredk', 'plastelin', 'klej',
      'nozyczk', 'nożyczk', 'zeszyt', 'dlugopis', 'długopis', 'notes',
    ],
  },
  {
    category: 'Jedzenie',
    keywords: [
      'mlek', 'chleb', 'buleczk', 'bułeczk', 'bulk', 'bułk', 'maslo', 'masło',
      'ser ', 'serek', 'twarog', 'twaróg', 'jogurt', 'kefir', 'smietan', 'śmietan',
      'jaj', 'jajk', 'szynk', 'kielbas', 'kiełbas', 'parow', 'boczek', 'schab',
      'kurczak', 'piers', 'pierś', 'mielone', 'ryba', 'losos', 'łosoś', 'tunczyk',
      'tuńczyk', 'makaron', 'ryz', 'ryż', 'kasza', 'maka', 'mąka', 'cukier',
      'sol ', 'sól ', 'olej', 'oliwa', 'ocet', 'ketchup', 'majonez', 'musztard',
      'przypraw', 'herbat', 'kaw', 'kakao', 'sok ', 'woda', 'napoj', 'napój',
      'cola', 'pepsi', 'piwo', 'wino', 'wodka', 'wódka', 'czekolad', 'baton',
      'ciastk', 'chips', 'paluszk', 'orzech', 'lody', 'jablk', 'jabłk', 'banan',
      'pomidor', 'ogorek', 'ogórek', 'ziemniak', 'cebul', 'marchew', 'salat',
      'sałat', 'papryk', 'cytryn', 'pomarancz', 'pomarańcz', 'winogron', 'truskaw',
      'pieczyw', 'dzem', 'dżem', 'miod', 'miód', 'platk', 'płatk', 'muesli',
      'konserw', 'zupa', 'pierog', 'pizza', 'kanapk', 'obiad', 'lunch',
    ],
  },
];

/**
 * Dopasowuje kategorię do nazwy pozycji. Zwraca null, gdy nic nie pasuje —
 * wtedy pozycja dziedziczy kategorię całego paragonu.
 */
export function guessCategory(itemName: string): GuessedCategory | null {
  const name = normalize(itemName);
  if (name === '') return null;

  for (const rule of RULES) {
    for (const keyword of rule.keywords) {
      if (name.includes(keyword)) return rule.category;
    }
  }

  return null;
}

/**
 * Kategoria domyślna dla całego paragonu na podstawie nazwy sklepu.
 * Używana, gdy pozycji nie udało się dopasować indywidualnie.
 */
export function guessCategoryForMerchant(merchant: string): GuessedCategory {
  const name = normalize(merchant);

  if (/rossmann|hebe|apteka/.test(name)) return 'Zdrowie';
  if (/orlen|shell|bp|circle|moya|lotos/.test(name)) return 'Transport';
  if (/leroy|castorama|obi|ikea|jysk/.test(name)) return 'Dom';
  if (/decathlon|pepco|zara|reserved|h&m|ccc/.test(name)) return 'Ubrania';
  if (/empik|media|saturn/.test(name)) return 'Rozrywka';

  return 'Jedzenie';
}

/** Sprowadza nazwę do postaci porównywalnej: małe litery, bez ogonków w kluczu. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}
