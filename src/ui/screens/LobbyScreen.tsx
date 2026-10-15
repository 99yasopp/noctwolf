import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { theme } from '../theme/colors';
import { BaseButton } from '../components/BaseButton';
import { LobbyManager } from '../../network/lobby';

const lobby = new LobbyManager();

export const LobbyScreen = ({ navigation }: { navigation?: any }) => {
  const [view, setView] = useState<'menu' | 'host' | 'join' | 'waiting'>('menu');
  const [roomCode, setRoomCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [playerName, setPlayerName] = useState('Player');
  const [players, setPlayers] = useState<any[]>([]);

  useEffect(() => {
    if (view === 'waiting') {
      const interval = setInterval(() => {
        setPlayers([...lobby.getPlayers()]);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [view]);

  const hostGame = () => {
    const code = lobby.generateRoomCode();
    if (!code) {
      alert('Could not start hosting on this device.');
      return;
    }

    // Host adds themselves
    lobby.addPlayer({
      id: 'host-1',
      name: playerName,
      role: 'Unknown',
      team: 'Village',
      isAlive: true,
      statusEffects: [],
      voteWeight: 1,
    });
    setRoomCode(code);
    setView('waiting');
  };

  const joinGame = async () => {
    const success = await lobby.joinGame(inputCode, {
      id: Math.random().toString(),
      name: playerName,
      role: 'Unknown',
      team: 'Village',
      isAlive: true,
      statusEffects: [],
      voteWeight: 1,
    });

    if (success) {
      setView('waiting');
    } else {
      alert('Could not find room code');
    }
  };

  const renderView = () => {
    switch (view) {
      case 'menu':
        return (
          <View style={styles.menu}>
            <TextInput
              style={styles.input}
              placeholder="Enter your name"
              value={playerName}
              onChangeText={setPlayerName}
            />
            <BaseButton title="Host a Game" onPress={() => setView('host')} />
            <BaseButton title="Join a Game" onPress={() => setView('join')} variant="secondary" />
          </View>
        );
      case 'host':
        return (
          <View style={styles.menu}>
            <Text style={styles.text}>Hosting...</Text>
            <BaseButton title="Generate Code & Start" onPress={hostGame} />
            <BaseButton title="Back" onPress={() => setView('menu')} variant="danger" />
          </View>
        );
      case 'join':
        return (
          <View style={styles.menu}>
            <TextInput
              style={styles.input}
              placeholder="Enter Room Code"
              value={inputCode}
              onChangeText={setInputCode}
              autoCapitalize="characters"
            />
            <BaseButton title="Join" onPress={joinGame} />
            <BaseButton title="Back" onPress={() => setView('menu')} variant="danger" />
          </View>
        );
      case 'waiting':
        return (
          <View style={styles.menu}>
            <Text style={styles.text}>Room Code: {roomCode}</Text>
            <Text style={styles.title}>Waiting Room</Text>
            <Text style={styles.text}>Players connected:</Text>
            {players.map((p) => (
              <Text key={p.id} style={styles.playerText}>{p.name}</Text>
            ))}
            <BaseButton title="Back" onPress={() => setView('menu')} variant="danger" />
          </View>
        );
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Werewolf Manager</Text>
      {renderView()}
    </View>
  );
};

const styles = StyleSheet.create({
  menu: {
    width: '100%',
  },
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
  input: {
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    padding: theme.spacing.medium,
    borderRadius: theme.borderRadius,
    marginBottom: theme.spacing.small,
  },
  playerText: {
    color: theme.colors.secondary,
    fontSize: 18,
    textAlign: 'center',
    marginVertical: 4,
  },
  text: {
    color: theme.colors.text,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: theme.spacing.small,
  },
});
