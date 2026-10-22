import { useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';

// What "back" means on the layer that is up. Screens, sheets and modals push
// their own handler, so a sheet closes before the table behind it.
type Back = () => void;

const stack: Back[] = [];
let listening = false;

const onPop = () => {
  stack[stack.length - 1]?.();
};

const listenForBrowserBack = () => {
  if (listening) return;
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  window.addEventListener('popstate', onPop);
  listening = true;
};

// The phone's back gesture, the hardware key and the browser's back button all
// land on the top layer's own action.
export const leaveScreen = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (stack.length > 0) window.history.back();
    return;
  }

  stack[stack.length - 1]?.();
};

export const useBack = (onBack: Back | null) => {
  const ref = useRef(onBack);
  ref.current = onBack;
  const on = onBack !== null;

  useEffect(() => {
    if (!on) return;

    const go = () => ref.current?.();
    stack.push(go);
    listenForBrowserBack();

    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      stack[stack.length - 1]?.();
      return true;
    });

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // One entry of our own, so the browser's back button returns here instead
      // of leaving the app.
      window.history.pushState({ back: true }, '');
    }

    return () => {
      const at = stack.lastIndexOf(go);
      if (at >= 0) stack.splice(at, 1);
      sub.remove();
    };
  }, [on]);
};
