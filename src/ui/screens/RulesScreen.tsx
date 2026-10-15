import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { theme } from '../theme/colors';
import { BaseButton } from '../components/BaseButton';
import { ALL_ROLES, getCustomRoles } from '../../engine/roleSet';
import { getRoleTips } from '../../engine/rolepedia';

interface Props {
  onBack: () => void;
}

const HOW_TO_PLAY = [
  'The host plays too: the phone that hosts is the narrator and one of the players.',
  'Everyone else joins with the host address shown in the lobby.',
  'The first night is peaceful: the wolves only look around, so the first day vote decides who leaves.',
  'Night: wolves choose a victim, the seer looks at one player, the guard and the witch act.',
  'Day: talk. Vote: whoever has the most votes is out. A tie is voted again once.',
  'The village wins when every wolf is gone. The wolves win when they are at least half of the survivors.',
];

const NIGHT_ORDER = [
  'Guard shields a player (never the same one twice in a row).',
  'Witch may heal the wolves\u2019 victim, and may poison anyone.',
  'Wolves devour one player. Shielding or healing stops it, poison does not.',
  'Seer inspects one player and is told if that player is a wolf.',
  'Cupid ties two players together on the first night only.',
  'Deaths are announced in the morning. The Hunter takes someone down when he dies.',
];

export const RulesScreen = ({ onBack }: Props) => {
  const customRoles = getCustomRoles();
  const roles = [...ALL_ROLES, ...customRoles];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.header}>How to Play</Text>

      {HOW_TO_PLAY.map((line, index) => (
        <Text key={index} style={styles.text}>
          • {line}
        </Text>
      ))}

      <Text style={styles.subHeader}>Night order</Text>
      {NIGHT_ORDER.map((line, index) => (
        <Text key={index} style={styles.text}>
          {index + 1}. {line}
        </Text>
      ))}

      <Text style={styles.subHeader}>Roles</Text>
      {roles.map(role => (
        <View key={role.id} style={styles.card}>
          <Text style={styles.roleName}>
            {role.name}
            <Text style={styles.roleTeam}> — {role.team}</Text>
            {role.id.startsWith('custom-') ? (
              <Text style={styles.roleTeam}> (your own)</Text>
            ) : null}
          </Text>
          <Text style={styles.text}>{role.description}</Text>

          {getRoleTips(role.id).map((tip, index) => (
            <Text key={index} style={styles.tip}>
              {tip}
            </Text>
          ))}

          {role.nightActions?.map(action => (
            <Text key={action.id} style={styles.action}>
              At night: {action.label}
              {action.oncePerGame ? ' (once per game)' : ''}
            </Text>
          ))}

          {role.voteWeight && role.voteWeight > 1 ? (
            <Text style={styles.action}>Vote counts {role.voteWeight} times.</Text>
          ) : null}
        </View>
      ))}

      <BaseButton title="Back" onPress={onBack} variant="danger" />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.medium,
    paddingBottom: theme.spacing.large,
  },
  header: {
    fontSize: 24,
    color: theme.colors.text,
    fontWeight: 'bold',
    marginBottom: theme.spacing.medium,
  },
  subHeader: {
    fontSize: 18,
    color: theme.colors.text,
    fontWeight: 'bold',
    marginTop: theme.spacing.large,
    marginBottom: theme.spacing.small,
  },
  text: {
    color: theme.colors.text,
    fontSize: 15,
    marginBottom: theme.spacing.small,
  },
  card: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.medium,
    borderRadius: theme.borderRadius,
    marginBottom: theme.spacing.small,
  },
  roleName: {
    color: theme.colors.primary,
    fontSize: 17,
    fontWeight: 'bold',
    marginBottom: theme.spacing.small,
  },
  roleTeam: {
    color: '#888',
    fontSize: 14,
    fontWeight: 'normal',
  },
  tip: {
    color: '#aaa',
    fontSize: 14,
    fontStyle: 'italic',
    marginTop: theme.spacing.small,
  },
  action: {
    color: '#7fb2ff',
    fontSize: 14,
    marginTop: theme.spacing.small,
  },
});
