import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { CategoryButton } from '../components/CategoryButton';
import { DateField } from '../components/DateField';
import { PersonPicker } from '../components/PersonPicker';
import { ReceiptItemRow } from '../components/ReceiptItemRow';
import { ScreenHeader } from '../components/ScreenHeader';
import { TextField } from '../components/TextField';
import { colors, font, radius, spacing } from '../theme';
import { QUANTITY_SCALE } from '../types';
import { formatMoney, moneyToPlainString, parseAmount } from '../utils/currency';
import { splitEvenly } from '../utils/split';
import { useDbData } from '../hooks/useDbData';
import { useApp } from '../state/AppProvider';
import { listCategories } from '../db/repositories/categories';
import { listPeople } from '../db/repositories/people';
import { isOcrAvailable, OCR_UNAVAILABLE_MESSAGE, recognizeReceipt } from '../services/ocrService';
import {
  buildDraftFromText,
  buildEmptyDraft,
  draftTotal,
  nextItemKey,
  saveReceipt,
  type DraftItem,
  type DraftReceipt,
} from '../services/receiptService';
import { notifyBudgetAlert } from '../services/notificationService';

type Phase = 'camera' | 'working' | 'review';

export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const { refresh, showToast, settings } = useApp();

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [phase, setPhase] = useState<Phase>('camera');
  const [status, setStatus] = useState('');
  /**
   * Aparat zgłasza gotowość dopiero po uruchomieniu podglądu. Zrobienie
   * zdjęcia wcześniej kończy się wyjątkiem, dlatego spust jest do tego
   * czasu zablokowany (wymóg z dokumentacji `takePictureAsync`).
   */
  const [cameraReady, setCameraReady] = useState(false);
  const [draft, setDraft] = useState<DraftReceipt | null>(null);
  const [payerId, setPayerId] = useState<number | null>(null);
  const [editing, setEditing] = useState<DraftItem | null>(null);
  const [saving, setSaving] = useState(false);

  const peopleState = useDbData(() => listPeople(), []);
  const categoriesState = useDbData(() => listCategories('expense'), []);
  const people = peopleState.data ?? [];
  const categories = categoriesState.data ?? [];

  const total = draft ? draftTotal(draft.items) : 0;

  /** Ile z paragonu przypada na każdą osobę — podsumowanie pod listą. */
  const perPerson = useMemo(() => {
    if (!draft) return [];
    const totals = new Map<number, number>();

    for (const item of draft.items) {
      const amounts = splitEvenly(item.total, item.personIds.length);
      item.personIds.forEach((personId, index) => {
        totals.set(personId, (totals.get(personId) ?? 0) + amounts[index]);
      });
    }

    return people
      .map((person) => ({ person, amount: totals.get(person.id) ?? 0 }))
      .filter((entry) => entry.amount > 0);
  }, [draft, people]);

  const assignedTotal = perPerson.reduce((acc, entry) => acc + entry.amount, 0);

  const startDraft = useCallback(
    async (task: () => Promise<DraftReceipt>, label: string) => {
      setPhase('working');
      setStatus(label);
      try {
        const result = await task();
        setDraft(result);
        // Domyślnie płacę ja — najczęstszy przypadek przy skanowaniu paragonu.
        const me = people.find((person) => person.isMe);
        setPayerId(me?.id ?? null);
        setPhase('review');
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Nie udało się odczytać', 'error');
        setPhase('camera');
      }
    },
    [people, showToast]
  );

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current) return;

    if (!cameraReady) {
      showToast('Aparat jeszcze się uruchamia — spróbuj za chwilę', 'warning');
      return;
    }

    if (!isOcrAvailable()) {
      showToast(OCR_UNAVAILABLE_MESSAGE, 'warning');
      return;
    }

    let photoUri: string | null = null;
    setPhase('working');
    setStatus('Robię zdjęcie…');

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      photoUri = photo?.uri ?? null;
    } catch (error) {
      // Treść wyjątku jest tu jedyną wskazówką, co poszło nie tak — pokazujemy ją.
      const detail = error instanceof Error ? error.message : String(error);
      showToast(`Nie udało się zrobić zdjęcia: ${detail}`, 'error');
      setPhase('camera');
      return;
    }

    if (!photoUri) {
      showToast('Aparat nie zwrócił zdjęcia', 'error');
      setPhase('camera');
      return;
    }

    await startDraft(async () => {
      const result = await recognizeReceipt(photoUri as string);
      return buildDraftFromText(result.text, result.imageUri);
    }, 'Odczytuję paragon…');
  }, [cameraReady, showToast, startDraft]);

  const handleManual = useCallback(async () => {
    await startDraft(() => buildEmptyDraft(), 'Przygotowuję…');
  }, [startDraft]);

  const updateDraft = useCallback((change: (current: DraftReceipt) => DraftReceipt) => {
    setDraft((current) => (current ? change(current) : current));
  }, []);

  const togglePerson = useCallback(
    (itemKey: string, personId: number) => {
      updateDraft((current) => ({
        ...current,
        items: current.items.map((item) =>
          item.key === itemKey
            ? {
                ...item,
                personIds: item.personIds.includes(personId)
                  ? item.personIds.filter((id) => id !== personId)
                  : [...item.personIds, personId],
              }
            : item
        ),
      }));
    },
    [updateDraft]
  );

  const assignAll = useCallback(
    (personIds: number[]) => {
      updateDraft((current) => ({
        ...current,
        items: current.items.map((item) => ({ ...item, personIds: [...personIds] })),
      }));
    },
    [updateDraft]
  );

  const addItem = useCallback(() => {
    const me = people.find((person) => person.isMe);
    setEditing({
      key: nextItemKey(),
      name: '',
      quantity: QUANTITY_SCALE,
      unitPrice: 0,
      total: 0,
      categoryId: draft?.fallbackCategoryId ?? null,
      personIds: me ? [me.id] : [],
    });
  }, [draft?.fallbackCategoryId, people]);

  const commitItem = useCallback(
    (item: DraftItem) => {
      updateDraft((current) => {
        const exists = current.items.some((entry) => entry.key === item.key);
        return {
          ...current,
          items: exists
            ? current.items.map((entry) => (entry.key === item.key ? item : entry))
            : [...current.items, item],
        };
      });
      setEditing(null);
    },
    [updateDraft]
  );

  const removeItem = useCallback(
    (itemKey: string) => {
      updateDraft((current) => ({
        ...current,
        items: current.items.filter((item) => item.key !== itemKey),
      }));
    },
    [updateDraft]
  );

  const handleSave = useCallback(async () => {
    if (!draft) return;

    setSaving(true);
    try {
      const result = await saveReceipt(draft, payerId);
      refresh();

      // Ostrzeżenie o budżecie jest ważniejsze niż samo potwierdzenie zapisu.
      if (result.alerts.length > 0) {
        const alert = result.alerts[0];
        showToast(`${alert.title}. ${alert.body}`, alert.level === 'danger' ? 'error' : 'warning');
        if (settings.notificationsEnabled) {
          await notifyBudgetAlert(alert.title, alert.body);
        }
      } else {
        showToast(result.message);
      }

      router.replace(`/receipt/${result.receiptId}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Nie udało się zapisać', 'error');
    } finally {
      setSaving(false);
    }
  }, [draft, payerId, refresh, settings, showToast]);

  /* ----------------------------- aparat ----------------------------- */

  if (phase === 'camera') {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
        <ScreenHeader title="Skanuj paragon" subtitle="Zdjęcie zostaje na telefonie" back />

        <View style={styles.cameraWrapper}>
          {permission?.granted ? (
            <CameraView
              ref={cameraRef}
              style={styles.camera}
              facing="back"
              onCameraReady={() => setCameraReady(true)}
              onMountError={(event) => {
                setCameraReady(false);
                showToast(`Aparat się nie uruchomił: ${event.message}`, 'error');
              }}
            >
              <View style={styles.frame} pointerEvents="none" />
            </CameraView>
          ) : (
            <View style={styles.permissionBox}>
              <Ionicons name="camera-outline" size={40} color={colors.textMuted} />
              <Text style={styles.permissionTitle}>Potrzebny dostęp do aparatu</Text>
              <Text style={styles.permissionBody}>
                Zdjęcie paragonu jest odczytywane na urządzeniu i nigdzie nie jest wysyłane.
              </Text>
              <Button label="Zezwól na aparat" icon="camera" onPress={requestPermission} />
            </View>
          )}
        </View>

        <View style={[styles.cameraActions, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Text style={styles.hint}>
            {permission?.granted && !cameraReady
              ? 'Uruchamiam aparat…'
              : 'Ustaw paragon w ramce, tak aby widoczna była cała lista.'}
          </Text>
          <Button
            label="Zrób zdjęcie"
            icon="scan-outline"
            onPress={handleCapture}
            disabled={!permission?.granted || !cameraReady}
            large
          />
          <Button
            label="Wpisz pozycje ręcznie"
            icon="create-outline"
            variant="ghost"
            onPress={handleManual}
          />
        </View>
      </View>
    );
  }

  /* --------------------------- rozpoznawanie --------------------------- */

  if (phase === 'working' || !draft) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.working}>{status}</Text>
      </View>
    );
  }

  /* ------------------------- korekta i podział ------------------------- */

  const mismatch = draft.scannedTotal != null ? draft.scannedTotal - total : null;

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader
          title="Paragon"
          subtitle={`${draft.items.length} ${itemWord(draft.items.length)} · ${formatMoney(total)}`}
          back
        />

        {draft.warnings.length > 0 && (
          <View style={styles.warningBox}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.warning} />
            <View style={styles.warningTexts}>
              {draft.warnings.map((warning) => (
                <Text key={warning} style={styles.warningText}>
                  {warning}
                </Text>
              ))}
            </View>
          </View>
        )}

        <Card>
          <View style={styles.form}>
            <TextField
              label="Sklep"
              value={draft.merchant}
              onChangeText={(value) => updateDraft((current) => ({ ...current, merchant: value }))}
              placeholder="np. Biedronka"
            />
            <DateField
              label="Data"
              value={draft.date}
              onChange={(value) => updateDraft((current) => ({ ...current, date: value }))}
            />
            <PersonPicker
              label="Kto zapłacił"
              people={people}
              selected={payerId != null ? [payerId] : []}
              onToggle={(personId) => setPayerId((current) => (current === personId ? null : personId))}
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

        {draft.items.map((item) => {
          const category = categories.find((entry) => entry.id === item.categoryId);
          return (
            <ReceiptItemRow
              key={item.key}
              name={item.name}
              quantity={item.quantity}
              total={item.total}
              categoryName={category?.name ?? null}
              categoryColor={category?.color ?? null}
              people={people}
              selectedPeople={item.personIds}
              onTogglePerson={(personId) => togglePerson(item.key, personId)}
              onEdit={() => setEditing(item)}
              onDelete={() => removeItem(item.key)}
            />
          );
        })}

        <Button label="Dodaj pozycję" icon="add" variant="secondary" onPress={addItem} />

        <Card title="Podsumowanie">
          <View style={styles.summary}>
            <SummaryRow label="Suma pozycji" value={formatMoney(total)} strong />
            {draft.scannedTotal != null && (
              <SummaryRow
                label="Suma z paragonu"
                value={formatMoney(draft.scannedTotal)}
                color={mismatch === 0 ? colors.accent : colors.warning}
              />
            )}
            {mismatch != null && mismatch !== 0 && (
              <Text style={styles.mismatch}>
                Różnica {formatMoney(Math.abs(mismatch))} — sprawdź kwoty pozycji. Do budżetu trafi
                suma pozycji.
              </Text>
            )}

            <View style={styles.divider} />

            {perPerson.length === 0 ? (
              <Text style={styles.emptyShare}>
                Żadna pozycja nie jest przypisana — cały paragon będzie kosztem wspólnym.
              </Text>
            ) : (
              perPerson.map((entry) => (
                <SummaryRow
                  key={entry.person.id}
                  label={entry.person.name}
                  value={formatMoney(entry.amount)}
                  color={entry.person.color}
                />
              ))
            )}

            {assignedTotal !== total && (
              <SummaryRow
                label="Nieprzypisane"
                value={formatMoney(total - assignedTotal)}
                color={colors.textMuted}
              />
            )}
          </View>
        </Card>

        <Button
          label="Zapisz wydatek"
          icon="checkmark"
          onPress={handleSave}
          loading={saving}
          disabled={draft.items.length === 0}
          large
        />
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

/* --------------------------- edycja pozycji --------------------------- */

interface ItemEditorProps {
  item: DraftItem | null;
  categories: { id: number; name: string; icon: string; color: string }[];
  onCancel: () => void;
  onSave: (item: DraftItem) => void;
}

/**
 * Okno poprawiania pojedynczej pozycji. Kwota jest jedynym polem wymaganym —
 * to ona trafia do budżetu i do podziału między osoby.
 */
function ItemEditor({ item, categories, onCancel, onSave }: ItemEditorProps) {
  const [name, setName] = useState('');
  const [amountText, setAmountText] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Formularz wypełniamy przy każdym otwarciu innej pozycji.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  if (item && item.key !== loadedKey) {
    setLoadedKey(item.key);
    setName(item.name);
    setAmountText(item.total > 0 ? moneyToPlainString(item.total) : '');
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

    const quantity = item.quantity > 0 ? item.quantity : QUANTITY_SCALE;

    onSave({
      ...item,
      name: name.trim() || 'Pozycja',
      total: amount,
      // Cena jednostkowa musi zgadzać się z nową kwotą, inaczej szczegóły kłamią.
      unitPrice: Math.round((amount * QUANTITY_SCALE) / quantity),
      categoryId,
    });
  };

  return (
    <Modal visible={item != null} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Pozycja</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Zamknij"
              onPress={onCancel}
              hitSlop={8}
            >
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalBody}>
            <TextField label="Nazwa" value={name} onChangeText={setName} placeholder="np. Mleko" />
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
              autoFocus
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

          <Button label="Gotowe" icon="checkmark" onPress={handleSave} large />
        </View>
      </View>
    </Modal>
  );
}

function SummaryRow({
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
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, { color }, strong && styles.summaryValueStrong]}>
        {value}
      </Text>
    </View>
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
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  working: { color: colors.textMuted, fontSize: font.small },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },

  cameraWrapper: {
    flex: 1,
    margin: spacing.lg,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.card,
  },
  camera: { flex: 1 },
  frame: {
    flex: 1,
    margin: spacing.xl,
    borderWidth: 2,
    borderColor: 'rgba(34, 197, 94, 0.7)',
    borderRadius: radius.md,
  },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  permissionTitle: { color: colors.text, fontSize: font.h2, fontWeight: '700' },
  permissionBody: { color: colors.textMuted, fontSize: font.small, textAlign: 'center' },
  cameraActions: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  hint: { color: colors.textMuted, fontSize: font.tiny, textAlign: 'center' },

  warningBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  warningTexts: { flex: 1, gap: 2 },
  warningText: { color: colors.warning, fontSize: font.tiny, lineHeight: 17 },

  form: { gap: spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: colors.text, fontSize: font.h2, fontWeight: '700' },
  sectionActions: { flexDirection: 'row', gap: spacing.md },
  sectionAction: { color: colors.accent, fontSize: font.tiny, fontWeight: '700' },
  pressed: { opacity: 0.65 },

  summary: { gap: spacing.sm },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  summaryLabel: { color: colors.textMuted, fontSize: font.small },
  summaryValue: { fontSize: font.small, fontWeight: '600' },
  summaryValueStrong: { fontSize: font.body, fontWeight: '800' },
  mismatch: { color: colors.warning, fontSize: font.tiny, lineHeight: 17 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  emptyShare: { color: colors.textMuted, fontSize: font.tiny, lineHeight: 17 },

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
