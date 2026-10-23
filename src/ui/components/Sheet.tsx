import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '../text';
import { theme } from '../theme/colors';
import { useResponsive, useReducedMotion } from '../layout';
import { leaveScreen, useBack } from '../back';
import { useI18n } from '../i18n';
import { Glass } from './Glass';

interface Props {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  scroll?: boolean;
  tall?: boolean;
}

// A sheet that belongs to the table: blurred glass, a handle you can pull, and
// the same close path for the button, the backdrop and the back gesture.
export const Sheet: React.FC<Props> = ({
  visible,
  onClose,
  title,
  children,
  scroll = true,
  tall,
}) => {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { sheetWidth } = useResponsive();
  const reduced = useReducedMotion();
  const slide = useRef(new Animated.Value(40)).current;

  useBack(visible ? onClose : null);

  useEffect(() => {
    if (!visible) return;
    if (reduced) {
      slide.setValue(0);
      return;
    }
    slide.setValue(40);
    Animated.spring(slide, {
      toValue: 0,
      stiffness: 320,
      damping: 32,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [visible, reduced, slide]);

  const pull = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) slide.setValue(gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 90) {
          leaveScreen();
          return;
        }
        Animated.spring(slide, {
          toValue: 0,
          stiffness: 380,
          damping: 34,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  const body = (
    <View style={styles.head}>
      <View style={styles.grab} {...pull.panHandlers} />
      {title ? (
        <View style={styles.titleRow}>
          <Text style={styles.title}>{title}</Text>
          <Pressable
            onPress={leaveScreen}
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={t('ui.common.close')}
          >
            <Ionicons name="close" size={22} color={theme.colors.text} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  const content = (
    <>
      {body}
      {scroll ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={styles.content}>{children}</View>
      )}
    </>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={leaveScreen}
          accessibilityLabel={t('ui.common.close')}
        />
        <Animated.View
          style={[
            styles.sheetSlot,
            {
              width: sheetWidth,
              transform: [{ translateY: slide }],
            },
           ]}
        >
          <Glass strong style={[styles.sheet, tall && styles.tall]}>
            <View style={{ paddingBottom: insets.bottom, flexShrink: 1 }}>{content}</View>
          </Glass>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: theme.colors.scrim,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheetSlot: {
    maxHeight: '92%',
    alignSelf: 'center',
  },
  sheet: {
    maxHeight: '100%',
    flexShrink: 1,
    borderTopLeftRadius: theme.radius.sheet,
    borderTopRightRadius: theme.radius.sheet,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    shadowColor: theme.shadow.color,
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.36,
    shadowRadius: 20,
    elevation: 16,
  },
  tall: {
    maxHeight: '96%',
  },
  head: {
    paddingTop: 8,
  },
  grab: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingStart: 20,
    paddingEnd: 10,
    paddingTop: 10,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.type.section,
    fontWeight: '800',
    flex: 1,
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    backgroundColor: theme.colors.highlight,
    transform: [{ scale: 0.95 }],
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 22,
  },
});
