import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '../../components/EmptyState';
import { SegmentedControl } from '../../components/SegmentedControl';
import { TransactionItem } from '../../components/TransactionItem';
import { colors, font, radius, spacing } from '../../theme';
import type { TransactionType, TransactionWithCategory } from '../../types';
import { summarize } from '../../utils/calculations';
import { formatMoney } from '../../utils/currency';
import { formatDateLong, monthLabel, relativeDayLabel } from '../../utils/dates';
import { useDbData } from '../../hooks/useDbData';
import { useApp } from '../../state/AppProvider';
import { listCategories } from '../../db/repositories/categories';
import { listTransactions } from '../../db/repositories/transactions';

type TypeFilter = 'all' | TransactionType;

const TYPE_FILTERS: { value: TypeFilter; label: string; color?: string }[] = [
  { value: 'all', label: 'Wszystkie' },
  { value: 'income', label: 'Przychody', color: colors.accent },
  { value: 'bill', label: 'Rachunki', color: colors.bills },
  { value: 'expense', label: 'Wydatki', color: colors.danger },
  { value: 'saving', label: 'Oszczędności', color: colors.savings },
];

export default function TransactionsScreen() {
  const insets = useSafeAreaInsets();
  const { month, goToPreviousMonth, goToNextMonth } = useApp();
  const params = useLocalSearchParams<{ type?: string }>();

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [allMonths, setAllMonths] = useState(false);

  useEffect(() => {
    if (params.type && ['income', 'bill', 'expense', 'saving'].includes(params.type)) {
      setTypeFilter(params.type as TypeFilter);
    }
  }, [params.type]);

  const transactionsState = useDbData(
    () =>
      listTransactions({
        month: allMonths ? null : month,
        type: typeFilter === 'all' ? null : typeFilter,
        categoryId,
        search: search.trim() === '' ? null : search,
      }),
    [month, typeFilter, categoryId, search, allMonths]
  );

  const categoriesState = useDbData(
    () => listCategories(typeFilter === 'all' ? undefined : typeFilter),
    [typeFilter]
  );

  const transactions = transactionsState.data ?? [];
  const categories = categoriesState.data ?? [];
  const totals = useMemo(() => summarize(transactions), [transactions]);

  const sections = useMemo(() => {
    const groups = new Map<string, TransactionWithCategory[]>();
    for (const transaction of transactions) {
      const list = groups.get(transaction.date) ?? [];
      list.push(transaction);
      groups.set(transaction.date, list);
    }
    return Array.from(groups.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, data]) => ({ title: date, data }));
  }, [transactions]);

  const filteredSum =
    typeFilter === 'income'
      ? totals.income
      : typeFilter === 'bill'
        ? totals.billsTotal
        : typeFilter === 'expense'
          ? totals.expenses
          : typeFilter === 'saving'
            ? totals.savings
            : totals.income - totals.outflow;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Transakcje</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={allMonths ? 'Pokaż wybrany miesiąc' : 'Pokaż wszystkie miesiące'}
          onPress={() => setAllMonths((value) => !value)}
          style={({ pressed }) => [styles.monthToggle, pressed && styles.pressed]}
        >
          <Ionicons name="calendar-outline" size={16} color={colors.accent} />
          <Text style={styles.monthToggleText}>
            {allMonths ? 'Wszystkie miesiące' : monthLabel(month)}
          </Text>
        </Pressable>
      </View>

      {!allMonths && (
        <View style={styles.monthNav}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Poprzedni miesiąc"
            onPress={goToPreviousMonth}
            style={({ pressed }) => [styles.monthArrow, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={18} color={colors.text} />
          </Pressable>
          <Text style={styles.monthNavLabel}>{monthLabel(month)}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Następny miesiąc"
            onPress={goToNextMonth}
            style={({ pressed }) => [styles.monthArrow, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-forward" size={18} color={colors.text} />
          </Pressable>
        </View>
      )}

      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={18} color={colors.textFaint} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Szukaj nazwy, opisu lub kategorii"
          placeholderTextColor={colors.textFaint}
          style={styles.searchInput}
          selectionColor={colors.accent}
          accessibilityLabel="Wyszukiwarka transakcji"
        />
        {search !== '' && (
          <Pressable accessibilityRole="button" accessibilityLabel="Wyczyść" onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={colors.textFaint} />
          </Pressable>
        )}
      </View>

      <SegmentedControl
        options={TYPE_FILTERS}
        value={typeFilter}
        onChange={(value) => {
          setTypeFilter(value);
          setCategoryId(null);
        }}
      />

      {categories.length > 0 && (
        <SegmentedControl
          options={[
            { value: 'all', label: 'Wszystkie kategorie' },
            ...categories.map((category) => ({
              value: String(category.id),
              label: category.name,
              color: category.color,
            })),
          ]}
          value={categoryId == null ? 'all' : String(categoryId)}
          onChange={(value) => setCategoryId(value === 'all' ? null : Number(value))}
        />
      )}

      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>
          {transactions.length} {transactions.length === 1 ? 'pozycja' : 'pozycji'}
        </Text>
        <Text style={styles.summaryValue}>{formatMoney(filteredSum)}</Text>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: 150 }}
        renderSectionHeader={({ section }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Podgląd dnia ${formatDateLong(section.title)}`}
            onPress={() => router.push(`/day/${section.title}`)}
            style={styles.sectionHeader}
          >
            <Text style={styles.sectionTitle}>{relativeDayLabel(section.title)}</Text>
            <Text style={styles.sectionDate}>{formatDateLong(section.title)}</Text>
          </Pressable>
        )}
        renderItem={({ item }) => (
          <TransactionItem
            transaction={item}
            showDate={false}
            onPress={() => router.push(`/transaction/${item.id}`)}
          />
        )}
        ListEmptyComponent={
          transactionsState.loading ? null : (
            <EmptyState
              icon="search-outline"
              title="Brak transakcji"
              description="Zmień filtry lub dodaj nową transakcję przyciskiem na dole ekranu."
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  title: { color: colors.text, fontSize: font.h1, fontWeight: '700' },
  monthToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    minHeight: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  monthToggleText: { color: colors.accent, fontSize: font.tiny, fontWeight: '700' },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthArrow: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthNavLabel: { color: colors.text, fontSize: font.body, fontWeight: '700' },
  pressed: { opacity: 0.7 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: font.small,
    paddingVertical: spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryLabel: { color: colors.textMuted, fontSize: font.tiny, fontWeight: '600' },
  summaryValue: { color: colors.text, fontSize: font.body, fontWeight: '700' },
  sectionHeader: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: font.small,
    fontWeight: '700',
  },
  sectionDate: { color: colors.textFaint, fontSize: font.tiny },
});
