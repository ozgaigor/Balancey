import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, font, radius, spacing } from '../theme';
import { formatMoney } from '../utils/currency';

interface StatTileProps {
  label: string;
  amount: number;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Dodatkowa informacja, np. "1 rachunek do zapłaty". */
  hint?: string;
  onPress?: () => void;
}

/** Kafelek z jedną wartością podsumowania (przychody, wydatki, ...). */
export function StatTile({ label, amount, color, icon, hint, onPress }: StatTileProps) {
  const content = (
    <>
      <View style={styles.header}>
        <View style={[styles.iconWrapper, { backgroundColor: `${color}22` }]}>
          <Ionicons name={icon} size={15} color={color} />
        </View>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={styles.amount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {formatMoney(amount)}
      </Text>
      {hint ? (
        <Text style={[styles.hint, { color }]} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${formatMoney(amount)}`}
        onPress={onPress}
        style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View accessibilityLabel={`${label}: ${formatMoney(amount)}`} style={styles.tile}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexGrow: 1,
    flexBasis: '47%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 84,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.75,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  iconWrapper: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: colors.textMuted,
    fontSize: font.tiny,
    fontWeight: '600',
    flexShrink: 1,
  },
  amount: {
    color: colors.text,
    fontSize: font.h2,
    fontWeight: '700',
  },
  hint: {
    fontSize: font.tiny,
    marginTop: 2,
    fontWeight: '600',
  },
});
