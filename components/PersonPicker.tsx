import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, font, spacing } from '../theme';
import type { Person } from '../types';
import { personInitials } from '../services/settlementService';

interface PersonPickerProps {
  people: Person[];
  /** Identyfikatory zaznaczonych osób. */
  selected: number[];
  onToggle: (personId: number) => void;
  /** Pozwala szybko zaznaczyć wszystkich / wyczyścić wybór. */
  onSelectAll?: () => void;
  onClear?: () => void;
  compact?: boolean;
  label?: string;
}

/**
 * Rząd awatarów do przypisywania osób — do pozycji paragonu i do płatnika.
 *
 * Zaznaczenie kilku osób oznacza podział po równo. Brak zaznaczenia to
 * koszt wspólny, który nie wchodzi do żadnego salda.
 */
export function PersonPicker({
  people,
  selected,
  onToggle,
  onSelectAll,
  onClear,
  compact = false,
  label,
}: PersonPickerProps) {
  const size = compact ? 34 : 44;

  return (
    <View style={styles.container}>
      {(label || onSelectAll || onClear) && (
        <View style={styles.header}>
          {label ? <Text style={styles.label}>{label}</Text> : <View />}
          <View style={styles.headerActions}>
            {onSelectAll && (
              <Pressable
                accessibilityRole="button"
                onPress={onSelectAll}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Text style={styles.headerAction}>Wszyscy</Text>
              </Pressable>
            )}
            {onClear && (
              <Pressable
                accessibilityRole="button"
                onPress={onClear}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Text style={styles.headerAction}>Wyczyść</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        {people.map((person) => {
          const active = selected.includes(person.id);
          return (
            <Pressable
              key={person.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${person.name}${active ? ', przypisana' : ''}`}
              onPress={() => onToggle(person.id)}
              style={({ pressed }) => [styles.person, pressed && styles.pressed]}
            >
              <View
                style={[
                  styles.avatar,
                  {
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: active ? person.color : colors.surface,
                    borderColor: active ? person.color : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.initials,
                    { fontSize: compact ? font.tiny : font.small },
                    active && styles.initialsActive,
                  ]}
                >
                  {personInitials(person)}
                </Text>
              </View>
              {!compact && (
                <Text style={[styles.name, active && styles.nameActive]} numberOfLines={1}>
                  {person.name}
                </Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerActions: { flexDirection: 'row', gap: spacing.md },
  headerAction: { color: colors.accent, fontSize: font.tiny, fontWeight: '700' },
  label: { color: colors.textMuted, fontSize: font.small, fontWeight: '600' },
  row: { flexDirection: 'row', gap: spacing.sm, paddingRight: spacing.sm },
  person: { alignItems: 'center', gap: 4, maxWidth: 72 },
  pressed: { opacity: 0.65 },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  initials: { color: colors.textMuted, fontWeight: '800' },
  initialsActive: { color: '#06210F' },
  name: { color: colors.textFaint, fontSize: font.tiny, fontWeight: '600' },
  nameActive: { color: colors.text },
});
