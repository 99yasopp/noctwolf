import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Text, TextInput } from '../text';
import { theme } from '../theme/colors';
import { BaseButton } from '../components/BaseButton';
import { ScreenHeader } from '../components/ScreenHeader';
import { useBack } from '../back';
import { RoleGrid } from '../components/RoleGrid';
import { ALL_ROLES, getCustomRoles } from '../../engine/roleSet';
import { say } from '../../i18n';
import { useI18n } from '../i18n';
import {
  SETTING_DEFS,
  SettingDef,
  SettingValue,
  RoleSetup,
  fillWithVillagers,
  nextSettingValue,
  settingLabel,
  settingName,
  settingHelp,
  setupProblem,
  setupSeatsUsed,
  setupSetting,
} from '../../engine/setup';

interface Props {
  setup: RoleSetup;
  // How many players are at the table right now, so the seats can be counted.
  playerCount: number;
  onChange: (setup: RoleSetup) => void;
  onBack: () => void;
}

// One row of the table: a role, how many seats it takes, and a way to change
// that without typing a number. A row with a unit is a duration instead, so it
// carries the figure itself and the host can write it down in one go.
const Stepper: React.FC<{
  label: string;
  note?: string;
  count: number;
  unit?: string;
  onChange: (count: number) => void;
}> = ({ label, note, count, unit, onChange }) => {
  // What the host is halfway through writing, if anything: the digits he typed
  // stay on screen while the value behind them is stored as he goes, so
  // leaving the field — or the screen — never loses the time he wrote. The
  // bounds are the caller's, and it clamps what it is handed.
  const [typed, setTyped] = React.useState<string | null>(null);

  const step = (delta: number) => {
    setTyped(null);
    // A role count can never go below zero; a duration's bounds are the host's
    // rules, and the caller holds those.
    onChange(unit ? count + delta : Math.max(0, count + delta));
  };

  const write = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '');
    setTyped(digits);
    if (digits.length === 0) return;
    const written = Number.parseInt(digits, 10);
    if (written !== count) onChange(written);
  };

  return (
    <View style={styles.stepperRow}>
      <View style={styles.stepperLabel}>
        <Text style={styles.roleName}>
          {label}
          {!unit && count > 0 ? ` ×${count}` : ''}
        </Text>
        {note ? <Text style={styles.roleNote}>{note}</Text> : null}
      </View>
      <View style={styles.stepperButtons}>
        <TouchableOpacity
          style={[styles.stepButton, count <= 0 && styles.stepButtonOff]}
          onPress={() => step(-1)}
          activeOpacity={0.75}
          accessibilityRole="button"
        >
          <Text style={styles.stepText}>−</Text>
        </TouchableOpacity>
        {unit ? (
          <View style={styles.typedCount}>
            <TextInput
              style={styles.countInput}
              value={typed ?? `${count}`}
              onChangeText={write}
              onBlur={() => setTyped(null)}
              onSubmitEditing={() => setTyped(null)}
              keyboardType="number-pad"
              maxLength={3}
              selectTextOnFocus
            />
            <Text style={styles.countUnit}>{say(`unit.${unit}`, undefined, unit)}</Text>
          </View>
        ) : (
          <Text style={styles.count}>{count}</Text>
        )}
        <TouchableOpacity
          style={styles.stepButton}
          onPress={() => step(1)}
          activeOpacity={0.75}
          accessibilityRole="button"
        >
          <Text style={styles.stepText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

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
  const { t } = useI18n();

  // Every built-in role, then whatever the host made with the AI. The grid
  // groups them by side on its own.
  const roles = [
    ...ALL_ROLES,
    ...customRoles.filter(role => !ALL_ROLES.some(built => built.id === role.id)),
  ];

  const setCount = (roleId: string, count: number) =>
    onChange({ ...setup, counts: { ...setup.counts, [roleId]: count } });

  // The phone's back gesture means what the screen's back control means.
  useBack(onBack);

  const setSetting = (id: string, value: SettingValue) =>
    onChange({ ...setup, settings: { ...setup.settings, [id]: value } });

  const countSetting = (def: SettingDef) => {
    const value = setupSetting(setup, def.id);
    return typeof value === 'number' ? value : 0;
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={t('ui.setup.title')}
        meta={t('ui.setup.seats', { seats, total: playerCount })}
        backLabel={t('ui.setup.back')}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {problem ? (
        <View style={styles.problemCard}>
          <Text style={styles.problemText}>{problem}</Text>
          {seats < playerCount && (
            <BaseButton
              title={t('ui.setup.fillVillagers')}
              onPress={() => onChange(fillWithVillagers(setup, playerCount))}
              variant="secondary"
            />
          )}
        </View>
      ) : (
        <Text style={styles.okText}>{t('ui.setup.ready')}</Text>
      )}

      <Text style={styles.subHeader}>{t('ui.setup.roles')}</Text>
      <RoleGrid roles={roles} counts={setup.counts} onChange={setCount} />

      <Text style={styles.subHeader}>{t('ui.setup.houseRules')}</Text>
      {SETTING_DEFS.filter(
        def => !def.whenRole || (setup.counts?.[def.whenRole] ?? 0) > 0,
      ).map(def =>
        def.count ? (
          <Stepper
            key={def.id}
            label={settingName(def)}
            note={settingHelp(def)}
            count={countSetting(def)}
            unit={def.count.unit}
            onChange={value =>
              setSetting(
                def.id,
                Math.min(def.count!.max, Math.max(def.count!.min, value)),
              )
            }
          />
        ) : (
          <View key={def.id}>
            <BaseButton
              title={`${settingName(def)}: ${settingLabel(def, setupSetting(setup, def.id))}`}
              variant="secondary"
              onPress={() =>
                setSetting(def.id, nextSettingValue(def, setupSetting(setup, def.id)))
              }
            />
            <Text style={styles.hint}>{settingHelp(def)}</Text>
          </View>
        ),
      )}

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
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    padding: theme.spacing.medium,
    paddingBottom: theme.spacing.large * 2,
  },
  subHeader: {
    color: theme.colors.text,
    fontSize: theme.type.section,
    fontWeight: '800',
    marginTop: theme.spacing.medium,
    marginBottom: theme.spacing.small,
  },
  hint: {
    color: theme.colors.dim,
    fontSize: theme.type.small,
    lineHeight: 19,
    marginBottom: theme.spacing.small,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius,
    borderWidth: 1,
    borderColor: theme.colors.border,
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
    fontSize: theme.type.body,
    fontWeight: '600',
  },
  roleNote: {
    color: theme.colors.dim,
    fontSize: 13,
  },
  stepperButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepButton: {
    width: theme.inlineTouchTarget,
    height: theme.inlineTouchTarget,
    borderRadius: theme.inlineTouchTarget / 2,
    backgroundColor: theme.colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonOff: {
    opacity: 0.4,
  },
  stepText: {
    color: theme.colors.background,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 26,
  },
  count: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
    minWidth: 36,
    textAlign: 'center',
  },
  // A duration is a figure the host writes, so it reads as a field with the
  // unit sitting next to it: "40s", not a tap count.
  typedCount: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  countInput: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
    minWidth: 44,
    minHeight: theme.inlineTouchTarget,
    textAlign: 'center',
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.secondary,
  },
  countUnit: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '800',
    marginLeft: 2,
  },
  problemCard: {
    backgroundColor: theme.colors.tintDanger,
    borderStartWidth: 3,
    borderStartColor: theme.colors.danger,
    padding: theme.spacing.medium,
    marginBottom: theme.spacing.small,
  },
  problemText: {
    color: theme.colors.danger,
    fontSize: theme.type.small,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: theme.spacing.small,
  },
  okText: {
    color: theme.colors.secondary,
    fontSize: theme.type.small,
    fontWeight: '700',
    marginBottom: theme.spacing.small,
  },
});
