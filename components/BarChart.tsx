import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { colors, font, spacing } from '../theme';
import { formatCompact } from '../utils/currency';
import { monthLabelShort } from '../utils/dates';

export interface BarChartPoint {
  month: string;
  income: number;
  expenses: number;
}

interface BarChartProps {
  data: BarChartPoint[];
  height?: number;
}

/** Wykres słupkowy: przychody i wydatki w kolejnych miesiącach. */
export function BarChart({ data, height = 150 }: BarChartProps) {
  const max = Math.max(1, ...data.flatMap((point) => [point.income, point.expenses]));
  const groupWidth = 100 / Math.max(data.length, 1);
  const barWidth = groupWidth * 0.28;
  const gap = groupWidth * 0.08;

  return (
    <View style={styles.container}>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: colors.accent }]} />
          <Text style={styles.legendText}>Przychody</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: colors.danger }]} />
          <Text style={styles.legendText}>Wydatki</Text>
        </View>
        <Text style={styles.maxLabel}>max {formatCompact(max)}</Text>
      </View>

      <Svg width="100%" height={height}>
        {data.map((point, index) => {
          const groupStart = index * groupWidth;
          const incomeHeight = (point.income / max) * (height - 4);
          const expenseHeight = (point.expenses / max) * (height - 4);

          return (
            <React.Fragment key={point.month}>
              <Rect
                x={`${groupStart + groupWidth / 2 - barWidth - gap / 2}%`}
                y={height - incomeHeight}
                width={`${barWidth}%`}
                height={Math.max(incomeHeight, 2)}
                rx={3}
                fill={colors.accent}
              />
              <Rect
                x={`${groupStart + groupWidth / 2 + gap / 2}%`}
                y={height - expenseHeight}
                width={`${barWidth}%`}
                height={Math.max(expenseHeight, 2)}
                rx={3}
                fill={colors.danger}
              />
            </React.Fragment>
          );
        })}
      </Svg>

      <View style={styles.labels}>
        {data.map((point) => (
          <Text key={point.month} style={styles.labelText} numberOfLines={1}>
            {monthLabelShort(point.month).split(' ')[0]}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: colors.textMuted,
    fontSize: font.tiny,
    fontWeight: '600',
  },
  maxLabel: {
    marginLeft: 'auto',
    color: colors.textFaint,
    fontSize: font.tiny,
  },
  labels: {
    flexDirection: 'row',
  },
  labelText: {
    flex: 1,
    textAlign: 'center',
    color: colors.textFaint,
    fontSize: font.tiny,
  },
});
