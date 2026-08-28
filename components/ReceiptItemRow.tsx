import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, font, radius, spacing } from '../theme';
import type { Person } from '../types';
import { QUANTITY_SCALE } from '../types';
import { formatMoney } from '../utils/currency';
import { splitEvenly } from '../utils/split';
import { PersonPicker } from './PersonPicker';

interface ReceiptItemRowProps {
  name: string;
  quantity: number;
  total: number;
  categoryName: string | null;
  categoryColor: string | null;
  people: Person[];
  selectedPeople: number[];
  onTogglePerson: (personId: number) => void;
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * Jedna pozycja paragonu wraz z przypisaniem osób.
 *
 * Pod kwotą pokazujemy, ile z niej przypada na osobę — to najważniejsza
 * informacja przy dzieleniu zakupów i użytkownik nie musi jej liczyć w głowie.
 */
export function ReceiptItemRow({
  name,
  quantity,
  total,
  categoryName,
  categoryColor,
  people,
  selectedPeople,
  onTogglePerson,
  onEdit,
  onDelete,
}: ReceiptItemRowProps) {
  const perPerson = selectedPeople.length > 0 ? splitEvenly(total, selectedPeople.length)[0] : null;

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edytuj pozycję ${name}`}
          onPress={onEdit}
          style={({ pressed }) => [styles.titleArea, pressed && styles.pressed]}
        >
          <Text style={styles.name} numberOfLines={2}>
            {name}
          </Text>
          <View style={styles.metaRow}>
            {quantity !== QUANTITY_SCALE && (
              <Text style={styles.meta}>{formatQuantity(quantity)}</Text>
            )}
            {categoryName && (
              <View style={styles.categoryTag}>
                <View
                  style={[styles.dot, { backgroundColor: categoryColor ?? colors.textFaint }]}
                />
                <Text style={styles.meta}>{categoryName}</Text>
              </View>
            )}
          </View>
        </Pressable>

        <View style={styles.amountArea}>
          <Text style={styles.amount}>{formatMoney(total)}</Text>
          {perPerson != null && selectedPeople.length > 1 && (
            <Text style={styles.perPerson}>po {formatMoney(perPerson, { symbol: '' })}</Text>
          )}
          {selectedPeople.length === 0 && <Text style={styles.shared}>wspólne</Text>}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Usuń pozycję ${name}`}
          onPress={onDelete}
          hitSlop={8}
          style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}
        >
          <Ionicons name="close" size={18} color={colors.textFaint} />
        </Pressable>
      </View>

      <PersonPicker
        people={people}
        selected={selectedPeople}
        onToggle={onTogglePerson}
        compact
      />
    </View>
  );
}

/** "0,432" dla wagi, "2 szt." dla sztuk. */
function formatQuantity(quantity: number): string {
  if (quantity % QUANTITY_SCALE === 0) {
    return `${quantity / QUANTITY_SCALE} szt.`;
  }
  return `${(quantity / QUANTITY_SCALE).toFixed(3).replace('.', ',')} kg`;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  titleArea: { flex: 1, gap: 4 },
  pressed: { opacity: 0.65 },
  name: { color: colors.text, fontSize: font.body, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  meta: { color: colors.textMuted, fontSize: font.tiny },
  categoryTag: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  amountArea: { alignItems: 'flex-end', gap: 2 },
  amount: { color: colors.text, fontSize: font.body, fontWeight: '700' },
  perPerson: { color: colors.textMuted, fontSize: font.tiny },
  shared: { color: colors.textFaint, fontSize: font.tiny },
  deleteButton: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
});
