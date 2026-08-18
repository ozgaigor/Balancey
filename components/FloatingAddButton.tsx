import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, font, radius, spacing } from '../theme';

interface FloatingAddButtonProps {
  onPress: () => void;
  /** Odległość od dołu ekranu (nad dolną nawigacją). */
  bottom: number;
}

/** Duży przycisk "+" do błyskawicznego dodania transakcji. */
export function FloatingAddButton({ onPress, bottom }: FloatingAddButtonProps) {
  return (
    <View pointerEvents="box-none" style={[styles.wrapper, { bottom }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dodaj transakcję"
        onPress={() => {
          if (Platform.OS !== 'web') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
          }
          onPress();
        }}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Ionicons name="add" size={26} color="#06210F" />
        <Text style={styles.label}>Dodaj</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 56,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  pressed: {
    backgroundColor: colors.accentDark,
    transform: [{ scale: 0.97 }],
  },
  label: {
    color: '#06210F',
    fontSize: font.body,
    fontWeight: '800',
  },
});
