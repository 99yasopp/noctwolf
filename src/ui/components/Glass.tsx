import React from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { theme } from '../theme/colors';

interface Props {
  children?: React.ReactNode;
  strong?: boolean;
  style?: StyleProp<ViewStyle>;
}

// Frosted glass only where something floats over the table: bars, sheets and
// menus. The solid tint underneath is the fallback and keeps text legible.
export const Glass: React.FC<Props> = ({ children, strong, style }) => (
  <BlurView
    intensity={strong ? 40 : 24}
    tint="dark"
    experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
    style={[styles.glass, style]}
  >
    <View style={[styles.tint, strong && styles.strong]}>{children}</View>
  </BlurView>
);

const styles = StyleSheet.create({
  glass: {
    overflow: 'hidden',
  },
  tint: {
    flexShrink: 1,
    backgroundColor: theme.colors.glass,
  },
  strong: {
    backgroundColor: theme.colors.glassStrong,
  },
});
