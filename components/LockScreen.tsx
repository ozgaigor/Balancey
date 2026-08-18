import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, font, radius, spacing } from '../theme';
import { useApp } from '../state/AppProvider';
import {
  PIN_LENGTH,
  authenticateWithBiometrics,
  getBiometricsStatus,
  verifyPin,
} from '../services/lockService';
import { PinPad } from './PinPad';

/** Ekran blokady pokazywany przed dostępem do danych finansowych. */
export function LockScreen() {
  const insets = useSafeAreaInsets();
  const { settings, setUnlocked } = useApp();

  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [biometricsLabel, setBiometricsLabel] = useState<string | null>(null);

  const tryBiometrics = useCallback(async () => {
    const success = await authenticateWithBiometrics();
    if (success) setUnlocked(true);
  }, [setUnlocked]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!settings.biometricsEnabled) return;
      const status = await getBiometricsStatus();
      if (cancelled || !status.available || !status.enrolled) return;
      setBiometricsLabel(status.label);
      await tryBiometrics();
    })();
    return () => {
      cancelled = true;
    };
  }, [settings.biometricsEnabled, tryBiometrics]);

  useEffect(() => {
    if (pin.length !== PIN_LENGTH) return;

    let cancelled = false;
    (async () => {
      const valid = await verifyPin(pin);
      if (cancelled) return;
      if (valid) {
        setUnlocked(true);
      } else {
        setError('Nieprawidłowy PIN');
        setPin('');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pin, setUnlocked]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.lg }]}>
      <View style={styles.logo}>
        <Ionicons name="lock-closed" size={26} color={colors.accent} />
      </View>

      <PinPad
        title="Budżet domowy"
        subtitle="Wpisz kod PIN, aby odblokować"
        value={pin}
        onChange={(value) => {
          setError(null);
          setPin(value);
        }}
        error={error}
        footer={
          biometricsLabel ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Odblokuj: ${biometricsLabel}`}
              onPress={tryBiometrics}
              style={({ pressed }) => [styles.biometrics, pressed && styles.pressed]}
            >
              <Ionicons name="finger-print-outline" size={20} color={colors.accent} />
              <Text style={styles.biometricsText}>Odblokuj: {biometricsLabel}</Text>
            </Pressable>
          ) : null
        }
      />

      <Text style={styles.footerNote}>Dane pozostają wyłącznie na tym urządzeniu.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    zIndex: 200,
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  biometrics: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    marginTop: spacing.sm,
  },
  biometricsText: { color: colors.accent, fontSize: font.small, fontWeight: '700' },
  pressed: { opacity: 0.7 },
  footerNote: { color: colors.textFaint, fontSize: font.tiny, textAlign: 'center' },
});
