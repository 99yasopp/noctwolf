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
// and the ink label on gold sits at 10:1.
export const BaseButton: React.FC<ButtonProps> = ({ title, onPress, variant = 'primary' }) => {
  return (
    <TouchableOpacity
      style={[styles.button, { backgroundColor: theme.colors[variant] }]}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <Text style={styles.text}>{title}</Text>
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
    marginVertical: theme.spacing.small,
  },
  text: {
    color: theme.colors.background,
    fontWeight: '800',
    fontSize: 17,
    textAlign: 'center',
  },
});
