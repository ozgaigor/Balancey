import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, font, radius, spacing } from '../theme';

interface CategoryButtonProps {
  name: string;
  icon: string;
  color: string;
  selected: boolean;
  onPress: () => void;
}

/** Duży kafelek kategorii używany przy szybkim dodawaniu wydatku. */
export function CategoryButton({ name, icon, color, selected, onPress }: CategoryButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`Kategoria ${name}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        selected && { borderColor: color, backgroundColor: `${color}1F` },
        pressed && styles.pressed,
      ]}
    >
      <Ionicons
        name={icon as keyof typeof Ionicons.glyphMap}
        size={22}
        color={selected ? color : colors.textMuted}
      />
      <Text style={[styles.label, selected && { color: colors.text }]} numberOfLines={1}>
        {name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexGrow: 1,
    flexBasis: '30%',
    minHeight: 74,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    color: colors.textMuted,
    fontSize: font.tiny,
    fontWeight: '600',
    textAlign: 'center',
  },
});
