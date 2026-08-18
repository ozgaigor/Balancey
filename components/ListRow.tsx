import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { colors, font, radius, spacing } from '../theme';

interface ListRowProps {
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  /** Gdy podany, w wierszu pojawia się przełącznik. */
  switchValue?: boolean;
  onSwitchChange?: (value: boolean) => void;
  danger?: boolean;
  chevron?: boolean;
}

/** Wiersz listy — używany w Ustawieniach i menu ekranów. */
export function ListRow({
  icon,
  iconColor = colors.textMuted,
  title,
  subtitle,
  value,
  onPress,
  switchValue,
  onSwitchChange,
  danger = false,
  chevron = true,
}: ListRowProps) {
  const hasSwitch = switchValue !== undefined;

  const content = (
    <>
      {icon && (
        <View style={[styles.iconWrapper, { backgroundColor: `${danger ? colors.danger : iconColor}1F` }]}>
          <Ionicons name={icon} size={18} color={danger ? colors.danger : iconColor} />
        </View>
      )}
      <View style={styles.body}>
        <Text style={[styles.title, danger && styles.danger]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {value ? <Text style={styles.value}>{value}</Text> : null}

      {hasSwitch ? (
        <Switch
          value={switchValue}
          onValueChange={onSwitchChange}
          trackColor={{ false: colors.surfaceStrong, true: colors.accentDark }}
          thumbColor={switchValue ? colors.accent : '#7A8794'}
          accessibilityLabel={title}
        />
      ) : onPress && chevron ? (
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      ) : null}
    </>
  );

  if (!onPress || hasSwitch) {
    return <View style={styles.row}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingVertical: spacing.sm,
  },
  pressed: { opacity: 0.65 },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  title: { color: colors.text, fontSize: font.body, fontWeight: '600' },
  danger: { color: colors.danger },
  subtitle: { color: colors.textMuted, fontSize: font.tiny, lineHeight: 16 },
  value: { color: colors.textMuted, fontSize: font.small, fontWeight: '600' },
});
