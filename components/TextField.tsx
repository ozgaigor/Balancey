import React from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, font, radius, spacing } from '../theme';

interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  autoFocus?: boolean;
  /** Tekst pomocniczy pod polem (np. sformatowana kwota). */
  hint?: string;
  error?: string | null;
  maxLength?: number;
  style?: StyleProp<ViewStyle>;
  suffix?: string;
  onSubmitEditing?: () => void;
  returnKeyType?: 'done' | 'next' | 'go' | 'send';
}

/** Pole tekstowe z etykietą, podpowiedzią i komunikatem błędu. */
export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  multiline = false,
  autoFocus = false,
  hint,
  error,
  maxLength,
  style,
  suffix,
  onSubmitEditing,
  returnKeyType,
}: TextFieldProps) {
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputWrapper, error ? styles.inputError : null]}>
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          keyboardType={keyboardType}
          multiline={multiline}
          autoFocus={autoFocus}
          maxLength={maxLength}
          onSubmitEditing={onSubmitEditing}
          returnKeyType={returnKeyType}
          style={[styles.input, multiline && styles.inputMultiline]}
          selectionColor={colors.accent}
        />
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
      </View>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    color: colors.textMuted,
    fontSize: font.small,
    fontWeight: '600',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    minHeight: 52,
  },
  inputError: {
    borderColor: colors.danger,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: font.body,
    paddingVertical: spacing.md,
  },
  inputMultiline: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  suffix: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '600',
    marginLeft: spacing.sm,
  },
  hint: {
    color: colors.textFaint,
    fontSize: font.tiny,
  },
  error: {
    color: colors.danger,
    fontSize: font.tiny,
    fontWeight: '600',
  },
});
