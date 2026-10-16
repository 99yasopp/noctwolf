import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { theme } from '../theme/colors';
import { BaseButton } from '../components/BaseButton';
import { ALL_ROLES, getCustomRoles } from '../../engine/roleSet';
import {
  SETTING_DEFS,
  SettingDef,
  RoleSetup,
  fillWithVillagers,
  nextSettingValue,
  settingLabel,
  setupProblem,
  setupSeatsUsed,
} from '../../engine/setup';

interface Props {
  setup: RoleSetup;
  // How many players are at the table right now, so the seats can be counted.
  playerCount: number;
  onChange: (setup: RoleSetup) => void;
  onBack: () => void;
}

// One row of the table: a role, how many seats it takes, and a way to change
// that without typing a number.
const Stepper: React.FC<{
  label: string;
  note?: string;
  count: number;
  onChange: (count: number) => void;
}> = ({ label, note, count, onChange }) => (
  <View style={styles.stepperRow}>
    <View style={styles.stepperLabel}>
      <Text style={styles.roleName}>
        {label}
        {count > 0 ? ` ×${count}` : ''}
      </Text>
      {note ? <Text style={styles.roleNote}>{note}</Text> : null}
    </View>
    <View style={styles.stepperButtons}>
      <TouchableOpacity
        style={[styles.stepButton, count <= 0 && styles.stepButtonOff]}
        onPress={() => onChange(Math.max(0, count - 1))}
        activeOpacity={0.7}
      >
        <Text style={styles.stepText}>−</Text>
      </TouchableOpacity>
      <Text style={styles.count}>{count}</Text>
      <TouchableOpacity
        style={styles.stepButton}
        onPress={() => onChange(count + 1)}
        activeOpacity={0.7}
      >
        <Text style={styles.stepText}>+</Text>
      </TouchableOpacity>
    </View>
  </View>
);

// The host's table: which roles are dealt, how many potions the witch holds,
// and the house rules. Everything here is saved, so the next evening opens on
// the same table.
export const SetupScreen: React.FC<Props> = ({
  setup,
  playerCount,
  onChange,
  onBack,
}) => {
  const problem = setupProblem(setup, playerCount);
  const seats = setupSeatsUsed(setup);
  const customRoles = getCustomRoles();

  // The built-in roles first, then whatever the host made with the AI.
  const roles = [
    ...ALL_ROLES.filter(role => role.id !== 'villager'),
    ...customRoles.filter(role => !ALL_ROLES.some(built => built.id === role.id)),
    ...ALL_ROLES.filter(role => role.id === 'villager'),
  ];

  const setCount = (roleId: string, count: number) =>
    onChange({ ...setup, counts: { ...setup.counts, [roleId]: count } });

  const setSetting = (id: string, def: SettingDef) =>
    onChange({
      ...setup,
      settings: { ...setup.settings, [id]: nextSettingValue(def, setup.settings?.[id]) },
    });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>The table</Text>
      <Text style={styles.hint}>
        {seats} of {playerCount} seats filled.
      </Text>

      {problem ? (
        <View style={styles.problemCard}>
          <Text style={styles.problemText}>{problem}</Text>
          {seats < playerCount && (
            <BaseButton
              title="Fill the rest with villagers"
              onPress={() => onChange(fillWithVillagers(setup, playerCount))}
              variant="secondary"
            />
          )}
        </View>
      ) : (
        <Text style={styles.okText}>The table is ready.</Text>
      )}

      <Text style={styles.subHeader}>Roles</Text>
      {roles.map(role => (
        <Stepper
          key={role.id}
          label={role.name}
          note={role.team === 'Wolf' ? 'Wolf' : undefined}
          count={setup.counts[role.id] ?? 0}
          onChange={count => setCount(role.id, count)}
        />
      ))}

      {(setup.counts.witch ?? 0) > 0 && (
        <>
          <Text style={styles.subHeader}>The witch</Text>
          <Stepper
            label="Healing potions"
            note="Spent only when they save somebody."
            count={setup.witchHealCharges}
            onChange={value => onChange({ ...setup, witchHealCharges: value })}
          />
          <Stepper
            label="Poison"
            note="Poison is not stopped by the guard."
            count={setup.witchPoisonCharges}
            onChange={value => onChange({ ...setup, witchPoisonCharges: value })}
          />
          <Text style={styles.hint}>
            A potion count of zero means that potion is not in play.
          </Text>
        </>
      )}

      <Text style={styles.subHeader}>House rules</Text>
      {SETTING_DEFS.map(def => (
        <View key={def.id}>
          <BaseButton
            title={`${def.label}: ${settingLabel(def, setup.settings?.[def.id])}`}
            variant="secondary"
            onPress={() => setSetting(def.id, def)}
          />
          <Text style={styles.hint}>{def.help}</Text>
        </View>
      ))}

      <BaseButton title="Back to the waiting room" onPress={onBack} variant="danger" />
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
    paddingBottom: theme.spacing.large * 2,
  },
  title: {
    fontSize: 28,
    color: theme.colors.text,
    textAlign: 'center',
    fontWeight: 'bold',
    marginBottom: theme.spacing.small,
  },
  subHeader: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: theme.spacing.medium,
    marginBottom: theme.spacing.small,
  },
  hint: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: theme.spacing.small,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius,
    paddingHorizontal: theme.spacing.medium,
    paddingVertical: theme.spacing.small,
    marginVertical: 4,
  },
  stepperLabel: {
    flex: 1,
    paddingRight: theme.spacing.small,
  },
  roleName: {
    color: theme.colors.text,
    fontSize: 16,
  },
  roleNote: {
    color: '#888',
    fontSize: 12,
  },
  stepperButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonOff: {
    opacity: 0.4,
  },
  stepText: {
    color: theme.colors.background,
    fontSize: 22,
    fontWeight: 'bold',
    lineHeight: 24,
  },
  count: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    minWidth: 32,
    textAlign: 'center',
  },
  problemCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius,
    padding: theme.spacing.medium,
    marginBottom: theme.spacing.small,
  },
  problemText: {
    color: theme.colors.danger,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: theme.spacing.small,
  },
  okText: {
    color: theme.colors.secondary,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: theme.spacing.small,
  },
});
