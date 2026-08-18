import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { colors, font, radius, spacing } from '../theme';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Kolor podświetlenia aktywnej opcji. */
  color?: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Przewijalny pasek — dla dłuższych list filtrów. */
  scrollable?: boolean;
}

/** Poziomy przełącznik filtrów (Wszystkie / Przychody / Wydatki ...). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  scrollable = true,
}: SegmentedControlProps<T>) {
  const chips = options.map((option) => {
    const active = option.value === value;
    const accent = option.color ?? colors.accent;
    return (
      <Pressable
        key={option.value}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        onPress={() => onChange(option.value)}
        style={({ pressed }) => [
          styles.chip,
          active && { backgroundColor: `${accent}26`, borderColor: accent },
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.label, active && { color: colors.text }]} numberOfLines={1}>
          {option.label}
        </Text>
      </Pressable>
    );
  });

  if (!scrollable) {
    return <>{chips}</>;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
    >
      {chips}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    gap: spacing.sm,
    paddingVertical: 2,
  },
  chip: {
    minHeight: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    color: colors.textMuted,
    fontSize: font.small,
    fontWeight: '600',
  },
});
