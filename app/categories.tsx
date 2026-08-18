import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ScreenHeader } from '../components/ScreenHeader';
import { SegmentedControl } from '../components/SegmentedControl';
import { TextField } from '../components/TextField';
import { colors, font, radius, spacing, typeLabel } from '../theme';
import type { Category, TransactionType } from '../types';
import { useDbData } from '../hooks/useDbData';
import { useApp } from '../state/AppProvider';
import {
  countCategoryUsage,
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from '../db/repositories/categories';

const ICONS: string[] = [
  'fast-food-outline',
  'cart-outline',
  'car-outline',
  'bus-outline',
  'home-outline',
  'business-outline',
  'game-controller-outline',
  'medkit-outline',
  'fitness-outline',
  'paw-outline',
  'shirt-outline',
  'color-palette-outline',
  'gift-outline',
  'airplane-outline',
  'school-outline',
  'book-outline',
  'wifi-outline',
  'call-outline',
  'flash-outline',
  'water-outline',
  'flame-outline',
  'card-outline',
  'briefcase-outline',
  'construct-outline',
  'trophy-outline',
  'wallet-outline',
  'trending-up-outline',
  'umbrella-outline',
  'cafe-outline',
  'beer-outline',
  'basket-outline',
  'ellipsis-horizontal-outline',
];

const COLORS: string[] = [
  '#22C55E',
  '#F0546B',
  '#7C9CF5',
  '#F5A524',
  '#3FC7C0',
  '#B48CF2',
  '#F58BA0',
  '#8FD14F',
  '#5FB0F5',
  '#E0A458',
  '#4FD1C5',
  '#93A1B0',
];

const KIND_OPTIONS: { value: TransactionType; label: string; color: string }[] = [
  { value: 'expense', label: 'Wydatki', color: colors.danger },
  { value: 'income', label: 'Przychody', color: colors.accent },
  { value: 'bill', label: 'Rachunki', color: colors.bills },
  { value: 'saving', label: 'Oszczędności', color: colors.savings },
];

export default function CategoriesScreen() {
  const insets = useSafeAreaInsets();
  const { refresh, showToast } = useApp();

  const [kind, setKind] = useState<TransactionType>('expense');
  const [editor, setEditor] = useState<{ mode: 'create' | 'edit'; category?: Category } | null>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(ICONS[0]);
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);

  const categoriesState = useDbData(() => listCategories(kind), [kind]);
  const categories = categoriesState.data ?? [];

  const openCreate = () => {
    setName('');
    setIcon(ICONS[0]);
    setColor(COLORS[0]);
    setEditor({ mode: 'create' });
  };

  const openEdit = (category: Category) => {
    setName(category.name);
    setIcon(category.icon);
    setColor(category.color);
    setEditor({ mode: 'edit', category });
  };

  const handleSave = useCallback(async () => {
    if (name.trim() === '') {
      showToast('Podaj nazwę kategorii', 'warning');
      return;
    }

    setSaving(true);
    try {
      if (editor?.mode === 'edit' && editor.category) {
        await updateCategory(editor.category.id, { name, icon, color });
        showToast('Zapisano kategorię');
      } else {
        await createCategory({ name, kind, icon, color });
        showToast('Dodano kategorię');
      }
      setEditor(null);
      refresh();
      categoriesState.reload();
    } finally {
      setSaving(false);
    }
  }, [categoriesState, color, editor, icon, kind, name, refresh, showToast]);

  const handleDelete = useCallback(
    async (category: Category) => {
      const usage = await countCategoryUsage(category.id);
      Alert.alert(
        `Usunąć kategorię „${category.name}”?`,
        usage > 0
          ? `${usage} ${usage === 1 ? 'transakcja korzysta' : 'transakcji korzysta'} z tej kategorii. Transakcje pozostaną, ale stracą przypisanie do kategorii.`
          : 'Tej operacji nie można cofnąć.',
        [
          { text: 'Anuluj', style: 'cancel' },
          {
            text: 'Usuń',
            style: 'destructive',
            onPress: async () => {
              await deleteCategory(category.id);
              refresh();
              categoriesState.reload();
              showToast('Usunięto kategorię');
            },
          },
        ]
      );
    },
    [categoriesState, refresh, showToast]
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.headerBox}>
        <ScreenHeader title="Kategorie" subtitle="Własne kategorie i ikony" back />
        <SegmentedControl
          options={KIND_OPTIONS}
          value={kind}
          onChange={(value) => setKind(value)}
        />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
      >
        <Card title={`${typeLabel(kind, true)} — ${categories.length}`}>
          <View style={styles.list}>
            {categories.map((category) => (
              <View key={category.id} style={styles.row}>
                <View style={[styles.iconBox, { backgroundColor: `${category.color}22` }]}>
                  <Ionicons
                    name={category.icon as keyof typeof Ionicons.glyphMap}
                    size={20}
                    color={category.color}
                  />
                </View>
                <Pressable
                  style={styles.rowInfo}
                  accessibilityRole="button"
                  accessibilityLabel={`Edytuj ${category.name}`}
                  onPress={() => openEdit(category)}
                >
                  <Text style={styles.rowName}>{category.name}</Text>
                  <Text style={styles.rowMeta}>
                    {category.isDefault ? 'Kategoria domyślna' : 'Kategoria własna'}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edytuj ${category.name}`}
                  onPress={() => openEdit(category)}
                  style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                >
                  <Ionicons name="create-outline" size={18} color={colors.textMuted} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Usuń ${category.name}`}
                  onPress={() => handleDelete(category)}
                  style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              </View>
            ))}
          </View>
        </Card>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button label="Dodaj kategorię" icon="add" onPress={openCreate} large />
      </View>

      <Modal
        visible={editor != null}
        transparent
        animationType="slide"
        onRequestClose={() => setEditor(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={styles.modalTitle}>
                {editor?.mode === 'edit' ? 'Edytuj kategorię' : `Nowa kategoria — ${typeLabel(kind, true).toLowerCase()}`}
              </Text>

              <TextField label="Nazwa" value={name} onChangeText={setName} placeholder="np. Kawa" />

              <Text style={styles.fieldLabel}>Ikona</Text>
              <View style={styles.iconGrid}>
                {ICONS.map((item) => (
                  <Pressable
                    key={item}
                    accessibilityRole="button"
                    accessibilityLabel={`Ikona ${item}`}
                    onPress={() => setIcon(item)}
                    style={({ pressed }) => [
                      styles.iconChoice,
                      icon === item && { borderColor: color, backgroundColor: `${color}1F` },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons
                      name={item as keyof typeof Ionicons.glyphMap}
                      size={20}
                      color={icon === item ? color : colors.textMuted}
                    />
                  </Pressable>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Kolor</Text>
              <View style={styles.colorGrid}>
                {COLORS.map((item) => (
                  <Pressable
                    key={item}
                    accessibilityRole="button"
                    accessibilityLabel={`Kolor ${item}`}
                    onPress={() => setColor(item)}
                    style={({ pressed }) => [
                      styles.colorChoice,
                      { backgroundColor: item },
                      color === item && styles.colorChoiceActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    {color === item && <Ionicons name="checkmark" size={16} color="#06210F" />}
                  </Pressable>
                ))}
              </View>

              <View style={styles.modalActions}>
                <Button
                  label="Anuluj"
                  variant="secondary"
                  onPress={() => setEditor(null)}
                  style={styles.modalAction}
                />
                <Button
                  label="Zapisz"
                  onPress={handleSave}
                  loading={saving}
                  style={styles.modalAction}
                />
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
  headerBox: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.lg },
  list: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56 },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInfo: { flex: 1 },
  rowName: { color: colors.text, fontSize: font.body, fontWeight: '600' },
  rowMeta: { color: colors.textFaint, fontSize: font.tiny, marginTop: 2 },
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
    maxHeight: '88%',
  },
  modalContent: { padding: spacing.lg, gap: spacing.md },
  modalTitle: { color: colors.text, fontSize: font.h2, fontWeight: '700' },
  fieldLabel: { color: colors.textMuted, fontSize: font.small, fontWeight: '600' },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  iconChoice: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  colorChoice: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorChoiceActive: { borderWidth: 3, borderColor: colors.text },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  modalAction: { flex: 1 },
});
