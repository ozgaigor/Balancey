import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { PinPad } from '../components/PinPad';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors, font, spacing } from '../theme';
import { useApp } from '../state/AppProvider';
import { PIN_LENGTH, clearPin, setPin as savePin, verifyPin } from '../services/lockService';

type Step = 'current' | 'new' | 'confirm' | 'done';

export default function SecurityScreen() {
  const insets = useSafeAreaInsets();
  const { settings, reloadSettings, showToast } = useApp();

  const lockEnabled = settings.lockEnabled && settings.pinHash != null;

  const [step, setStep] = useState<Step>(lockEnabled ? 'current' : 'new');
  const [pin, setPin] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'set' | 'disable'>('set');

  const finish = useCallback(async () => {
    await reloadSettings();
    setStep('done');
  }, [reloadSettings]);

  useEffect(() => {
    if (pin.length !== PIN_LENGTH) return;

    let cancelled = false;

    (async () => {
      if (step === 'current') {
        const valid = await verifyPin(pin);
        if (cancelled) return;
        if (!valid) {
          setError('Nieprawidłowy PIN');
          setPin('');
          return;
        }
        if (mode === 'disable') {
          await clearPin();
          showToast('Blokada wyłączona');
          setPin('');
          await finish();
          return;
        }
        setPin('');
        setStep('new');
        return;
      }

      if (step === 'new') {
        setFirstPin(pin);
        setPin('');
        setStep('confirm');
        return;
      }

      if (step === 'confirm') {
        if (pin !== firstPin) {
          setError('Kody się różnią. Spróbuj ponownie.');
          setPin('');
          setFirstPin('');
          setStep('new');
          return;
        }
        await savePin(pin);
        showToast('Blokada włączona');
        setPin('');
        await finish();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [finish, firstPin, mode, pin, showToast, step]);

  const startDisable = useCallback(() => {
    Alert.alert('Wyłączyć blokadę?', 'Aplikacja przestanie prosić o PIN przy uruchomieniu.', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Wyłącz',
        style: 'destructive',
        onPress: () => {
          setMode('disable');
          setStep('current');
          setPin('');
          setError(null);
        },
      },
    ]);
  }, []);

  const title =
    step === 'current'
      ? mode === 'disable'
        ? 'Podaj obecny PIN, aby wyłączyć blokadę'
        : 'Podaj obecny PIN'
      : step === 'new'
        ? 'Ustaw nowy PIN'
        : step === 'confirm'
          ? 'Powtórz nowy PIN'
          : 'Gotowe';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + 40 },
      ]}
    >
      <ScreenHeader title="Blokada aplikacji" subtitle="Kod PIN i biometria" back />

      {step === 'done' ? (
        <Card>
          <View style={styles.doneBox}>
            <Text style={styles.doneTitle}>
              {settings.lockEnabled ? 'Blokada jest włączona' : 'Blokada jest wyłączona'}
            </Text>
            <Text style={styles.doneText}>
              {settings.lockEnabled
                ? 'Aplikacja poprosi o PIN przy uruchomieniu i po dłuższej przerwie.'
                : 'Możesz włączyć blokadę w dowolnym momencie.'}
            </Text>
            <Button
              label="Wróć do ustawień"
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/settings'))}
            />
          </View>
        </Card>
      ) : (
        <Card>
          <PinPad
            title={title}
            subtitle={`PIN składa się z ${PIN_LENGTH} cyfr`}
            value={pin}
            onChange={(value) => {
              setError(null);
              setPin(value);
            }}
            error={error}
          />
        </Card>
      )}

      {lockEnabled && step !== 'done' && mode === 'set' && (
        <Button label="Wyłącz blokadę" variant="danger" icon="lock-open-outline" onPress={startDisable} />
      )}

      <Card title="Jak to działa">
        <Text style={styles.info}>
          PIN nie jest zapisywany w postaci jawnej — przechowywany jest wyłącznie jego skrót SHA-256
          z losową solą, w lokalnej bazie na tym urządzeniu. Jeżeli telefon obsługuje odcisk palca
          lub Face ID, możesz włączyć szybkie odblokowanie w Ustawieniach.
        </Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  doneBox: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  doneTitle: { color: colors.text, fontSize: font.h2, fontWeight: '700', textAlign: 'center' },
  doneText: { color: colors.textMuted, fontSize: font.small, textAlign: 'center', lineHeight: 20 },
  info: { color: colors.textMuted, fontSize: font.tiny, lineHeight: 18 },
});
