import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, font, radius, spacing } from '../theme';
import { currentYearMonth, monthLabel } from '../utils/dates';

interface MonthSelectorProps {
  month: string;
  onPrevious: () => void;
  onNext: () => void;
  /** Kliknięcie nazwy miesiąca — powrót do bieżącego miesiąca. */
  onPressLabel?: () => void;
}

/** Przełącznik miesięcy: < Sierpień 2026 > */
export function MonthSelector({ month, onPrevious, onNext, onPressLabel }: MonthSelectorProps) {
  const isCurrent = month === currentYearMonth();

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Poprzedni miesiąc"
        onPress={onPrevious}
        hitSlop={10}
        style={({ pressed }) => [styles.arrow, pressed && styles.pressed]}
      >
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Miesiąc: ${monthLabel(month)}`}
        onPress={onPressLabel}
        style={styles.labelWrapper}
      >
        <Text style={styles.label}>{monthLabel(month)}</Text>
        {!isCurrent && <Text style={styles.hint}>dotknij, aby wrócić do dziś</Text>}
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Następny miesiąc"
        onPress={onNext}
        hitSlop={10}
        style={({ pressed }) => [styles.arrow, pressed && styles.pressed]}
      >
        <Ionicons name="chevron-forward" size={22} color={colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  arrow: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  pressed: {
    opacity: 0.7,
  },
  labelWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  label: {
    color: colors.text,
    fontSize: font.h1,
    fontWeight: '700',
  },
  hint: {
    color: colors.textFaint,
    fontSize: font.tiny,
    marginTop: 2,
  },
});
