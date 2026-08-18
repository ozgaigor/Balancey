import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, font, radius, spacing } from '../theme';
import { useApp } from '../state/AppProvider';

const VISIBLE_MS = 2400;

/** Krótkie potwierdzenie akcji, np. "Dodano 42,50 zł". */
export function Toast() {
  const { toast, hideToast } = useApp();
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    if (!toast) return;

    opacity.setValue(0);
    translateY.setValue(20);

    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 20, duration: 200, useNativeDriver: true }),
      ]).start(() => hideToast());
    }, VISIBLE_MS);

    return () => clearTimeout(timer);
  }, [toast, opacity, translateY, hideToast]);

  if (!toast) return null;

  const palette = {
    success: { background: colors.accent, text: '#06210F', icon: 'checkmark-circle' as const },
    warning: { background: colors.warning, text: '#241703', icon: 'alert-circle' as const },
    error: { background: colors.danger, text: '#2A0710', icon: 'close-circle' as const },
  }[toast.variant];

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[
        styles.container,
        {
          bottom: insets.bottom + 96,
          opacity,
          transform: [{ translateY }],
          backgroundColor: palette.background,
        },
      ]}
    >
      <Ionicons name={palette.icon} size={18} color={palette.text} />
      <Text style={[styles.text, { color: palette.text }]} numberOfLines={2}>
        {toast.text}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    zIndex: 100,
  },
  text: {
    flex: 1,
    fontSize: font.small,
    fontWeight: '700',
  },
});
