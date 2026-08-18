import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { CategoryButton } from '../components/CategoryButton';
import { EmptyState } from '../components/EmptyState';
import { ScreenHeader } from '../components/ScreenHeader';
import { SegmentedControl } from '../components/SegmentedControl';
import { TextField } from '../components/TextField';
import { colors, font, radius, spacing, typeColor, typeLabel } from '../theme';
import type { TransactionType } from '../types';
import { formatMoney, moneyToPlainString, parseAmount } from '../utils/currency';
import { currentYearMonth } from '../utils/dates';
import { useDbData } from '../hooks/useDbData';
import { useApp } from '../state/AppProvider';
import { listCategories } from '../db/repositories/categories';
import {
  createRecurring,
  deleteRecurring,
  listRecurring,
  setRecurringActive,
  updateRecurring,
  type RecurringWithCategory,
} from '../db/repositories/recurring';
import { ensureRecurringForMonth } from '../services/recurringService';

const TYPE_OPTIONS: { value: TransactionType; label: string; color: string }[] = [
  { value: 'bill', label: 'Rachunek', color: colors.bills },
  { value: 'expense', label: 'Wydatek', color: colors.danger },
  { value: 'income', label: 'Przychód', color: colors.accent },
  { value: 'saving', label: 'Oszczędności', color: colors.savings },
];

