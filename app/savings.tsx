import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AmountPrompt } from '../components/AmountPrompt';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { ProgressBar } from '../components/ProgressBar';
import { ScreenHeader } from '../components/ScreenHeader';
import { TextField } from '../components/TextField';
import { colors, font, radius, spacing } from '../theme';
import type { SavingsGoalWithProgress } from '../types';
import { formatMoney, moneyToPlainString, parseAmount } from '../utils/currency';
import { monthLabel, todayISO } from '../utils/dates';
import { useDbData } from '../hooks/useDbData';
import { useApp } from '../state/AppProvider';
import { findCategoryByName } from '../db/repositories/categories';
import { createGoal, deleteGoal, listGoals, updateGoal } from '../db/repositories/savings';
import { getMonthSummary } from '../services/budgetService';
import { addTransaction } from '../services/transactionService';

const PRESETS: { name: string; icon: string; color: string }[] = [
  { name: 'Poduszka finansowa', icon: 'umbrella-outline', color: '#4FD1C5' },
  { name: 'Samochód', icon: 'car-outline', color: '#7C9CF5' },
  { name: 'Wakacje', icon: 'airplane-outline', color: '#F5A524' },
  { name: 'Nowy komputer', icon: 'laptop-outline', color: '#B48CF2' },
  { name: 'Inny cel', icon: 'flag-outline', color: '#22C55E' },
];

