import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, font, radius, spacing } from '../theme';
import {
  addDays,
  addMonths,
  daysInMonth,
  formatDateLong,
  formatDatePL,
  monthLabel,
  todayISO,
  toParts,
  weekdayOf,
  yearMonthOf,
} from '../utils/dates';

interface DateFieldProps {
  label: string;
  value: string;
  onChange: (date: string) => void;
}

const WEEKDAY_HEADERS = ['pn', 'wt', 'śr', 'cz', 'pt', 'so', 'nd'];

/**
 * Pole wyboru daty z własnym, prostym kalendarzem.
 * Nie da się wpisać nieistniejącej daty — wybór odbywa się wyłącznie z siatki dni.
 */
export function DateField({ label, value, onChange }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => yearMonthOf(value || todayISO()));

  const today = todayISO();

  const days = useMemo(() => {
    const [year, month] = visibleMonth.split('-').map(Number);
    const total = daysInMonth(year, month);
    const firstWeekday = weekdayOf(`${visibleMonth}-01`);
    // Poniedziałek jako pierwszy dzień tygodnia.
    const leading = (firstWeekday + 6) % 7;

    const cells: (string | null)[] = Array.from({ length: leading }, () => null);
    for (let day = 1; day <= total; day += 1) {
      cells.push(`${visibleMonth}-${String(day).padStart(2, '0')}`);
    }
    return cells;
  }, [visibleMonth]);

  const openPicker = () => {
    setVisibleMonth(yearMonthOf(value || today));
    setOpen(true);
  };

  const select = (date: string) => {
    onChange(date);
    setOpen(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>

      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Data: ${formatDateLong(value)}. Dotknij, aby zmienić.`}
          onPress={openPicker}
          style={({ pressed }) => [styles.field, pressed && styles.pressed]}
        >
          <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
          <Text style={styles.value}>{formatDatePL(value)}</Text>
          <Ionicons name="chevron-down" size={16} color={colors.textFaint} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Poprzedni dzień"
          onPress={() => onChange(addDays(value, -1))}
          style={({ pressed }) => [styles.stepper, pressed && styles.pressed]}
        >
          <Ionicons name="remove" size={18} color={colors.text} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Następny dzień"
          onPress={() => onChange(addDays(value, 1))}
          style={({ pressed }) => [styles.stepper, pressed && styles.pressed]}
        >
          <Ionicons name="add" size={18} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.quickRow}>
        {[
          { label: 'Dzisiaj', date: today },
          { label: 'Wczoraj', date: addDays(today, -1) },
          { label: 'Przedwczoraj', date: addDays(today, -2) },
        ].map((item) => (
          <Pressable
            key={item.label}
            accessibilityRole="button"
            onPress={() => onChange(item.date)}
            style={({ pressed }) => [
              styles.quickChip,
              value === item.date && styles.quickChipActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.quickText, value === item.date && styles.quickTextActive]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Modal visible={open} animationType="fade" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Poprzedni miesiąc"
                onPress={() => setVisibleMonth((current) => addMonths(current, -1))}
                style={styles.sheetArrow}
              >
                <Ionicons name="chevron-back" size={20} color={colors.text} />
              </Pressable>
              <Text style={styles.sheetTitle}>{monthLabel(visibleMonth)}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Następny miesiąc"
                onPress={() => setVisibleMonth((current) => addMonths(current, 1))}
                style={styles.sheetArrow}
              >
                <Ionicons name="chevron-forward" size={20} color={colors.text} />
              </Pressable>
            </View>

            <View style={styles.weekHeader}>
              {WEEKDAY_HEADERS.map((day) => (
                <Text key={day} style={styles.weekHeaderText}>
                  {day}
                </Text>
              ))}
            </View>

            <View style={styles.grid}>
              {days.map((date, index) => {
                if (!date) {
                  return <View key={`empty-${index}`} style={styles.dayCell} />;
                }
                const selected = date === value;
                const isToday = date === today;
                return (
                  <Pressable
                    key={date}
                    accessibilityRole="button"
                    accessibilityLabel={formatDateLong(date)}
                    onPress={() => select(date)}
                    style={({ pressed }) => [
                      styles.dayCell,
                      selected && styles.daySelected,
                      !selected && isToday && styles.dayToday,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.dayText, selected && styles.dayTextSelected]}>
                      {toParts(date).day}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() => select(today)}
              style={({ pressed }) => [styles.todayButton, pressed && styles.pressed]}
            >
              <Text style={styles.todayButtonText}>Wybierz dzisiaj</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  label: { color: colors.textMuted, fontSize: font.small, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  value: { flex: 1, color: colors.text, fontSize: font.body, fontWeight: '600' },
  stepper: {
    width: 48,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  quickRow: { flexDirection: 'row', gap: spacing.sm, marginTop: 2 },
  quickChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  quickChipActive: { backgroundColor: colors.accentSoft },
  quickText: { color: colors.textMuted, fontSize: font.tiny, fontWeight: '600' },
  quickTextActive: { color: colors.accent },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetArrow: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  sheetTitle: { color: colors.text, fontSize: font.h2, fontWeight: '700' },
  weekHeader: { flexDirection: 'row' },
  weekHeaderText: {
    flex: 1,
    textAlign: 'center',
    color: colors.textFaint,
    fontSize: font.tiny,
    fontWeight: '600',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: `${100 / 7}%`,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  daySelected: { backgroundColor: colors.accent },
  dayToday: { borderWidth: 1, borderColor: colors.accent },
  dayText: { color: colors.text, fontSize: font.small, fontWeight: '600' },
  dayTextSelected: { color: '#06210F', fontWeight: '800' },
  todayButton: {
    minHeight: 46,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayButtonText: { color: colors.text, fontSize: font.small, fontWeight: '700' },
});
