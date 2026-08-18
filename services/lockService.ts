/**
 * Blokada aplikacji kodem PIN (opcjonalna) oraz odblokowanie biometryczne.
 *
 * PIN nie jest nigdzie zapisywany w postaci jawnej — trzymamy wyłącznie
 * skrót SHA-256 z losową solą, w lokalnej bazie SQLite.
 */

import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';

import { getSettings, setSetting, deleteSetting } from '../db/repositories/settings';

export const PIN_LENGTH = 4;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function hashPin(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

/** Ustawia nowy PIN i włącza blokadę. */
export async function setPin(pin: string): Promise<void> {
  const salt = bytesToHex(await Crypto.getRandomBytesAsync(16));
  const hash = await hashPin(pin, salt);
  await setSetting('pin_salt', salt);
  await setSetting('pin_hash', hash);
  await setSetting('lock_enabled', true);
}

/** Sprawdza poprawność PIN-u. */
export async function verifyPin(pin: string): Promise<boolean> {
  const settings = await getSettings();
  if (!settings.pinHash || !settings.pinSalt) return false;
  const hash = await hashPin(pin, settings.pinSalt);
  return hash === settings.pinHash;
}

/** Wyłącza blokadę i usuwa zapisany PIN. */
export async function clearPin(): Promise<void> {
  await deleteSetting('pin_hash');
  await deleteSetting('pin_salt');
  await setSetting('lock_enabled', false);
  await setSetting('biometrics_enabled', false);
}

export async function isLockEnabled(): Promise<boolean> {
  const settings = await getSettings();
  return settings.lockEnabled && settings.pinHash != null;
}

export interface BiometricsStatus {
  available: boolean;
  enrolled: boolean;
  /** Nazwa metody do pokazania w interfejsie. */
  label: string;
}

/** Sprawdza, czy urządzenie obsługuje odcisk palca / Face ID. */
export async function getBiometricsStatus(): Promise<BiometricsStatus> {
  try {
    const [available, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);

    const hasFace = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
    const hasFingerprint = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);

    return {
      available,
      enrolled,
      label: hasFace ? 'Face ID' : hasFingerprint ? 'Odcisk palca' : 'Biometria',
    };
  } catch {
    return { available: false, enrolled: false, label: 'Biometria' };
  }
}

/** Uruchamia odblokowanie biometryczne. Zwraca true po udanym uwierzytelnieniu. */
export async function authenticateWithBiometrics(): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Odblokuj budżet',
      cancelLabel: 'Użyj PIN-u',
      disableDeviceFallback: true,
    });
    return result.success;
  } catch {
    return false;
  }
}
