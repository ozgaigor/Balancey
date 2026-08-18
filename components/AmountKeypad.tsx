import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, font, radius, spacing } from '../theme';

interface AmountKeypadProps {
  /** Wpisane cyfry, gdzie dwie ostatnie to grosze ("4250" = 42,50). */
  digits: string;
  onChange: (digits: string) => void;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del'] as const;

/**
 * Klawiatura numeryczna widoczna od razu po otwarciu formularza.
 * Własna klawiatura (zamiast systemowej) daje duże pola dotykowe
 * i zawsze poprawny format kwoty.
 */
export function AmountKeypad({ digits, onChange }: AmountKeypadProps) {
  const tap = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => undefined);
    }
  }, []);

  const handlePress = useCallback(
    (key: string) => {
      tap();
      if (key === 'del') {
        onChange(digits.slice(0, -1));
        return;
      }
      const next = `${digits}${key}`.replace(/^0+(?=\d)/, '');
      // Maksymalnie 9 cyfr = 9 999 999,99 zł — więcej nie jest potrzebne.
      if (next.replace(/\D/g, '').length > 9) return;
      onChange(next);
    },
    [digits, onChange, tap]
  );

  const handleLongDelete = useCallback(() => {
    tap();
    onChange('');
  }, [onChange, tap]);

  return (
    <View style={styles.grid}>
      {KEYS.map((key) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          accessibilityLabel={key === 'del' ? 'Usuń ostatnią cyfrę' : `Cyfra ${key}`}
          onPress={() => handlePress(key)}
          onLongPress={key === 'del' ? handleLongDelete : undefined}
          style={({ pressed }) => [styles.key, pressed && styles.pressed]}
        >
          {key === 'del' ? (
            <Ionicons name="backspace-outline" size={24} color={colors.text} />
          ) : (
            <Text style={styles.keyLabel}>{key}</Text>
          )}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  key: {
    flexBasis: '31%',
    flexGrow: 1,
    minHeight: 58,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    backgroundColor: colors.surfaceStrong,
  },
  keyLabel: {
    color: colors.text,
    fontSize: font.h1,
    fontWeight: '600',
  },
});
