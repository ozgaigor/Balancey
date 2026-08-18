import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, font, radius, spacing } from '../theme';
import { PIN_LENGTH } from '../services/lockService';

interface PinPadProps {
  title: string;
  subtitle?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  /** Dodatkowa akcja pod klawiaturą (np. odblokowanie biometryczne). */
  footer?: React.ReactNode;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;

/** Klawiatura PIN z kropkami postępu — używana przy blokadzie i jej konfiguracji. */
export function PinPad({ title, subtitle, value, onChange, error, footer }: PinPadProps) {
  const press = useCallback(
    (key: string) => {
      if (Platform.OS !== 'web') {
        Haptics.selectionAsync().catch(() => undefined);
      }
      if (key === 'del') {
        onChange(value.slice(0, -1));
        return;
      }
      if (key === '') return;
      if (value.length >= PIN_LENGTH) return;
      onChange(value + key);
    },
    [onChange, value]
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

      <View style={styles.dots}>
        {Array.from({ length: PIN_LENGTH }).map((_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              index < value.length && styles.dotFilled,
              error ? styles.dotError : null,
            ]}
          />
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : <View style={styles.errorSpacer} />}

      <View style={styles.grid}>
        {KEYS.map((key, index) => (
          <Pressable
            key={`${key}-${index}`}
            accessibilityRole="button"
            accessibilityLabel={key === 'del' ? 'Usuń cyfrę' : key === '' ? '' : `Cyfra ${key}`}
            disabled={key === ''}
            onPress={() => press(key)}
            style={({ pressed }) => [
              styles.key,
              key === '' && styles.keyEmpty,
              pressed && key !== '' && styles.pressed,
            ]}
          >
            {key === 'del' ? (
              <Ionicons name="backspace-outline" size={24} color={colors.text} />
            ) : (
              <Text style={styles.keyLabel}>{key}</Text>
            )}
          </Pressable>
        ))}
      </View>

      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: spacing.md, width: '100%' },
  title: { color: colors.text, fontSize: font.h2, fontWeight: '700', textAlign: 'center' },
  subtitle: { color: colors.textMuted, fontSize: font.small, textAlign: 'center' },
  dots: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.surfaceStrong,
  },
  dotFilled: { backgroundColor: colors.accent, borderColor: colors.accent },
  dotError: { borderColor: colors.danger },
  error: { color: colors.danger, fontSize: font.small, fontWeight: '600', minHeight: 20 },
  errorSpacer: { height: 20 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'center',
    maxWidth: 300,
  },
  key: {
    width: 84,
    height: 68,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyEmpty: { backgroundColor: 'transparent' },
  pressed: { backgroundColor: colors.surfaceStrong },
  keyLabel: { color: colors.text, fontSize: 24, fontWeight: '600' },
});
