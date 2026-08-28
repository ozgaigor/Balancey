/**
 * Rozpoznawanie tekstu na zdjęciu paragonu — w całości NA URZĄDZENIU.
 *
 * Korzystamy z ML Kit (Google Play Services), który działa bez internetu.
 * Zdjęcie paragonu nigdy nie opuszcza telefonu — to ta sama zasada, na
 * której opiera się reszta aplikacji (patrz `db/database.ts`).
 *
 * Moduł natywny jest ładowany leniwie i opcjonalnie. Dzięki temu aplikacja
 * uruchomiona w Expo Go (gdzie modułów natywnych nie ma) nadal działa —
 * skanowanie zgłasza wtedy czytelny błąd, a użytkownik może dodać pozycje
 * ręcznie zamiast oglądać awarię.
 */

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** Kształt modułu ML Kit, z którego faktycznie korzystamy. */
interface TextRecognitionModule {
  recognize: (uri: string) => Promise<{ text: string }>;
}

let cachedModule: TextRecognitionModule | null | undefined;

/**
 * Zwraca moduł OCR albo null, gdy nie został wbudowany w aplikację.
 * Wynik jest zapamiętywany, żeby nie próbować importu przy każdym skanie.
 */
function loadModule(): TextRecognitionModule | null {
  if (cachedModule !== undefined) return cachedModule;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const imported = require('@react-native-ml-kit/text-recognition');
    const candidate = (imported?.default ?? imported) as TextRecognitionModule | undefined;
    cachedModule = typeof candidate?.recognize === 'function' ? candidate : null;
  } catch {
    cachedModule = null;
  }

  return cachedModule;
}

/** Czy skanowanie jest dostępne w tej wersji aplikacji. */
export function isOcrAvailable(): boolean {
  return loadModule() !== null;
}

export const OCR_UNAVAILABLE_MESSAGE =
  'Skanowanie wymaga pełnej wersji aplikacji (build z modułem rozpoznawania tekstu). ' +
  'Pozycje możesz na razie dodać ręcznie.';

/**
 * Szerokość, do której skalujemy zdjęcie przed rozpoznaniem.
 * Paragon jest wąski i wysoki — 1400 px wystarcza na czytelny druk,
 * a wyraźnie przyspiesza OCR w porównaniu z pełną rozdzielczością aparatu.
 */
const OCR_WIDTH = 1400;

/**
 * Przygotowuje zdjęcie do rozpoznania: skalowanie i kompresja.
 * Przy niepowodzeniu zwraca oryginalny plik — lepiej spróbować OCR
 * na większym zdjęciu niż przerwać cały skan.
 */
export async function prepareImage(uri: string): Promise<string> {
  try {
    const context = ImageManipulator.manipulate(uri).resize({ width: OCR_WIDTH });
    const image = await context.renderAsync();
    const result = await image.saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
    return result.uri;
  } catch {
    return uri;
  }
}

export interface OcrResult {
  /** Rozpoznany tekst, linia po linii. */
  text: string;
  /** Ścieżka do zdjęcia użytego do rozpoznania. */
  imageUri: string;
}

/**
 * Rozpoznaje tekst na zdjęciu paragonu.
 * Rzuca wyjątkiem z czytelnym komunikatem, gdy modułu OCR nie ma
 * albo gdy rozpoznawanie się nie powiodło.
 */
export async function recognizeReceipt(uri: string): Promise<OcrResult> {
  const module = loadModule();
  if (!module) {
    throw new Error(OCR_UNAVAILABLE_MESSAGE);
  }

  const imageUri = await prepareImage(uri);

  try {
    const result = await module.recognize(imageUri);
    return { text: result?.text ?? '', imageUri };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Nie udało się odczytać tekstu ze zdjęcia. ${detail}`);
  }
}
