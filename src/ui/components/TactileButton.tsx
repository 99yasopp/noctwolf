import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '../text';
import { theme } from '../theme/colors';
import { useReducedMotion } from '../layout';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface Props {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  icon?: IconName;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

// A control with a little weight behind it: the fill carries the gold, the
// bottom lip and shadow give it a surface, and the press pushes it in.
export const TactileButton: React.FC<Props> = ({
  title,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  style,
}) => {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const lift = useRef(new Animated.Value(0)).current;

  const press = (to: number) => {
    if (reduced) {
      scale.setValue(to === 1 ? 1 : 0.97);
      lift.setValue(to === 1 ? 0 : 1);
      return;
    }
    Animated.parallel([
      Animated.spring(scale, {
        toValue: to,
        stiffness: 420,
        damping: 30,
        mass: 0.6,
        useNativeDriver: true,
      }),
      Animated.timing(lift, {
        toValue: to === 1 ? 0 : 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const primary = variant === 'primary';
  const tone =
    variant === 'danger' ? theme.colors.danger : primary ? theme.colors.primary : theme.colors.secondary;
  const label = primary ? theme.colors.background : tone;

  return (
    <Animated.View
      style={[
        styles.shadow,
        primary && styles.shadowPrimary,
        { transform: [{ scale }, { translateY: lift }] },
        disabled && styles.disabled,
        style,
      ]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={() => press(0.97)}
        onPressOut={() => press(1)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ disabled: !!disabled }}
        style={styles.hit}
      >
        {primary ? (
          <LinearGradient
            colors={[theme.colors.primary, theme.colors.primaryDeep]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.fill}
          >
            {icon ? <Ionicons name={icon} size={18} color={label} /> : null}
            <Text style={[styles.text, { color: label }]}>{title}</Text>
          </LinearGradient>
        ) : (
          <View
            style={[
              styles.fill,
              styles.outline,
              {
                borderColor: tone,
                backgroundColor: variant === 'danger' ? theme.colors.tintDanger : theme.colors.surface,
              },
            ]}
          >
            {icon ? <Ionicons name={icon} size={18} color={tone} /> : null}
            <Text style={[styles.text, { color: label }]}>{title}</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  shadow: {
    alignSelf: 'stretch',
    borderRadius: theme.radius.control,
    shadowColor: theme.shadow.color,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.24,
    shadowRadius: 8,
    elevation: 3,
  },
  shadowPrimary: {
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.34,
    shadowRadius: 12,
    elevation: 7,
  },
  hit: {
    minHeight: theme.touchTarget,
    borderRadius: theme.radius.control,
  },
  fill: {
    minHeight: theme.touchTarget,
    borderRadius: theme.radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: theme.spacing.medium,
  },
  outline: {
    borderWidth: 1,
    borderBottomWidth: 2,
  },
  text: {
    fontWeight: '800',
    fontSize: theme.type.body,
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.45,
    shadowOpacity: 0,
    elevation: 0,
  },
});
