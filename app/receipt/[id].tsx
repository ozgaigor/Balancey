import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { CategoryButton } from '../../components/CategoryButton';
import { PersonPicker } from '../../components/PersonPicker';
import { ReceiptItemRow } from '../../components/ReceiptItemRow';
import { ScreenHeader } from '../../components/ScreenHeader';
import { TextField } from '../../components/TextField';
import { colors, font, radius, spacing } from '../../theme';
import { QUANTITY_SCALE, type ReceiptItemWithShares } from '../../types';
import { formatMoney, moneyToPlainString, parseAmount } from '../../utils/currency';
import { formatDateLong } from '../../utils/dates';
import { shareEvenly } from '../../utils/split';
import { useDbData } from '../../hooks/useDbData';
import { useApp } from '../../state/AppProvider';
import { listCategories } from '../../db/repositories/categories';
import { listPeople } from '../../db/repositories/people';
import {
  deleteItem,
  getReceipt,
  setItemShares,
  updateItem,
  updateReceipt,
} from '../../db/repositories/receipts';
import {
  deleteReceiptWithTransaction,
  syncReceiptTotals,
} from '../../services/receiptService';

export default function ReceiptDetailsScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const receiptId = Number.parseInt(id ?? '', 10);
  const { refresh, showToast } = useApp();

  const receiptState = useDbData(() => getReceipt(receiptId), [receiptId]);
  const peopleState = useDbData(() => listPeople(), []);
  const categoriesState = useDbData(() => listCategories('expense'), []);

  const receipt = receiptState.data;
  const people = peopleState.data ?? [];
  const categories = categoriesState.data ?? [];

  const [editing, setEditing] = useState<ReceiptItemWithShares | null>(null);
  const [busy, setBusy] = useState(false);

  /** Ile z paragonu przypada na każdą osobę. */
  const perPerson = useMemo(() => {
    if (!receipt) return [];
    const totals = new Map<number, number>();

    for (const item of receipt.items) {
      for (const share of item.shares) {
        totals.set(share.personId, (totals.get(share.personId) ?? 0) + share.amount);
      }
    }

    return people
      .map((person) => ({ person, amount: totals.get(person.id) ?? 0 }))
      .filter((entry) => entry.amount > 0);
  }, [receipt, people]);

  const assigned = perPerson.reduce((acc, entry) => acc + entry.amount, 0);

  /** Każda zmiana kończy się wyrównaniem kwot i odświeżeniem widoku. */
  const runChange = useCallback(
    async (task: () => Promise<void>) => {
      setBusy(true);
      try {
        await task();
        await syncReceiptTotals(receiptId);
        receiptState.reload();
        refresh();
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Nie udało się zapisać', 'error');
      } finally {
        setBusy(false);
      }
    },
    [receiptId, receiptState, refresh, showToast]
  );

  const togglePerson = useCallback(
    (item: ReceiptItemWithShares, personId: number) => {
      const current = item.shares.map((share) => share.personId);
      const next = current.includes(personId)
        ? current.filter((entry) => entry !== personId)
        : [...current, personId];

      // Udziały zawsze przeliczamy od nowa, żeby suma zgadzała się co do grosza.
      void runChange(() => setItemShares(item.id, shareEvenly(item.total, next)));
    },
    [runChange]
  );

  const assignAll = useCallback(
    (personIds: number[]) => {
      if (!receipt) return;
      void runChange(async () => {
        for (const item of receipt.items) {
          await setItemShares(item.id, shareEvenly(item.total, personIds));
        }
      });
    },
    [receipt, runChange]
  );

  const commitItem = useCallback(
    (item: ReceiptItemWithShares, name: string, total: number, categoryId: number | null) => {
      setEditing(null);
      void runChange(async () => {
        const quantity = item.quantity > 0 ? item.quantity : QUANTITY_SCALE;
        await updateItem(item.id, {
          name,
          total,
          unitPrice: Math.round((total * QUANTITY_SCALE) / quantity),
          categoryId,
        });
        // Zmiana kwoty pozycji wymaga ponownego podziału na te same osoby.
        await setItemShares(
          item.id,
          shareEvenly(
            total,
            item.shares.map((share) => share.personId)
          )
        );
      });
    },
    [runChange]
  );

  const removeItem = useCallback(
    (item: ReceiptItemWithShares) => {
      if (!receipt) return;

      if (receipt.items.length === 1) {
        showToast('Paragon musi mieć co najmniej jedną pozycję', 'warning');
        return;
      }

      void runChange(() => deleteItem(item.id));
    },
    [receipt, runChange, showToast]
  );

  const changePayer = useCallback(
    (personId: number) => {
      void runChange(() =>
        updateReceipt(receiptId, {
          payerId: receipt?.payerId === personId ? null : personId,
        })
      );
    },
    [receipt?.payerId, receiptId, runChange]
  );

  const handleDelete = useCallback(() => {
    Alert.alert(
      'Usunąć paragon?',
      'Zniknie też powiązany wydatek wraz z podziałem na osoby. Tej operacji nie można cofnąć.',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usuń',
          style: 'destructive',
          onPress: async () => {
            await deleteReceiptWithTransaction(receiptId);
            refresh();
            showToast('Usunięto paragon');
            if (router.canGoBack()) router.back();
            else router.replace('/');
          },
        },
      ]
    );
  }, [receiptId, refresh, showToast]);

  if (!receipt) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
        <ScreenHeader title="Paragon" back />
        <Text style={styles.placeholder}>
          {receiptState.loading ? 'Wczytuję…' : 'Nie znaleziono paragonu.'}
        </Text>
      </View>
    );
  }

  const payer = people.find((person) => person.id === receipt.payerId);

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
          title={receipt.merchant || 'Paragon'}
          subtitle={formatDateLong(receipt.date)}
          back
          right={
            receipt.transactionId != null ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Pokaż wydatek"
                onPress={() => router.push(`/transaction/${receipt.transactionId}`)}
                style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
              >
                <Ionicons name="receipt-outline" size={20} color={colors.text} />
              </Pressable>
            ) : undefined
          }
        />

        <Card>
          <View style={styles.hero}>
            <Text style={styles.heroAmount}>{formatMoney(receipt.total)}</Text>
            <Text style={styles.heroMeta}>
              {receipt.items.length} {itemWord(receipt.items.length)}
              {receipt.source === 'scan' ? ' · zeskanowany' : ' · wpisany ręcznie'}
            </Text>
          </View>

          <View style={styles.payerBox}>
            <PersonPicker
              label={payer ? `Zapłacił(a): ${payer.name}` : 'Kto zapłacił'}
              people={people}
              selected={receipt.payerId != null ? [receipt.payerId] : []}
              onToggle={changePayer}
            />
          </View>
        </Card>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Pozycje</Text>
          <View style={styles.sectionActions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => assignAll(people.map((person) => person.id))}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Text style={styles.sectionAction}>Podziel wszystko</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => assignAll([])}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Text style={styles.sectionAction}>Wyczyść</Text>
            </Pressable>
          </View>
        </View>

        {receipt.items.map((item) => (
          <ReceiptItemRow
            key={item.id}
            name={item.name}
            quantity={item.quantity}
            total={item.total}
            categoryName={item.categoryName}
            categoryColor={item.categoryColor}
            people={people}
            selectedPeople={item.shares.map((share) => share.personId)}
            onTogglePerson={(personId) => togglePerson(item, personId)}
            onEdit={() => setEditing(item)}
            onDelete={() => removeItem(item)}
          />
        ))}

        <Card title="Podział">
          <View style={styles.summary}>
            {perPerson.length === 0 ? (
              <Text style={styles.emptyShare}>
                Nic nie jest przypisane — cały paragon jest kosztem wspólnym.
              </Text>
            ) : (
              perPerson.map((entry) => (
                <View key={entry.person.id} style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>{entry.person.name}</Text>
                  <Text style={[styles.summaryValue, { color: entry.person.color }]}>
                    {formatMoney(entry.amount)}
                  </Text>
                </View>
              ))
            )}

            {assigned !== receipt.total && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Nieprzypisane</Text>
                <Text style={[styles.summaryValue, { color: colors.textMuted }]}>
                  {formatMoney(receipt.total - assigned)}
                </Text>
              </View>
            )}
          </View>
        </Card>

        <Button
          label="Rozliczenia"
          icon="swap-horizontal-outline"
          variant="secondary"
          onPress={() => router.push('/settle')}
        />

        <Button label="Usuń paragon" icon="trash-outline" variant="danger" onPress={handleDelete} />

        {busy && <Text style={styles.busy}>Zapisuję…</Text>}
      </ScrollView>

      <ItemEditor
        item={editing}
        categories={categories}
        onCancel={() => setEditing(null)}
        onSave={commitItem}
      />
    </>
  );
}

