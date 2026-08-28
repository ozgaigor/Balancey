import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { ScreenHeader } from '../components/ScreenHeader';
import { TextField } from '../components/TextField';
import { colors, font, radius, spacing } from '../theme';
import type { Person } from '../types';
import { formatMoney } from '../utils/currency';
import { useDbData } from '../hooks/useDbData';
import { useApp } from '../state/AppProvider';
import {
  countPersonUsage,
  createPerson,
  deletePerson,
  listPeople,
  updatePerson,
  PERSON_COLORS,
} from '../db/repositories/people';
import { loadBalances, personInitials } from '../services/settlementService';

export default function PeopleScreen() {
  const insets = useSafeAreaInsets();
  const { refresh, showToast } = useApp();

  const peopleState = useDbData(() => listPeople(), []);
  const balancesState = useDbData(() => loadBalances(), []);

  const people = peopleState.data ?? [];
  const balances = balancesState.data ?? [];

  const [editing, setEditing] = useState<Person | 'new' | null>(null);

  const reload = useCallback(() => {
    peopleState.reload();
    balancesState.reload();
    refresh();
  }, [balancesState, peopleState, refresh]);

  const handleSave = useCallback(
    async (name: string, color: string) => {
      const trimmed = name.trim();
      if (trimmed === '') {
        showToast('Podaj imię', 'warning');
        return;
      }

      if (editing === 'new') {
        await createPerson({ name: trimmed, color });
        showToast(`Dodano: ${trimmed}`);
      } else if (editing) {
        await updatePerson(editing.id, { name: trimmed, color });
        showToast('Zapisano zmiany');
      }

      setEditing(null);
      reload();
    },
    [editing, reload, showToast]
  );

  const handleDelete = useCallback(
    async (person: Person) => {
      const uses = await countPersonUsage(person.id);
      const detail =
        uses > 0
          ? `Ta osoba ma przypisane pozycje na ${uses} produktach. Kwoty zakupów zostaną nietknięte, zniknie tylko przypisanie i saldo.`
          : 'Tej operacji nie można cofnąć.';

      Alert.alert(`Usunąć: ${person.name}?`, detail, [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usuń',
          style: 'destructive',
          onPress: async () => {
            await deletePerson(person.id);
            showToast('Usunięto osobę');
            reload();
          },
        },
      ]);
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
          title="Osoby"
          subtitle="Do podziału kosztów z paragonów"
          back
          right={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dodaj osobę"
              onPress={() => setEditing('new')}
              style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
            >
              <Ionicons name="add" size={22} color={colors.text} />
            </Pressable>
          }
        />

        {people.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="Brak osób"
            description="Dodaj domowników lub znajomych, z którymi dzielisz zakupy."
          >
            <Button label="Dodaj osobę" icon="add" onPress={() => setEditing('new')} />
          </EmptyState>
        ) : (
          <Card>
            <View style={styles.list}>
              {people.map((person) => {
                const balance = balances.find((entry) => entry.person.id === person.id);
                return (
                  <Pressable
                    key={person.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Edytuj ${person.name}`}
                    onPress={() => setEditing(person)}
                    onLongPress={() => !person.isMe && handleDelete(person)}
                    style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                  >
                    <View style={[styles.avatar, { backgroundColor: person.color }]}>
                      <Text style={styles.initials}>{personInitials(person)}</Text>
                    </View>

                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle}>{person.name}</Text>
                      <Text style={styles.rowSubtitle}>
                        {person.isMe
                          ? 'To Ty — punkt odniesienia dla sald'
                          : describeShort(balance?.balance ?? 0)}
                      </Text>
                    </View>

                    {!person.isMe && (
                      <Text
                        style={[
                          styles.rowValue,
                          {
                            color:
                              (balance?.balance ?? 0) > 0
                                ? colors.accent
                                : (balance?.balance ?? 0) < 0
                                  ? colors.danger
                                  : colors.textFaint,
                          },
                        ]}
                      >
                        {formatMoney(Math.abs(balance?.balance ?? 0))}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </Card>
        )}

        <Text style={styles.hint}>
          Przytrzymaj osobę, aby ją usunąć. Osoby „Ja” nie można usunąć — bez niej salda nie mają
          punktu odniesienia.
        </Text>

        <Button
          label="Rozliczenia"
          icon="swap-horizontal-outline"
          variant="secondary"
          onPress={() => router.push('/settle')}
        />
      </ScrollView>

      <PersonEditor
        target={editing}
        onCancel={() => setEditing(null)}
        onSave={handleSave}
      />
    </>
  );
}

function describeShort(balance: number): string {
  if (balance > 0) return 'Jest Ci winien(a)';
  if (balance < 0) return 'Jesteś winien(a)';
  return 'Rozliczone';
}

interface PersonEditorProps {
  target: Person | 'new' | null;
  onCancel: () => void;
  onSave: (name: string, color: string) => void;
}

function PersonEditor({ target, onCancel, onSave }: PersonEditorProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(PERSON_COLORS[0]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  const key = target === 'new' ? 'new' : target ? `person-${target.id}` : null;

  if (target && key !== loadedKey) {
    setLoadedKey(key);
    setName(target === 'new' ? '' : target.name);
    setColor(target === 'new' ? PERSON_COLORS[0] : target.color);
  }

  return (
    <Modal visible={target != null} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {target === 'new' ? 'Nowa osoba' : 'Edycja osoby'}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Zamknij" onPress={onCancel} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <TextField
            label="Imię"
            value={name}
            onChangeText={setName}
            placeholder="np. Kasia"
            autoFocus
            maxLength={30}
          />

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Kolor</Text>
            <View style={styles.colorRow}>
              {PERSON_COLORS.map((entry) => (
                <Pressable
                  key={entry}
                  accessibilityRole="button"
                  accessibilityLabel={`Kolor ${entry}`}
                  accessibilityState={{ selected: color === entry }}
                  onPress={() => setColor(entry)}
                  style={({ pressed }) => [
                    styles.colorSwatch,
                    { backgroundColor: entry },
                    color === entry && styles.colorSwatchActive,
                    pressed && styles.pressed,
                  ]}
                >
                  {color === entry && <Ionicons name="checkmark" size={18} color="#06210F" />}
                </Pressable>
              ))}
            </View>
          </View>

          <Button label="Zapisz" icon="checkmark" onPress={() => onSave(name, color)} large />
        </View>
      </View>
    </Modal>
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
  list: { gap: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingVertical: spacing.sm,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#06210F', fontSize: font.small, fontWeight: '800' },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { color: colors.text, fontSize: font.body, fontWeight: '600' },
  rowSubtitle: { color: colors.textMuted, fontSize: font.tiny },
  rowValue: { fontSize: font.small, fontWeight: '700' },
  hint: { color: colors.textFaint, fontSize: font.tiny, lineHeight: 17 },
  modalBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { color: colors.text, fontSize: font.h2, fontWeight: '700' },
  fieldGroup: { gap: spacing.sm },
  fieldLabel: { color: colors.textMuted, fontSize: font.small, fontWeight: '600' },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  colorSwatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSwatchActive: { borderColor: colors.text },
});
