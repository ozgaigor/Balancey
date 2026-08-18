import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, font, radius, spacing } from '../theme';
import { formatMoney } from '../utils/currency';
import type { MonthOverview } from '../services/budgetService';
import { ProgressBar } from './ProgressBar';
import { StatTile } from './StatTile';

interface BalanceCardProps {
  overview: MonthOverview;
  onPressBudget?: () => void;
  onPressTile?: (type: 'income' | 'bill' | 'expense' | 'saving') => void;
}

/** Główna karta ekranu Start: ile zostało i z czego to wynika. */
export function BalanceCard({ overview, onPressBudget, onPressTile }: BalanceCardProps) {
  const { summary, budget, dailyLimit, daysLeft } = overview;
  const negative = summary.remaining < 0;

  return (
    <View style={styles.card}>
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>Pozostało</Text>
        <Text
          style={[styles.heroAmount, negative && styles.heroAmountNegative]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
          {formatMoney(summary.remaining)}
        </Text>
        {summary.billsUnpaid > 0 && (
          <View style={styles.heroNote}>
            <Ionicons name="alert-circle-outline" size={14} color={colors.warning} />
            <Text style={styles.heroNoteText}>
              Po opłaceniu rachunków zostanie {formatMoney(summary.remainingAfterUnpaid)}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.tiles}>
        <StatTile
          label="Przychody"
          amount={summary.income}
          color={colors.accent}
          icon="arrow-down-circle-outline"
          onPress={onPressTile ? () => onPressTile('income') : undefined}
        />
        <StatTile
          label="Wydatki"
          amount={summary.expenses}
          color={colors.danger}
          icon="arrow-up-circle-outline"
          onPress={onPressTile ? () => onPressTile('expense') : undefined}
        />
        <StatTile
          label="Rachunki"
          amount={summary.billsPaid}
          color={colors.bills}
          icon="receipt-outline"
          hint={summary.billsUnpaid > 0 ? `Do zapłaty ${formatMoney(summary.billsUnpaid)}` : undefined}
          onPress={onPressTile ? () => onPressTile('bill') : undefined}
        />
        <StatTile
          label="Oszczędności"
          amount={summary.savings}
          color={colors.savings}
          icon="wallet-outline"
          onPress={onPressTile ? () => onPressTile('saving') : undefined}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Przejdź do budżetu"
        onPress={onPressBudget}
        style={({ pressed }) => [styles.budgetBox, pressed && styles.pressed]}
      >
        {budget.hasLimit ? (
          <>
            <View style={styles.budgetHeader}>
              <Text style={styles.budgetLabel}>
                Budżet wykorzystany: <Text style={styles.budgetPercent}>{budget.percent}%</Text>
              </Text>
              <Text style={[styles.budgetRight, budget.exceeded && styles.budgetRightDanger]}>
                {budget.exceeded
                  ? `Przekroczono o ${formatMoney(Math.abs(budget.left))}`
                  : `Zostało ${formatMoney(budget.left)}`}
              </Text>
            </View>
            <ProgressBar percent={budget.barPercent} exceeded={budget.exceeded} height={12} />
            <Text style={styles.budgetFoot}>
              {formatMoney(budget.spent)} z {formatMoney(budget.limit)}
              {daysLeft > 0 && dailyLimit > 0
                ? ` · ${formatMoney(dailyLimit)} na dzień przez ${daysLeft} dni`
                : ''}
            </Text>
          </>
        ) : (
          <View style={styles.budgetEmpty}>
            <Ionicons name="pie-chart-outline" size={18} color={colors.accent} />
            <Text style={styles.budgetEmptyText}>
              Ustaw miesięczny budżet, aby widzieć limit dzienny
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  hero: {
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  heroLabel: {
    color: colors.textMuted,
    fontSize: font.small,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  heroAmount: {
    color: colors.text,
    fontSize: 40,
    fontWeight: '800',
    marginTop: spacing.xs,
    letterSpacing: -0.5,
  },
  heroAmountNegative: {
    color: colors.danger,
  },
  heroNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    backgroundColor: colors.warningSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  heroNoteText: {
    color: colors.warning,
    fontSize: font.tiny,
    fontWeight: '600',
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  budgetBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.8,
  },
  budgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  budgetLabel: {
    color: colors.textMuted,
    fontSize: font.small,
    fontWeight: '600',
  },
  budgetPercent: {
    color: colors.text,
    fontWeight: '800',
  },
  budgetRight: {
    color: colors.accent,
    fontSize: font.tiny,
    fontWeight: '700',
  },
  budgetRightDanger: {
    color: colors.danger,
  },
  budgetFoot: {
    color: colors.textFaint,
    fontSize: font.tiny,
  },
  budgetEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  budgetEmptyText: {
    color: colors.textMuted,
    fontSize: font.small,
    flex: 1,
  },
});