interface ItemEditorProps {
  item: ReceiptItemWithShares | null;
  categories: { id: number; name: string; icon: string; color: string }[];
  onCancel: () => void;
  onSave: (
    item: ReceiptItemWithShares,
    name: string,
    total: number,
    categoryId: number | null
  ) => void;
}

function ItemEditor({ item, categories, onCancel, onSave }: ItemEditorProps) {
  const [name, setName] = useState('');
  const [amountText, setAmountText] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedId, setLoadedId] = useState<number | null>(null);

  if (item && item.id !== loadedId) {
    setLoadedId(item.id);
    setName(item.name);
    setAmountText(moneyToPlainString(item.total));
    setCategoryId(item.categoryId);
    setError(null);
  }

  const handleSave = () => {
    if (!item) return;
    const amount = parseAmount(amountText);
    if (amount == null || amount <= 0) {
      setError('Podaj poprawną kwotę');
      return;
    }
    onSave(item, name.trim() || 'Pozycja', amount, categoryId);
  };

  return (
    <Modal visible={item != null} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Pozycja</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Zamknij" onPress={onCancel} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalBody}>
            <TextField label="Nazwa" value={name} onChangeText={setName} />
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
              hint="Zmiana kwoty przelicza udziały przypisanych osób."
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
          </ScrollView>

          <Button label="Zapisz" icon="checkmark" onPress={handleSave} large />
        </View>
      </View>
    </Modal>
  );
}

