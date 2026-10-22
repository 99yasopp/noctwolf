import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from '../text';
import { theme } from '../theme/colors';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
}

// Every button clears the 48dp Android target on its own: no hitSlop needed,
// and the ink label on gold sits at 10:1. Only the main action is filled; the
// rest are edges, so a list of choices stays a list and not a wall of blocks.
export const BaseButton: React.FC<ButtonProps> = ({ title, onPress, variant = 'primary' }) => {
  const filled = variant === 'primary';
  const tone = theme.colors[variant];

  return (
    <TouchableOpacity
      style={[
        styles.button,
        filled ? { backgroundColor: tone } : { borderWidth: 1.5, borderColor: tone },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <Text style={[styles.text, { color: filled ? theme.colors.background : tone }]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    minHeight: theme.touchTarget,
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: theme.spacing.medium,
    borderRadius: theme.borderRadius,
    alignItems: 'center',
    marginVertical: 6,
  },
  text: {
    fontWeight: '800',
    fontSize: 16,
    textAlign: 'center',
  },
});
