import React from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { theme } from '../theme/colors';
import { leaveScreen } from '../back';

interface Props {
  visible: boolean;
  children: React.ReactNode;
}

// A full page over the table for the rare detours: rules, settings, a generated
// role. The page's own header and back stack still do the navigation.
export const PageOverlay: React.FC<Props> = ({ visible, children }) => (
  <Modal
    visible={visible}
    animationType="slide"
    statusBarTranslucent
    onRequestClose={leaveScreen}
  >
    <View style={styles.page}>{children}</View>
  </Modal>
);

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
});
