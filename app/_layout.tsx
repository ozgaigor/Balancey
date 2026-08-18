import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LockScreen } from '../components/LockScreen';
import { OnboardingFlow } from '../components/OnboardingFlow';
import { Toast } from '../components/Toast';
import { colors, font, spacing } from '../theme';
import { AppProvider, useApp } from '../state/AppProvider';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AppProvider>
          <StatusBar style="light" />
          <RootContent />
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Warstwa nad nawigacją: ekran ładowania, blokada PIN i konfiguracja startowa. */
function RootContent() {
  const { ready, initError, settings, unlocked } = useApp();

  const showLock = ready && settings.lockEnabled && settings.pinHash != null && !unlocked;
  const showOnboarding = ready && !showLock && !settings.onboardingDone;

  return (
    <View style={styles.root}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="add"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="transaction/[id]" />
        <Stack.Screen name="month/[ym]" />
        <Stack.Screen name="day/[date]" />
      </Stack>

      <Toast />

      {!ready && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Przygotowuję budżet…</Text>
        </View>
      )}

      {initError && ready && (
        <View style={styles.overlay}>
          <Text style={styles.errorTitle}>Nie udało się otworzyć bazy danych</Text>
          <Text style={styles.errorBody}>{initError}</Text>
        </View>
      )}

      {showLock && <LockScreen />}
      {showOnboarding && <OnboardingFlow />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: font.small,
  },
  errorTitle: {
    color: colors.text,
    fontSize: font.h2,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorBody: {
    color: colors.textMuted,
    fontSize: font.small,
    textAlign: 'center',
  },
});
