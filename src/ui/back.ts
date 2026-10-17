import { useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';

// What "back" means on the screen that is up. Only one screen is up at a time,
// so one handler is enough, and the visible back control goes through it.
type Back = () => void;
let active: Back | null = null;

// The phone's back gesture, the hardware key and the browser's back button all
// land on the screen's own back action.
export const leaveScreen = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && active) {
    // The entry pushed when this screen came up pops back onto it.
    window.history.back();
    return;
  }

  active?.();
};

export const useBack = (onBack: Back | null) => {
  const ref = useRef(onBack);
  ref.current = onBack;
  const on = onBack !== null;

  useEffect(() => {
    if (!on) return;

    const go = () => ref.current?.();
    active = go;

    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      go();
      return true;
    });

    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return () => {
        active = null;
        sub.remove();
      };
    }

    // One entry of our own, so the browser's back button returns here instead
    // of leaving the app.
    window.history.pushState({ back: true }, '');
    window.addEventListener('popstate', go);

    return () => {
      active = null;
      sub.remove();
      window.removeEventListener('popstate', go);
    };
  }, [on]);
};
