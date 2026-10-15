import { Platform } from 'react-native';

// Metro compiles react-native-tcp-socket's src/index.js, whose last statement
// is `module.exports = {...}`. That assignment overwrites the Babel-generated
// `exports.default`, so a raw require() has no usable `.default` (it is
// undefined) even though `import TcpSocket from 'react-native-tcp-socket'`
// works (Babel wraps non-ESM modules). `mod?.default ?? mod` handles both
// export shapes, and keeping it here means the quirk lives in exactly one place.

const unwrap = (mod: any): any => {
  if (!mod) return null;
  return mod.default ?? mod;
};

export const loadTcpSocket = (): any => {
  if (Platform.OS === 'web') return null;
  try {
    return unwrap(require('react-native-tcp-socket'));
  } catch (error) {
    console.error('react-native-tcp-socket could not be loaded', error);
    return null;
  }
};

// react-native-zeroconf's default export is the Zeroconf *class* (it extends
// EventEmitter), so it must be instantiated. Constructing it can throw if the
// native module is missing, hence the guard here rather than at each call site.
export const createZeroconf = (): any => {
  if (Platform.OS === 'web') return null;
  try {
    const Zeroconf = unwrap(require('react-native-zeroconf'));
    if (typeof Zeroconf !== 'function') {
      console.error('react-native-zeroconf did not export a constructor');
      return null;
    }
    return new Zeroconf();
  } catch (error) {
    console.error('react-native-zeroconf could not be initialised', error);
    return null;
  }
};
