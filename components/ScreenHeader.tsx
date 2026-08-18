import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, font, radius, spacing } from '../theme';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /** Pokazuje strzałkę powrotu. */
  back?: boolean;
  right?: React.ReactNode;
}

/** Nagłówek ekranu z opcjonalnym powrotem i akcją po prawej. */
export function ScreenHeader({ title, subtitle, back = false, right }: ScreenHeaderProps) {
  return (
    <View style={styles.container}>
      {back && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Wróć"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          hitSlop={8}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
      )}

      <View style={styles.titles}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingBottom: spacing.md,
    minHeight: 52,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  titles: { flex: 1 },
  title: {
    color: colors.text,
    fontSize: font.h1,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: font.small,
    marginTop: 2,
  },
});
