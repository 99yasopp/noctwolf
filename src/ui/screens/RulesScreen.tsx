import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { theme } from '../theme/colors';
import { BackBar } from '../components/BackBar';
import { useBack } from '../back';
import { actionLabel, roleDescription, roleName, roleTips, teamName } from '../../i18n';
import { ALL_ROLES, getCustomRoles } from '../../engine/roleSet';
import { getRoleTips } from '../../engine/rolepedia';
import { useI18n } from '../i18n';

interface Props {
  onBack: () => void;
}

const HOW_TO_PLAY = [
  'The host plays too: hosting is only how the table is wired, his phone is one of the players.',
  'Everyone else joins with the host address shown in the lobby.',
  'The game opens with the mayoral election, then the first night falls.',
  'At a three-player table the first night is peaceful: the wolves only look around, so the first day vote decides who leaves.',
  'Night: the wolves and the other roles act first, then the witch wakes and sees who was attacked.',
  'Day: talk. Vote: whoever has the most votes is out. A tie is voted again once.',
  'The village wins when every wolf is gone. The wolves win when they are at least half of the survivors.',
];

const NIGHT_ORDER = [
  'Guard shields a player (never the same one twice in a row).',
  'Wolves devour one player. Shielding or healing stops it, poison does not.',
  'Seer inspects one player and is told if that player is a wolf.',
  'Cupid ties two players together on the first night only.',
  'Witch wakes last: she may heal the player the wolves took, and may poison anyone.',
  'Deaths are announced in the morning. The Hunter takes someone down when he dies, and a dying mayor names his successor.',
];

const MAYOR_RULES = [
  'The mayor is not a card: the table elects one before the first night.',
  'The first three players to stand are the candidates; nobody standing means three are drawn at random.',
  'The candidates speak, then the table votes. A tie is voted again once; a second tie leaves the seat empty.',
  'The mayor\u2019s vote counts twice, and a wolf may win the seat.',
  'If the mayor dies, he names the player who takes the title. If he names nobody, the seat stays empty.',
];

export const RulesScreen = ({ onBack }: Props) => {
  const customRoles = getCustomRoles();
  const roles = [...ALL_ROLES, ...customRoles];
  const { t } = useI18n();

  // The long pages travel as one key with one line per row: a language rewrites
  // the whole page in its own words, and the screen only counts the lines.
  const lines = (key: string, fallback: string[]) =>
    t(key, undefined, fallback.join('\n'))
      .split('\n')
      .filter(line => line.trim().length > 0);

  // The phone's back gesture means what the screen's back control means.
  useBack(onBack);

  return (
    <View style={styles.container}>
      <BackBar />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.header}>{t('ui.rules.title')}</Text>

      {lines('ui.rules.howTo', HOW_TO_PLAY).map((line, index) => (
        <Text key={index} style={styles.text}>
          • {line}
        </Text>
      ))}

      <Text style={styles.subHeader}>{t('ui.rules.nightOrder')}</Text>
      {lines('ui.rules.nightSteps', NIGHT_ORDER).map((line, index) => (
        <Text key={index} style={styles.text}>
          {index + 1}. {line}
        </Text>
      ))}

      <Text style={styles.subHeader}>{t('ui.rules.mayor')}</Text>
      {lines('ui.rules.mayorSteps', MAYOR_RULES).map((line, index) => (
        <Text key={index} style={styles.text}>
          • {line}
        </Text>
      ))}

      <Text style={styles.subHeader}>{t('ui.rules.roles')}</Text>
      {roles.map(role => (
        <View key={role.id} style={styles.card}>
          <Text style={styles.roleName}>
            {roleName(role.id, role.name)}
            <Text style={styles.roleTeam}> — {teamName(role.team)}</Text>
            {role.id.startsWith('custom-') ? (
              <Text style={styles.roleTeam}> {t('ui.rules.yourOwn')}</Text>
            ) : null}
          </Text>
          <Text style={styles.text}>{roleDescription(role.id, role.description)}</Text>

          {roleTips(role.id, getRoleTips(role.id)).map((tip, index) => (
            <Text key={index} style={styles.tip}>
              {tip}
            </Text>
          ))}

          {role.nightActions?.map(action => (
            <Text key={action.id} style={styles.action}>
              {t('ui.rules.atNight', {
                action: actionLabel(role.id, action.id, action.label),
              })}
              {action.oncePerGame ? ` ${t('ui.common.oncePerGame')}` : ''}
            </Text>
          ))}

          {role.voteWeight && role.voteWeight > 1 ? (
            <Text style={styles.action}>
              {t('ui.rules.voteCounts', { count: role.voteWeight })}
            </Text>
          ) : null}
        </View>
      ))}

      </ScrollView>
    </View>
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
