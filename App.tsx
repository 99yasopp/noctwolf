import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { GameProvider, useGame } from './src/ui/GameContext';
import { LobbyScreen } from './src/ui/screens/LobbyScreen';
import { NarratorDashboard } from './src/ui/screens/NarratorDashboard';
import { PlayerScreen } from './src/ui/screens/PlayerScreen';
import { theme } from './src/ui/theme/colors';

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

// The host runs the table from the dashboard, guests only ever see their own
// role and actions.
const Session = () => {
  const { mode } = useGame();

  if (mode === 'narrator') return <NarratorDashboard />;
  if (mode === 'player') return <PlayerScreen />;
  return <LobbyScreen />;
};

export default function App() {
  return (
    <ErrorBoundary>
      <GameProvider>
        <View style={styles.container}>
          <Session />
        </View>
      </GameProvider>
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