function itemWord(count: number): string {
  if (count === 1) return 'pozycja';
  if (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20)) {
    return 'pozycje';
  }
  return 'pozycji';
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  placeholder: { color: colors.textMuted, fontSize: font.small, paddingHorizontal: spacing.lg },
  headerButton: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  hero: { alignItems: 'center', gap: 4, paddingBottom: spacing.lg },
  heroAmount: { color: colors.danger, fontSize: 32, fontWeight: '800' },
  heroMeta: { color: colors.textMuted, fontSize: font.tiny },
  payerBox: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: colors.text, fontSize: font.h2, fontWeight: '700' },
  sectionActions: { flexDirection: 'row', gap: spacing.md },
  sectionAction: { color: colors.accent, fontSize: font.tiny, fontWeight: '700' },
  summary: { gap: spacing.sm },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  summaryLabel: { color: colors.textMuted, fontSize: font.small },
  summaryValue: { fontSize: font.small, fontWeight: '700' },
  emptyShare: { color: colors.textMuted, fontSize: font.tiny, lineHeight: 17 },
  busy: { color: colors.textFaint, fontSize: font.tiny, textAlign: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.lg,
    maxHeight: '88%',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { color: colors.text, fontSize: font.h2, fontWeight: '700' },
  modalBody: { gap: spacing.lg, paddingBottom: spacing.md },
  fieldGroup: { gap: spacing.sm },
  fieldLabel: { color: colors.textMuted, fontSize: font.small, fontWeight: '600' },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
