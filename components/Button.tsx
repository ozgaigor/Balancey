import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { HIT_SIZE, colors, font, radius, spacing } from '../theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  /** Duży przycisk akcji (np. "Dodaj wydatek"). */
  large?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Przycisk z dużym polem dotykowym i czytelnym stanem nieaktywnym. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled = false,
  loading = false,
  large = false,
  style,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        large && styles.large,
        variantStyles[variant],
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={textColors[variant]} />
        ) : (
          <>
            {icon && <Ionicons name={icon} size={large ? 22 : 18} color={textColors[variant]} />}
            <Text style={[styles.label, large && styles.labelLarge, { color: textColors[variant] }]}>
              {label}
            </Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

const textColors: Record<Variant, string> = {
  primary: '#06210F',
  secondary: colors.text,
  ghost: colors.textMuted,
  danger: colors.white,
};

const variantStyles: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: colors.danger },
};

const styles = StyleSheet.create({
  base: {
    minHeight: HIT_SIZE,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  large: {
    minHeight: 58,
    borderRadius: radius.lg,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: {
    fontSize: font.body,
    fontWeight: '700',
  },
  labelLarge: {
    fontSize: 17,
  },
  pressed: {
    opacity: 0.82,
  },
  disabled: {
    opacity: 0.45,
  },
});
