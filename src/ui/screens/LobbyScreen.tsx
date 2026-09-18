import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { theme } from '../theme/colors';
import { BaseButton } from '../components/BaseButton';
import { LobbyManager } from '../../network/lobby';

const lobby = new LobbyManager();

export const LobbyScreen = ({ navigation }: { navigation?: any }) => {
  const [isHosting, setIsHosting] = useState(false);
  const [roomCode, setRoomCode] = useState('');

  const hostGame = () => {
    const code = lobby.generateRoomCode();
    setRoomCode(code);
    setIsHosting(true);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Werewolf Manager</Text>
      
      {!isHosting ? (
        <View style={styles.menu}>
          <BaseButton title="Host a Game" onPress={hostGame} />
          <BaseButton title="Join a Game" onPress={() => console.log('Joining...')} variant="secondary" />
        </View>
      ) : (
        <View style={styles.menu}>
          <Text style={styles.text}>Room Code: {roomCode}</Text>
          <Text style={styles.text}>Waiting for players...</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    padding: theme.spacing.medium,
  },
  title: {
    fontSize: 32,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: theme.spacing.large,
    fontWeight: 'bold',
  },
  menu: {
    width: '100%',
  },
  text: {
    color: theme.colors.text,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: theme.spacing.small,
  },
});
