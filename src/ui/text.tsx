import React from 'react';
import {
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
  TextInputProps,
  TextProps,
} from 'react-native';
import { useI18n } from './i18n';
import { theme } from './theme/colors';

// A Text that leans the way its language reads. An alignment the screen chose
// itself — a centred button, a badge — is kept as written.
const lean = (style: TextProps['style'], rtl: boolean) => {
  const flat = StyleSheet.flatten(style) as { textAlign?: string } | undefined;
  return rtl && !flat?.textAlign ? styles.right : null;
};

export const Text: React.FC<TextProps> = ({ style, ...props }) => {
  const { rtl } = useI18n();
  // Bone by default: a style that names a colour still wins, and a label that
  // forgot one stays readable on the night background.
  return <NativeText {...props} style={[styles.base, style, lean(style, rtl)]} />;
};

// The same for the few inputs: a placeholder in Arabic starts at the right.
export const TextInput: React.FC<TextInputProps> = ({ style, ...props }) => {
  const { rtl } = useI18n();
  return <NativeTextInput {...props} style={[style, lean(style, rtl)]} />;
};

const styles = StyleSheet.create({
  base: { color: theme.colors.text },
  right: { textAlign: 'right' },
});