export default function SavingsScreen() {
  const insets = useSafeAreaInsets();
  const { month, refresh, showToast, settings } = useApp();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [targetText, setTargetText] = useState('');
  const [initialText, setInitialText] = useState('');
  const [icon, setIcon] = useState(PRESETS[0].icon);
  const [color, setColor] = useState(PRESETS[0].color);
  const [saving, setSaving] = useState(false);
  const [depositGoal, setDepositGoal] = useState<SavingsGoalWithProgress | null>(null);

  const goalsState = useDbData(() => listGoals(), []);
  const summaryState = useDbData(() => getMonthSummary(month), [month]);

  const goals = goalsState.data ?? [];
  const monthSavings = summaryState.data?.savings ?? 0;

  const openCreate = (preset?: (typeof PRESETS)[number]) => {
    setEditingId(null);
    setName(preset && preset.name !== 'Inny cel' ? preset.name : '');
    setTargetText('');
    setInitialText('');
    setIcon(preset?.icon ?? PRESETS[0].icon);
    setColor(preset?.color ?? PRESETS[0].color);
    setEditorOpen(true);
  };

  const openEdit = (goal: SavingsGoalWithProgress) => {
    setEditingId(goal.id);
    setName(goal.name);
    setTargetText(moneyToPlainString(goal.targetAmount));
    setInitialText(goal.initialAmount > 0 ? moneyToPlainString(goal.initialAmount) : '');
    setIcon(goal.icon);
    setColor(goal.color);
    setEditorOpen(true);
  };

  const handleSave = useCallback(async () => {
    const target = parseAmount(targetText);
    const initial = initialText.trim() === '' ? 0 : parseAmount(initialText);

    if (name.trim() === '') {
      showToast('Podaj nazwę celu', 'warning');
      return;
    }
    if (target == null || target <= 0) {
      showToast('Podaj kwotę celu', 'warning');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name,
        targetAmount: target,
        initialAmount: initial ?? 0,
        icon,
        color,
      };

      if (editingId != null) {
        await updateGoal(editingId, payload);
        showToast('Zapisano cel');
      } else {
        await createGoal(payload);
        showToast('Dodano cel');
      }

      setEditorOpen(false);
      goalsState.reload();
      refresh();
    } finally {
      setSaving(false);
    }
  }, [color, editingId, goalsState, icon, initialText, name, refresh, showToast, targetText]);

  const handleDelete = useCallback(
    (goal: SavingsGoalWithProgress) => {
      Alert.alert(
        `Usunąć cel „${goal.name}”?`,
        'Wpłaty pozostaną w historii jako oszczędności, ale stracą przypisanie do celu.',
        [
          { text: 'Anuluj', style: 'cancel' },
          {
            text: 'Usuń',
            style: 'destructive',
            onPress: async () => {
              await deleteGoal(goal.id);
              goalsState.reload();
              refresh();
              showToast('Usunięto cel');
            },
          },
        ]
      );
    },
    [goalsState, refresh, showToast]
  );

  const handleDeposit = useCallback(
    async (amount: number) => {
      if (!depositGoal || amount <= 0) {
        setDepositGoal(null);
        return;
      }

      const category = await findCategoryByName('Oszczędności', 'saving');
      await addTransaction({
        type: 'saving',
        amount,
        categoryId: category?.id ?? null,
        name: depositGoal.name,
        date: todayISO(),
        goalId: depositGoal.id,
      });

      setDepositGoal(null);
      goalsState.reload();
      refresh();
      showToast(`Odłożono ${formatMoney(amount)}`);
    },
    [depositGoal, goalsState, refresh, showToast]
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.headerBox}>
        <ScreenHeader title="Oszczędności" subtitle={monthLabel(month)} back />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}>
        <Card>
          <View style={styles.summaryRow}>
            <View>
              <Text style={styles.summaryLabel}>Odłożone w tym miesiącu</Text>
              <Text style={styles.summaryValue}>{formatMoney(monthSavings)}</Text>
            </View>
            <Button
              label="Odłóż"
              icon="add"
              onPress={() => router.push({ pathname: '/add', params: { type: 'saving' } })}
            />
          </View>
          {settings.defaultSaving > 0 && (
            <Text style={styles.summaryHint}>
              Plan miesięczny: {formatMoney(settings.defaultSaving)}
              {settings.savingPercent > 0 ? ` (${settings.savingPercent}% dochodu)` : ''}
            </Text>
          )}
        </Card>

        {goals.length === 0 ? (
          <Card title="Cele oszczędnościowe">
            <EmptyState
              icon="flag-outline"
              title="Brak celów"
              description="Ustal cel, np. „Nowy komputer — 6 000 zł”, i obserwuj postęp."
            />
            <View style={styles.presets}>
              {PRESETS.map((preset) => (
                <Pressable
                  key={preset.name}
                  accessibilityRole="button"
                  onPress={() => openCreate(preset)}
                  style={({ pressed }) => [styles.presetChip, pressed && styles.pressed]}
                >
                  <Ionicons
                    name={preset.icon as keyof typeof Ionicons.glyphMap}
                    size={16}
                    color={preset.color}
                  />
                  <Text style={styles.presetText}>{preset.name}</Text>
                </Pressable>
              ))}
            </View>
          </Card>
        ) : (
          <View style={styles.goalList}>
            {goals.map((goal) => (
              <Card key={goal.id}>
                <View style={styles.goalHeader}>
                  <View style={[styles.goalIcon, { backgroundColor: `${goal.color}22` }]}>
                    <Ionicons
                      name={goal.icon as keyof typeof Ionicons.glyphMap}
                      size={20}
                      color={goal.color}
                    />
                  </View>
                  <Pressable
                    style={styles.goalInfo}
                    accessibilityRole="button"
                    accessibilityLabel={`Edytuj cel ${goal.name}`}
                    onPress={() => openEdit(goal)}
                  >
                    <Text style={styles.goalName}>{goal.name}</Text>
                    <Text style={styles.goalMeta}>
                      {formatMoney(goal.savedAmount)} z {formatMoney(goal.targetAmount)}
                    </Text>
                  </Pressable>
                  <Text style={[styles.goalPercent, { color: goal.color }]}>{goal.percent}%</Text>
                </View>

                <ProgressBar percent={Math.min(goal.percent, 100)} color={goal.color} height={10} />

                <View style={styles.goalActions}>
                  <Button
                    label="Wpłać"
                    icon="add"
                    variant="secondary"
                    onPress={() => setDepositGoal(goal)}
                    style={styles.goalAction}
                  />
                  <Button
                    label="Historia"
                    icon="list-outline"
                    variant="secondary"
                    onPress={() =>
                      router.push({ pathname: '/(tabs)/transactions', params: { type: 'saving' } })
                    }
                    style={styles.goalAction}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Usuń cel ${goal.name}`}
                    onPress={() => handleDelete(goal)}
                    style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </Pressable>
                </View>

                {goal.percent >= 100 && (
                  <View style={styles.doneBox}>
                    <Ionicons name="trophy-outline" size={16} color={colors.accent} />
                    <Text style={styles.doneText}>Cel osiągnięty. Gratulacje!</Text>
                  </View>
                )}
              </Card>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button label="Dodaj cel" icon="flag-outline" onPress={() => openCreate()} large />
      </View>

      <AmountPrompt
        visible={depositGoal != null}
        title={depositGoal ? `Wpłata: ${depositGoal.name}` : 'Wpłata'}
        description="Kwota zostanie zapisana jako oszczędności w dzisiejszej dacie."
        initialAmount={0}
        confirmLabel="Odłóż"
        onCancel={() => setDepositGoal(null)}
        onConfirm={handleDeposit}
      />

      <Modal
        visible={editorOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setEditorOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>{editingId != null ? 'Edytuj cel' : 'Nowy cel'}</Text>

              <TextField label="Nazwa celu" value={name} onChangeText={setName} placeholder="np. Wakacje" />
              <TextField
                label="Kwota docelowa"
                value={targetText}
                onChangeText={setTargetText}
                keyboardType="decimal-pad"
                suffix="zł"
                hint={parseAmount(targetText) != null ? formatMoney(parseAmount(targetText) as number) : 'np. 6 000'}
              />
              <TextField
                label="Już odłożone (opcjonalnie)"
                value={initialText}
                onChangeText={setInitialText}
                keyboardType="decimal-pad"
                suffix="zł"
                hint="Kwota zebrana przed rozpoczęciem prowadzenia budżetu w aplikacji."
              />

              <Text style={styles.fieldLabel}>Ikona i kolor</Text>
              <View style={styles.presets}>
                {PRESETS.map((preset) => (
                  <Pressable
                    key={preset.icon}
                    accessibilityRole="button"
                    accessibilityLabel={`Ikona ${preset.name}`}
                    onPress={() => {
                      setIcon(preset.icon);
                      setColor(preset.color);
                    }}
                    style={({ pressed }) => [
                      styles.presetChip,
                      icon === preset.icon && { borderColor: preset.color, backgroundColor: `${preset.color}1F` },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons
                      name={preset.icon as keyof typeof Ionicons.glyphMap}
                      size={16}
                      color={preset.color}
                    />
                    <Text style={styles.presetText}>{preset.name}</Text>
                  </Pressable>
                ))}
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
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  summaryLabel: { color: colors.textMuted, fontSize: font.tiny, fontWeight: '600' },
  summaryValue: { color: colors.savings, fontSize: font.h1, fontWeight: '800', marginTop: 2 },
  summaryHint: { color: colors.textFaint, fontSize: font.tiny, marginTop: spacing.md },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  presetText: { color: colors.text, fontSize: font.tiny, fontWeight: '600' },
  goalList: { gap: spacing.md },
  goalHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  goalIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalInfo: { flex: 1 },
  goalName: { color: colors.text, fontSize: font.body, fontWeight: '700' },
  goalMeta: { color: colors.textMuted, fontSize: font.tiny, marginTop: 2 },
  goalPercent: { fontSize: font.h2, fontWeight: '800' },
  goalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  goalAction: { flex: 1 },
  deleteButton: {
    width: 48,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  doneBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  doneText: { color: colors.accent, fontSize: font.tiny, fontWeight: '700' },
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
  fieldLabel: { color: colors.textMuted, fontSize: font.small, fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  modalAction: { flex: 1 },
});
