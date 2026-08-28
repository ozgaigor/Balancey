/**
 * Zgadywanie kategorii dla pozycji paragonu. Nazwy w testach są zapisane
 * tak, jak drukują je kasy fiskalne — skrótami i wielkimi literami.
 */

import { guessCategory, guessCategoryForMerchant } from '../utils/itemCategories';

describe('guessCategory', () => {
  it('rozpoznaje produkty spożywcze', () => {
    expect(guessCategory('MLEKO UHT 3,2% 1L')).toBe('Jedzenie');
    expect(guessCategory('Chleb razowy')).toBe('Jedzenie');
    expect(guessCategory('Banany luz')).toBe('Jedzenie');
  });

  it('oddziela chemię i środki czystości od jedzenia', () => {
    expect(guessCategory('PLYN DO NACZYN LUDWIK')).toBe('Dom');
    expect(guessCategory('Papier toaletowy 8szt')).toBe('Dom');
    expect(guessCategory('Proszek do prania')).toBe('Dom');
  });

  it('rozpoznaje leki', () => {
    expect(guessCategory('IBUPROM 200mg')).toBe('Zdrowie');
    expect(guessCategory('Witamina D3')).toBe('Zdrowie');
  });

  it('rozpoznaje karmę dla zwierząt', () => {
    expect(guessCategory('KARMA DLA KOTA WHISKAS')).toBe('Zwierzęta');
    expect(guessCategory('Żwirek bentonitowy')).toBe('Zwierzęta');
  });

  it('rozpoznaje paliwo', () => {
    expect(guessCategory('PB95')).toBe('Transport');
    expect(guessCategory('Myjnia automatyczna')).toBe('Transport');
  });

  it('zwraca null, gdy nic nie pasuje', () => {
    expect(guessCategory('ARTYKUL 4712')).toBeNull();
    expect(guessCategory('')).toBeNull();
  });

  it('kategoria szczegółowa wygrywa z ogólną', () => {
    // "mydło" to Dom, mimo że reguła jedzenia jest dłuższa i bogatsza.
    expect(guessCategory('Mydło w płynie')).toBe('Dom');
  });
});

describe('guessCategoryForMerchant', () => {
  it('dobiera kategorię do rodzaju sklepu', () => {
    expect(guessCategoryForMerchant('Rossmann')).toBe('Zdrowie');
    expect(guessCategoryForMerchant('Orlen')).toBe('Transport');
    expect(guessCategoryForMerchant('Leroy Merlin')).toBe('Dom');
    expect(guessCategoryForMerchant('Decathlon')).toBe('Ubrania');
  });

  it('domyślnie zakłada zakupy spożywcze', () => {
    expect(guessCategoryForMerchant('Biedronka')).toBe('Jedzenie');
    expect(guessCategoryForMerchant('')).toBe('Jedzenie');
  });
});
