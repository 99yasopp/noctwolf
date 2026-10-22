import React, { useEffect, useState } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { Text } from './src/ui/text';
import { GameProvider, useGame } from './src/ui/GameContext';
import { LobbyScreen } from './src/ui/screens/LobbyScreen';
import { NarratorDashboard } from './src/ui/screens/NarratorDashboard';
import { PlayerScreen } from './src/ui/screens/PlayerScreen';
import { theme } from './src/ui/theme/colors';
import { I18nProvider, useI18n } from './src/ui/i18n';
import { Language } from './src/i18n';
import { loadPreferences, savePreferences } from './src/services/preferences';

// Error Boundary Component
class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean}> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: any) { console.error(error); }
  render() {
    if (this.state.hasError) return <View style={styles.container}><Text style={styles.text}>Something went wrong. Please restart the app.</Text></View>;
    return this.props.children;
  }
}

// Yoga reverses every row of a subtree drawn right to left. Kept out of
// StyleSheet for the browser, which rejects the property and reads the
// direction from the document instead.
const rtlLayout = { direction: 'rtl' } as const;

// The device's reading direction, applied once at the root: an Arabic phone
// lays every row out from the right, and the screens below inherit it.
const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { rtl } = useI18n();

  // A browser reads the direction from the document; a phone reads it from
  // Yoga, which reverses every row of this subtree.
  useEffect(() => {
    const doc = (globalThis as unknown as { document?: { documentElement: { dir: string } } })
      .document;
    if (Platform.OS === 'web' && doc) doc.documentElement.dir = rtl ? 'rtl' : 'ltr';
  }, [rtl]);

  return (
    <View
      style={[styles.container, rtl && Platform.OS !== 'web' ? rtlLayout : null]}
    >
      {children}
    </View>
  );
};

// The host runs the table from the dashboard, guests only ever see their own
// role and actions.
const Session = () => {
  const { mode } = useGame();

  if (mode === 'narrator') return <NarratorDashboard />;
  if (mode === 'player') return <PlayerScreen />;
  return <LobbyScreen />;
};

export default function App() {
  // The device's language, set before anything else is rendered: a phone that
  // picked French opens on French.
  const [language, setLanguage] = useState<Language>('en');

  useEffect(() => {
    loadPreferences().then(saved => {
      if (saved.language) setLanguage(saved.language);
    });
  }, []);

  const changeLanguage = (next: Language) => {
    setLanguage(next);
    savePreferences({ language: next });
  };

  return (
    <ErrorBoundary>
      <I18nProvider language={language} onChange={changeLanguage}>
        <GameProvider>
          <Shell>
            <Session />
          </Shell>
        </GameProvider>
      </I18nProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  text: {
    color: '#fff',
    textAlign: 'center',
    marginTop: 50,
  }
});
