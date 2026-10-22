import React from 'react';
import { StyleSheet, View } from 'react-native';
import { TactileButton } from './TactileButton';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
}

// The old call sites keep their shape; the tactile control is the one button
// everywhere now. The small vertical gap keeps stacked choices readable.
export const BaseButton: React.FC<ButtonProps> = ({ title, onPress, variant = 'primary' }) => (
  <View style={styles.wrap}>
    <TactileButton title={title} onPress={onPress} variant={variant} />
  </View>
);

const styles = StyleSheet.create({
  wrap: {
    marginVertical: 5,
  },
});
