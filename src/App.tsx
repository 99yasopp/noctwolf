import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { GameProvider } from './ui/GameContext';
import { LobbyScreen } from './ui/screens/LobbyScreen';
import { NarratorDashboard } from './ui/screens/NarratorDashboard';
import { PlayerScreen } from './ui/screens/PlayerScreen';
import { theme } from './ui/theme/colors';

// Simple navigation state for MVP
type Screen = 'Lobby' | 'Narrator' | 'Player';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('Lobby');

  return (
    <GameProvider>
      <View style={styles.container}>
        {currentScreen === 'Lobby' && <LobbyScreen />}
        {currentScreen === 'Narrator' && <NarratorDashboard />}
        {currentScreen === 'Player' && <PlayerScreen />}
      </View>
    </GameProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
});
