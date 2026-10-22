import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, useWindowDimensions } from 'react-native';

// One place for the breakpoints and gutters the screens share. The phone is
// the design target; tablet and web simply get more seats per row.
export const useResponsive = () => {
  const { width, height } = useWindowDimensions();
  const compact = width < 380;
  const tablet = width >= 600;
  const gutter = compact ? 12 : tablet ? 24 : 20;
  const contentWidth = Math.min(width - gutter * 2, tablet ? 720 : 560);
  const playerColumns = compact ? 2 : tablet ? 4 : 3;
  const roleColumns = width < 340 ? 1 : tablet ? 3 : 2;
  const gap = compact ? 8 : 10;

  return {
    width,
    height,
    compact,
    tablet,
    gutter,
    contentWidth,
    playerColumns,
    roleColumns,
    gap,
    // Sheets can use most of the phone, but stay readable on a monitor.
    sheetWidth: Math.min(width - gutter * 2, 640),
  };
};

// Motion is a garnish, not a requirement. Native and web both tell us when
// the reader has asked for less of it.
export const useReducedMotion = () => {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then(value => mounted && setReduced(value))
      .catch(() => {});

    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      if (mounted) setReduced(value);
    });

    const media =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.matchMedia?.('(prefers-reduced-motion: reduce)')
        : null;
    const onChange = () => mounted && setReduced(!!media?.matches);
    if (media) {
      setReduced(media.matches);
      media.addEventListener('change', onChange);
    }

    return () => {
      mounted = false;
      sub.remove();
      media?.removeEventListener('change', onChange);
    };
  }, []);

  return reduced;
};
