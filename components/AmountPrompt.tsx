import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, font, radius, spacing } from '../theme';
import { formatMoney, moneyToPlainString, parseAmount } from '../utils/currency';
import { Button } from './Button';
import { TextField } from './TextField';

interface AmountPromptProps {
  visible: boolean;
  title: string;
  description?: string;
  /** Wartość początkowa w groszach. */
  initialAmount: number;
  /** Etykieta przycisku zapisu. */
  confirmLabel?: string;
  /** Pozwala wyczyścić limit (zapis kwoty 0). */
  allowClear?: boolean;
  onCancel: () => void;
  onConfirm: (amount: number) => void;
}

/** Okno do szybkiego wpisania kwoty (limity budżetu, cele, plan). */
export function AmountPrompt({
  visible,
  title,
  description,
  initialAmount,
  confirmLabel = 'Zapisz',
  allowClear = false,
  onCancel,
  onConfirm,
}: AmountPromptProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setText(initialAmount > 0 ? moneyToPlainString(initialAmount) : '');
      setError(null);
    }
  }, [visible, initialAmount]);

  const parsed = parseAmount(text);

  const confirm = () => {
    if (text.trim() === '') {
      if (allowClear) {
        onConfirm(0);
        return;
      }
      setError('Podaj kwotę');
      return;
    }
    if (parsed == null || parsed < 0) {
      setError('Nieprawidłowa kwota');
      return;
    }
    onConfirm(parsed);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Zamknij" />
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          {description ? <Text style={styles.description}>{description}</Text> : null}

          <TextField
            label="Kwota"
            value={text}
            onChangeText={(value) => {
              setText(value);
              setError(null);
            }}
            placeholder="0,00"
            keyboardType="decimal-pad"
            suffix="zł"
            autoFocus
            error={error}
            hint={parsed != null ? formatMoney(parsed) : undefined}
            onSubmitEditing={confirm}
            returnKeyType="done"
          />

          <View style={styles.actions}>
            <Button label="Anuluj" variant="secondary" onPress={onCancel} style={styles.action} />
            <Button label={confirmLabel} onPress={confirm} style={styles.action} />
          </View>

          {allowClear && (
            <Pressable accessibilityRole="button" onPress={() => onConfirm(0)} style={styles.clear}>
              <Text style={styles.clearText}>Usuń limit</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: { color: colors.text, fontSize: font.h2, fontWeight: '700' },
  description: { color: colors.textMuted, fontSize: font.small, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
  clear: { alignItems: 'center', paddingVertical: spacing.sm },
  clearText: { color: colors.danger, fontSize: font.small, fontWeight: '700' },
});
