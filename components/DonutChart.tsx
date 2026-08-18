import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { colors, font, radius, spacing } from '../theme';
import { formatMoney } from '../utils/currency';

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  data: DonutSlice[];
  size?: number;
  thickness?: number;
  /** Podpis w środku pierścienia. */
  centerLabel?: string;
  showLegend?: boolean;
}

/** Pierścieniowy wykres udziału kategorii w wydatkach. */
export function DonutChart({
  data,
  size = 180,
  thickness = 26,
  centerLabel = 'Wydatki',
  showLegend = true,
}: DonutChartProps) {
  const total = data.reduce((sum, slice) => sum + slice.value, 0);
  const radiusValue = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radiusValue;
  const center = size / 2;

  let offset = 0;
  const segments = data
    .filter((slice) => slice.value > 0)
    .map((slice) => {
      const fraction = total > 0 ? slice.value / total : 0;
      const dash = fraction * circumference;
      const segment = {
        ...slice,
        dash,
        offset,
        percent: Math.round(fraction * 1000) / 10,
      };
      offset += dash;
      return segment;
    });

  return (
    <View style={styles.container}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <G rotation={-90} origin={`${center}, ${center}`}>
            <Circle
              cx={center}
              cy={center}
              r={radiusValue}
              stroke={colors.surfaceStrong}
              strokeWidth={thickness}
              fill="none"
            />
            {segments.map((segment) => (
              <Circle
                key={segment.label}
                cx={center}
                cy={center}
                r={radiusValue}
                stroke={segment.color}
                strokeWidth={thickness}
                strokeDasharray={`${segment.dash} ${Math.max(circumference - segment.dash, 0)}`}
                strokeDashoffset={-segment.offset}
                strokeLinecap="butt"
                fill="none"
              />
            ))}
          </G>
        </Svg>

        <View style={[styles.center, { width: size, height: size }]} pointerEvents="none">
          <Text style={styles.centerLabel}>{centerLabel}</Text>
          <Text style={styles.centerValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            {formatMoney(total)}
          </Text>
        </View>
      </View>

      {showLegend && (
        <View style={styles.legend}>
          {segments.slice(0, 6).map((segment) => (
            <View key={segment.label} style={styles.legendRow}>
              <View style={[styles.dot, { backgroundColor: segment.color }]} />
              <Text style={styles.legendLabel} numberOfLines={1}>
                {segment.label}
              </Text>
              <Text style={styles.legendPercent}>{segment.percent}%</Text>
              <Text style={styles.legendValue}>{formatMoney(segment.value)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.lg,
  },
  center: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  centerLabel: {
    color: colors.textMuted,
    fontSize: font.tiny,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  centerValue: {
    color: colors.text,
    fontSize: font.h2,
    fontWeight: '800',
    marginTop: 2,
  },
  legend: {
    width: '100%',
    gap: spacing.sm,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 40,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    flex: 1,
    color: colors.text,
    fontSize: font.small,
    fontWeight: '600',
  },
  legendPercent: {
    color: colors.textMuted,
    fontSize: font.tiny,
    fontWeight: '700',
    width: 46,
    textAlign: 'right',
  },
  legendValue: {
    color: colors.textMuted,
    fontSize: font.tiny,
    width: 88,
    textAlign: 'right',
  },
});
