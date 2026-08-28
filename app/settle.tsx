import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { ScreenHeader } from '../components/ScreenHeader';
import { StatTile } from '../components/StatTile';
import { TextField } from '../components/TextField';
import { colors, font, radius, spacing } from '../theme';
import type { PersonBalance } from '../types';
import { formatMoney, moneyToPlainString, parseAmount } from '../utils/currency';
import { formatDatePL, todayISO } from '../utils/dates';
import { useDbData } from '../hooks/useDbData';
import { useApp } from '../state/AppProvider';
import { deleteSettlement, listSettlements } from '../db/repositories/settlements';
import {
  loadBalances,
  personInitials,
  settleWithPerson,
  summarizeBalances,
} from '../services/settlementService';

export default function SettleScreen() {
  const insets = useSafeAreaInsets();
  const { showToast, refresh } = useApp();

  const balancesState = useDbData(() => loadBalances(), []);
  const balances = balancesState.data ?? [];

  const [settling, setSettling] = useState<PersonBalance | null>(null);
  const [historyFor, setHistoryFor] = useState<PersonBalance | null>(null);

  const summary = useMemo(() => summarizeBalances(balances), [balances]);

  const reload = useCallback(() => {
    balancesState.reload();
    refresh();
  }, [balancesState, refresh]);

  const handleSettle = useCallback(
    async (entry: PersonBalance, amount: number, note: string) => {
      // Saldo dodatnie = osoba mi oddaje; ujemne = ja oddaję jej.
      const signed = entry.balance >= 0 ? amount : -amount;
      await settleWithPerson(entry.person.id, signed, todayISO(), note || undefined);
      setSettling(null);
      showToast('Zapisano rozliczenie');
      reload();
    },
    [reload, showToast]
  );

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + 40 },
        ]}
      >
        <ScreenHeader
          title="Rozliczenia"
          subtitle="Kto komu ile jest winien"
          back
          right={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Osoby"
              onPress={() => router.push('/people')}
              style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
            >
              <Ionicons name="people-outline" size={20} color={colors.text} />
            </Pressable>
          }
        />

        <View style={styles.tiles}>
          <StatTile
            label="Do odzyskania"
            amount={summary.toReceive}
            color={colors.accent}
            icon="arrow-down-circle-outline"
            hint={summary.openCount > 0 ? `${summary.openCount} otwartych sald` : 'Wszystko rozliczone'}
          />
          <StatTile
            label="Do oddania"
            amount={summary.toPay}
            color={colors.danger}
            icon="arrow-up-circle-outline"
          />
        </View>

        {balances.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="Brak osób do rozliczenia"
            description="Dodaj osoby, a potem przypisz im pozycje na zeskanowanym paragonie."
          >
            <Button label="Dodaj osoby" icon="person-add-outline" onPress={() => router.push('/people')} />
          </EmptyState>
        ) : (
          <Card>
            <View style={styles.list}>
              {balances.map((entry) => (
                <View key={entry.person.id} style={styles.row}>
                  <View style={[styles.avatar, { backgroundColor: entry.person.color }]}>
                    <Text style={styles.initials}>{personInitials(entry.person)}</Text>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Historia rozliczeń z ${entry.person.name}`}
                    onPress={() => setHistoryFor(entry)}
                    style={({ pressed }) => [styles.rowBody, pressed && styles.pressed]}
                  >
                    <Text style={styles.rowTitle}>{entry.person.name}</Text>
                    <Text style={styles.rowSubtitle}>
                      {entry.balance > 0
                        ? 'Jest Ci winien(a)'
                        : entry.balance < 0
                          ? 'Jesteś winien(a)'
                          : 'Rozliczone'}
                    </Text>
                  </Pressable>

                  <View style={styles.rowRight}>
                    <Text
                      style={[
                        styles.rowValue,
                        {
                          color:
                            entry.balance > 0
                              ? colors.accent
                              : entry.balance < 0
                                ? colors.danger
                                : colors.textFaint,
                        },
                      ]}
                    >
                      {entry.balance === 0 ? '—' : formatMoney(Math.abs(entry.balance))}
                    </Text>
                    {entry.balance !== 0 && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Rozlicz z ${entry.person.name}`}
                        onPress={() => setSettling(entry)}
                        style={({ pressed }) => [styles.settleButton, pressed && styles.pressed]}
                      >
                        <Text style={styles.settleLabel}>Rozlicz</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </Card>
        )}

        <Text style={styles.hint}>
          Rozliczenie nie tworzy nowej transakcji w budżecie — wydatek został zaksięgowany już przy
          zakupie. Zapis zamyka jedynie dług między Wami.
        </Text>
      </ScrollView>

      <SettleDialog entry={settling} onCancel={() => setSettling(null)} onSave={handleSettle} />

      <HistoryDialog
        entry={historyFor}
        onClose={() => setHistoryFor(null)}
        onChanged={reload}
        showToast={showToast}
      />
    </>
  );
}