export default function RecurringScreen() {
  const insets = useSafeAreaInsets();
  const { month, refresh, showToast } = useApp();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [type, setType] = useState<TransactionType>('bill');
  const [name, setName] = useState('');
  const [amountText, setAmountText] = useState('');
  const [day, setDay] = useState('1');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [autoCreate, setAutoCreate] = useState(true);
  const [saving, setSaving] = useState(false);

  const recurringState = useDbData(() => listRecurring(), []);
  const categoriesState = useDbData(() => listCategories(type), [type]);

  const items = recurringState.data ?? [];
  const categories = categoriesState.data ?? [];

  const openCreate = () => {
    setEditingId(null);
    setType('bill');
    setName('');
    setAmountText('');
    setDay('1');
    setCategoryId(null);
    setAutoCreate(true);
    setEditorOpen(true);
  };

  const openEdit = (item: RecurringWithCategory) => {
    setEditingId(item.id);
    setType(item.type);
    setName(item.name);
    setAmountText(moneyToPlainString(item.amount));
    setDay(String(item.dayOfMonth));
    setCategoryId(item.categoryId);
    setAutoCreate(item.autoCreate);
    setEditorOpen(true);
  };

  const handleSave = useCallback(async () => {
    const amount = parseAmount(amountText);
    const dayNumber = Number.parseInt(day, 10);

    if (name.trim() === '') {
      showToast('Podaj nazwę', 'warning');
      return;
    }
    if (amount == null || amount <= 0) {
      showToast('Podaj poprawną kwotę', 'warning');
      return;
    }
    if (!Number.isFinite(dayNumber) || dayNumber < 1 || dayNumber > 31) {
      showToast('Dzień miesiąca musi być z zakresu 1-31', 'warning');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        type,
        name,
        amount,
        categoryId,
        dayOfMonth: dayNumber,
        autoCreate,
        active: true,
        startMonth: currentYearMonth(),
      };

      if (editingId != null) {
        await updateRecurring(editingId, payload);
        showToast('Zapisano cykl');
      } else {
        await createRecurring(payload);
        showToast('Dodano cykl');
      }

      await ensureRecurringForMonth(month);
      setEditorOpen(false);
      recurringState.reload();
      refresh();
    } finally {
      setSaving(false);
    }
  }, [
    amountText,
    autoCreate,
    categoryId,
    day,
    editingId,
    month,
    name,
    recurringState,
    refresh,
    showToast,
    type,
  ]);

  const handleDelete = useCallback(
    (item: RecurringWithCategory) => {
      Alert.alert(
        `Usunąć cykl „${item.name}”?`,
        'Pozycje utworzone wcześniej zostaną w historii. Nowe nie będą już powstawać.',
        [
          { text: 'Anuluj', style: 'cancel' },
          {
            text: 'Usuń',
            style: 'destructive',
            onPress: async () => {
              await deleteRecurring(item.id);
              recurringState.reload();
              refresh();
              showToast('Usunięto cykl');
            },
          },
        ]
      );
    },
    [recurringState, refresh, showToast]
  );

  const toggleActive = useCallback(
    async (item: RecurringWithCategory, value: boolean) => {
      await setRecurringActive(item.id, value);
      if (value) await ensureRecurringForMonth(month);
      recurringState.reload();
      refresh();
    },
    [month, recurringState, refresh]
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.headerBox}>
        <ScreenHeader title="Pozycje cykliczne" subtitle="Rachunki i wydatki co miesiąc" back />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}>
        <Card>
          <Text style={styles.info}>
            Cykl tworzy pozycję w każdym miesiącu — np. „Internet, 80 zł, 10 dnia miesiąca”.
            Rachunki pojawiają się jako „Do zapłaty”, a wydatki (np. abonamenty) są dopisywane od razu.
          </Text>
        </Card>

        {items.length === 0 ? (
          <Card>
            <EmptyState
              icon="repeat-outline"
              title="Brak pozycji cyklicznych"
              description="Dodaj czynsz, internet czy abonament, a aplikacja sama dopisze je w kolejnych miesiącach."
            />
          </Card>
        ) : (
          <Card title={`Cykle (${items.length})`}>
            <View style={styles.list}>
              {items.map((item) => (
                <View key={item.id} style={styles.row}>
                  <View
                    style={[styles.iconBox, { backgroundColor: `${item.categoryColor ?? typeColor(item.type)}22` }]}
                  >
                    <Ionicons
                      name={(item.categoryIcon ?? 'repeat-outline') as keyof typeof Ionicons.glyphMap}
                      size={20}
                      color={item.categoryColor ?? typeColor(item.type)}
                    />
                  </View>

                  <Pressable
                    style={styles.rowInfo}
                    accessibilityRole="button"
                    accessibilityLabel={`Edytuj ${item.name}`}
                    onPress={() => openEdit(item)}
                  >
                    <Text style={styles.rowName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {typeLabel(item.type)} · {formatMoney(item.amount)} · {item.dayOfMonth} dnia
                      miesiąca
                    </Text>
                  </Pressable>

                  <Switch
                    value={item.active}
                    onValueChange={(value) => toggleActive(item, value)}
                    trackColor={{ false: colors.surfaceStrong, true: colors.accentDark }}
                    thumbColor={item.active ? colors.accent : '#7A8794'}
                    accessibilityLabel={`Automatyczne tworzenie: ${item.name}`}
                  />

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Usuń ${item.name}`}
                    onPress={() => handleDelete(item)}
                    style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </Pressable>
                </View>
              ))}
            </View>
          </Card>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button label="Dodaj pozycję cykliczną" icon="add" onPress={openCreate} large />
      </View>

      <Modal
        visible={editorOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setEditorOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>
                {editingId != null ? 'Edytuj cykl' : 'Nowa pozycja cykliczna'}
              </Text>

              <SegmentedControl
                options={TYPE_OPTIONS}
                value={type}
                onChange={(value) => {
                  setType(value);
                  setCategoryId(null);
                }}
              />

              <TextField label="Nazwa" value={name} onChangeText={setName} placeholder="np. Internet" />

              <TextField
                label="Kwota"
                value={amountText}
                onChangeText={setAmountText}
                keyboardType="decimal-pad"
                suffix="zł"
                hint={parseAmount(amountText) != null ? formatMoney(parseAmount(amountText) as number) : 'np. 80,00'}
              />

              <TextField
                label="Dzień miesiąca"
                value={day}
                onChangeText={(value) => setDay(value.replace(/\D/g, '').slice(0, 2))}
                keyboardType="number-pad"
                hint="Dzień 29-31 zostanie przesunięty na ostatni dzień krótszego miesiąca."
                maxLength={2}
              />

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Kategoria</Text>
                <View style={styles.categoryGrid}>
                  {categories.map((category) => (
                    <CategoryButton
                      key={category.id}
                      name={category.name}
                      icon={category.icon}
                      color={category.color}
                      selected={categoryId === category.id}
                      onPress={() =>
                        setCategoryId((current) => (current === category.id ? null : category.id))
                      }
                    />
                  ))}
                </View>
              </View>

              <View style={styles.switchRow}>
                <View style={styles.switchLabels}>
                  <Text style={styles.fieldLabel}>Twórz automatycznie</Text>
                  <Text style={styles.fieldHint}>
                    Wyłącz, jeśli chcesz dopisywać tę pozycję ręcznie.
                  </Text>
                </View>
                <Switch
                  value={autoCreate}
                  onValueChange={setAutoCreate}
                  trackColor={{ false: colors.surfaceStrong, true: colors.accentDark }}
                  thumbColor={autoCreate ? colors.accent : '#7A8794'}
                  accessibilityLabel="Twórz automatycznie"
                />
              </View>

              <View style={styles.modalActions}>
                <Button
                  label="Anuluj"
                  variant="secondary"
                  onPress={() => setEditorOpen(false)}
                  style={styles.modalAction}
                />
                <Button label="Zapisz" onPress={handleSave} loading={saving} style={styles.modalAction} />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerBox: { paddingHorizontal: spacing.lg },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  info: { color: colors.textMuted, fontSize: font.tiny, lineHeight: 18 },
  list: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 58 },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInfo: { flex: 1 },
  rowName: { color: colors.text, fontSize: font.body, fontWeight: '600' },
  rowMeta: { color: colors.textMuted, fontSize: font.tiny, marginTop: 2 },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  modalBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '92%',
  },
  modalContent: { padding: spacing.lg, gap: spacing.md },
  modalTitle: { color: colors.text, fontSize: font.h2, fontWeight: '700' },
  fieldGroup: { gap: spacing.sm },
  fieldLabel: { color: colors.textMuted, fontSize: font.small, fontWeight: '600' },
  fieldHint: { color: colors.textFaint, fontSize: font.tiny, marginTop: 2 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  switchLabels: { flex: 1 },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  modalAction: { flex: 1 },
});
