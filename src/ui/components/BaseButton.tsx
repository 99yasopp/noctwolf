import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from '../text';
import { theme } from '../theme/colors';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
}

export const BaseButton: React.FC<ButtonProps> = ({ title, onPress, variant = 'primary' }) => {
  return (
    <TouchableOpacity 
      style={[styles.button, { backgroundColor: theme.colors[variant] }]} 
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={styles.text}>{title}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    padding: theme.spacing.medium,
    borderRadius: theme.borderRadius,
    alignItems: 'center',
    marginVertical: theme.spacing.small,
  },
  text: {
    color: theme.colors.background,
    fontWeight: 'bold',
    fontSize: 16,
  },
});
