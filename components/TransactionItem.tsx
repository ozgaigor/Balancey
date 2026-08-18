import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, font, radius, spacing, typeColor } from '../theme';
import { formatSignedForType } from '../utils/currency';
import { relativeDayLabel } from '../utils/dates';
import type { TransactionWithCategory } from '../types';

interface TransactionItemProps {
  transaction: TransactionWithCategory;
  onPress?: () => void;
  /** Pokazuje datę zamiast samej kategorii. */
  showDate?: boolean;
}

/** Pojedynczy wiersz listy transakcji. */
export function TransactionItem({ transaction, onPress, showDate = true }: TransactionItemProps) {
  const color = typeColor(transaction.type);
  const iconName = (transaction.categoryIcon ?? 'ellipsis-horizontal-outline') as keyof typeof Ionicons.glyphMap;
  const title =
    transaction.name && transaction.name.trim() !== ''
      ? transaction.name
      : transaction.categoryName ?? 'Bez nazwy';

  const unpaidBill = transaction.type === 'bill' && !transaction.isPaid;

  const subtitleParts = [transaction.categoryName ?? 'Bez kategorii'];
  if (showDate) subtitleParts.push(relativeDayLabel(transaction.date));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${formatSignedForType(transaction.amount, transaction.type)}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View
        style={[
          styles.icon,
          { backgroundColor: `${transaction.categoryColor ?? color}22` },
        ]}
      >
        <Ionicons name={iconName} size={19} color={transaction.categoryColor ?? color} />
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.subtitleRow}>
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitleParts.join(' · ')}
          </Text>
          {unpaidBill && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Do zapłaty</Text>
            </View>
          )}
        </View>
      </View>

      <Text style={[styles.amount, { color: unpaidBill ? colors.warning : color }]} numberOfLines={1}>
        {formatSignedForType(transaction.amount, transaction.type)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    minHeight: 62,
  },
  pressed: {
    opacity: 0.65,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '600',
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: font.tiny,
    flexShrink: 1,
  },
  badge: {
    backgroundColor: colors.warningSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  badgeText: {
    color: colors.warning,
    fontSize: 10,
    fontWeight: '700',
  },
  amount: {
    fontSize: font.body,
    fontWeight: '700',
  },
});