interface SettleDialogProps {
  entry: PersonBalance | null;
  onCancel: () => void;
  onSave: (entry: PersonBalance, amount: number, note: string) => void;
}

/** Okno zapisu zwrotu — domyślnie na całe otwarte saldo. */
function SettleDialog({ entry, onCancel, onSave }: SettleDialogProps) {
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loadedId, setLoadedId] = useState<number | null>(null);

  if (entry && entry.person.id !== loadedId) {
    setLoadedId(entry.person.id);
    setAmountText(moneyToPlainString(Math.abs(entry.balance)));
    setNote('');
    setError(null);
  }

  const handleSave = () => {
    if (!entry) return;
    const amount = parseAmount(amountText);
    if (amount == null || amount <= 0) {
      setError('Podaj poprawną kwotę');
      return;
    }
    onSave(entry, amount, note.trim());
  };

  const direction =
    entry == null
      ? ''
      : entry.balance > 0
        ? `${entry.person.name} oddaje Ci pieniądze`
        : `Oddajesz pieniądze osobie ${entry.person.name}`;

  return (
    <Modal visible={entry != null} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Rozliczenie</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Zamknij" onPress={onCancel} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <Text style={styles.modalSubtitle}>{direction}</Text>

          <TextField
            label="Kwota"
            value={amountText}
            onChangeText={(value) => {
              setAmountText(value);
              setError(null);
            }}
            keyboardType="decimal-pad"
            suffix="zł"
            error={error}
            hint="Możesz wpisać kwotę mniejszą niż saldo — reszta zostanie otwarta."
          />

          <TextField
            label="Notatka"
            value={note}
            onChangeText={setNote}
            placeholder="np. przelew, gotówka"
          />

          <Button label="Zapisz rozliczenie" icon="checkmark" onPress={handleSave} large />
        </View>
      </View>
    </Modal>
  );
}

interface HistoryDialogProps {
  entry: PersonBalance | null;
  onClose: () => void;
  onChanged: () => void;
  showToast: (text: string, variant?: 'success' | 'error' | 'warning') => void;
}

