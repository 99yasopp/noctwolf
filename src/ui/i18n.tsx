import React, { createContext, useContext, useMemo } from 'react';
import { Language, Translate, setLanguage as setCurrent, translator } from '../i18n';

interface I18n {
  language: Language;
  setLanguage: (language: Language) => void;
  t: Translate;
}

// The device's own language, for every screen and every reader below.
const I18nContext = createContext<I18n>({
  language: 'en',
  setLanguage: () => {},
  t: translator('en'),
});

interface Props {
  language: Language;
  onChange: (language: Language) => void;
  children: React.ReactNode;
}

export const I18nProvider: React.FC<Props> = ({ language, onChange, children }) => {
  // Code outside React — the engine's own journal, mostly — reads the same
  // language from the module. Keeping it in step is idempotent.
  setCurrent(language);

  const value = useMemo<I18n>(
    () => ({ language, setLanguage: onChange, t: translator(language) }),
    [language, onChange],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = (): I18n => useContext(I18nContext);
