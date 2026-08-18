import React from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, radius } from '../theme';

interface ProgressBarProps {
  /** Wypełnienie 0-100. */
  percent: number;
  color?: string;
  /** Wysokość paska; większa dla głównego budżetu. */
  height?: number;
  /** Czy pokazać znacznik przekroczenia limitu. */
  exceeded?: boolean;
}

/** Pasek postępu wykorzystania budżetu. */
export function ProgressBar({
  percent,
  color = colors.accent,
  height = 10,
  exceeded = false,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const fillColor = exceeded ? colors.danger : color;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: clamped }}
      style={[styles.track, { height, borderRadius: height / 2 }]}
    >
      <View
        style={[
          styles.fill,
          { width: `${clamped}%`, backgroundColor: fillColor, borderRadius: height / 2 },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    backgroundColor: colors.surfaceStrong,
    overflow: 'hidden',
    borderRadius: radius.pill,
  },
  fill: {
    height: '100%',
  },
});