/** Historia rozliczeń z jedną osobą wraz z rozbiciem salda. */
function HistoryDialog({ entry, onClose, onChanged, showToast }: HistoryDialogProps) {
  const historyState = useDbData(
    () => (entry ? listSettlements(entry.person.id) : Promise.resolve([])),
    [entry?.person.id]
  );
  const history = historyState.data ?? [];

  const handleDelete = (id: number) => {
    Alert.alert('Usunąć rozliczenie?', 'Saldo wróci do stanu sprzed zapisu.', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: async () => {
          await deleteSettlement(id);
          historyState.reload();
          onChanged();
          showToast('Usunięto rozliczenie');
        },
      },
    ]);
  };

  return (
    <Modal visible={entry != null} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{entry?.person.name ?? ''}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Zamknij" onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          {entry && (
            <View style={styles.breakdown}>
              <BreakdownRow label="Z Twoich paragonów" value={formatMoney(entry.owesMe)} />
              <BreakdownRow label="Z paragonów tej osoby" value={formatMoney(entry.iOwe)} />
              <BreakdownRow label="Już rozliczone" value={formatMoney(entry.settled)} />
              <View style={styles.breakdownDivider} />
              <BreakdownRow
                label="Saldo"
                value={entry.balance === 0 ? 'Rozliczone' : formatMoney(entry.balance)}
                color={
                  entry.balance > 0
                    ? colors.accent
                    : entry.balance < 0
                      ? colors.danger
                      : colors.textFaint
                }
                strong
              />
            </View>
          )}

          <Text style={styles.historyTitle}>Historia</Text>

          <ScrollView style={styles.historyList}>
            {history.length === 0 ? (
              <Text style={styles.historyEmpty}>Brak zapisanych rozliczeń.</Text>
            ) : (
              history.map((settlement) => (
                <Pressable
                  key={settlement.id}
                  accessibilityRole="button"
                  accessibilityLabel="Usuń rozliczenie"
                  onLongPress={() => handleDelete(settlement.id)}
                  style={({ pressed }) => [styles.historyRow, pressed && styles.pressed]}
                >
                  <View style={styles.historyBody}>
                    <Text style={styles.historyDate}>{formatDatePL(settlement.date)}</Text>
                    {settlement.note && <Text style={styles.historyNote}>{settlement.note}</Text>}
                  </View>
                  <Text
                    style={[
                      styles.historyAmount,
                      { color: settlement.amount > 0 ? colors.accent : colors.danger },
                    ]}
                  >
                    {settlement.amount > 0 ? '+' : '-'}
                    {formatMoney(Math.abs(settlement.amount))}
                  </Text>
                </Pressable>
              ))
            )}
          </ScrollView>

          <Text style={styles.hint}>Przytrzymaj wpis, aby go usunąć.</Text>
        </View>
      </View>
    </Modal>
  );
}

function BreakdownRow({
  label,
  value,
  color = colors.text,
  strong = false,
}: {
  label: string;
  value: string;
  color?: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.breakdownRow}>
      <Text style={styles.breakdownLabel}>{label}</Text>
      <Text style={[styles.breakdownValue, { color }, strong && styles.breakdownValueStrong]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  headerButton: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  list: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#06210F', fontSize: font.small, fontWeight: '800' },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { color: colors.text, fontSize: font.body, fontWeight: '600' },
  rowSubtitle: { color: colors.textMuted, fontSize: font.tiny },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  rowValue: { fontSize: font.small, fontWeight: '700' },
  settleButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
  },
  settleLabel: { color: colors.accent, fontSize: font.tiny, fontWeight: '700' },
  hint: { color: colors.textFaint, fontSize: font.tiny, lineHeight: 17 },

  modalBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    maxHeight: '85%',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { color: colors.text, fontSize: font.h2, fontWeight: '700' },
  modalSubtitle: { color: colors.textMuted, fontSize: font.small },

  breakdown: {
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  breakdownLabel: { color: colors.textMuted, fontSize: font.small },
  breakdownValue: { fontSize: font.small, fontWeight: '600' },
  breakdownValueStrong: { fontSize: font.body, fontWeight: '800' },
  breakdownDivider: { height: 1, backgroundColor: colors.border },

  historyTitle: { color: colors.text, fontSize: font.small, fontWeight: '700' },
  historyList: { maxHeight: 220 },
  historyEmpty: { color: colors.textMuted, fontSize: font.tiny },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  historyBody: { gap: 2 },
  historyDate: { color: colors.text, fontSize: font.small, fontWeight: '600' },
  historyNote: { color: colors.textMuted, fontSize: font.tiny },
  historyAmount: { fontSize: font.small, fontWeight: '700' },
});
