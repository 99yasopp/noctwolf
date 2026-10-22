import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../text';
import { theme } from '../theme/colors';
import { SaidLine, actionLabel, teamName } from '../../i18n';
import { useI18n } from '../i18n';
import { OwnRole } from './ActionPanel';
import { RoleSigil } from './RoleSigil';
import { TactileButton } from './TactileButton';

interface Props {
  role: OwnRole | null;
  hidden?: boolean;
  onShow?: () => void;
  onHide?: () => void;
  emptyLabel?: string;
  // The pack is only known once the table has its mayor; before that the
  // names stay off the sheet.
  alliesKnown?: boolean;
  secrets?: SaidLine[];
}

// The private card, shown only after the phone's owner asks for it. It is the
// one place where the role, the pack and the private readings live together.
export const RolePanel: React.FC<Props> = ({
  role,
  hidden,
  onShow,
  onHide,
  emptyLabel,
  alliesKnown = true,
  secrets,
}) => {
  const { t } = useI18n();

  if (!role) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{emptyLabel ?? t('ui.play.waitingStart')}</Text>
      </View>
    );
  }

  if (hidden) {
    return (
      <View style={styles.covered}>
        <View style={styles.coverMark}>
          <Text style={styles.coverGlyph}>?</Text>
        </View>
        <Text style={styles.coveredTitle}>{t('ui.play.yourRole')}</Text>
        <Text style={styles.coveredBody}>{t('ui.play.showToAct')}</Text>
        {onShow ? (
          <TactileButton
            title={t('ui.play.showRole')}
            onPress={onShow}
            variant="secondary"
            icon="eye-outline"
            style={styles.coverButton}
          />
        ) : null}
      </View>
    );
  }

  const actions = role.nightActions ?? [];

  return (
    <View>
      <View style={styles.hero}>
        <RoleSigil roleId={role.roleId} name={role.name} team={role.team} size={88} />
        <View style={styles.heroText}>
          <Text style={styles.roleName}>{role.name}</Text>
          <View style={styles.teamPill}>
            <View style={[styles.teamDot, { backgroundColor: theme.colors.team[role.team as keyof typeof theme.colors.team] ?? theme.colors.dim }]} />
            <Text style={styles.teamText}>{teamName(role.team)}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.description}>{role.description}</Text>

      {alliesKnown && role.allies && role.allies.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.heading}>
            {role.team === 'Wolf' ? t('ui.pack.yours') : t('ui.pack.alliance')}
          </Text>
          <Text style={styles.body}>{role.allies.map(ally => ally.name).join(', ')}</Text>
        </View>
      ) : null}

      {actions.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.heading}>{t('ui.action.night')}</Text>
          {actions.map(action => (
            <Text key={action.id} style={styles.action}>
              {actionLabel(role.roleId ?? '', action.id, action.label)}
            </Text>
          ))}
        </View>
      ) : null}

      {secrets && secrets.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.heading}>{t('ui.play.privateInfo')}</Text>
          {secrets.map((secret, index) => (
            <Text key={`${secret.key}-${index}`} style={styles.body}>
              {t(secret.key, secret.params)}
            </Text>
          ))}
        </View>
      ) : null}

      {onHide ? (
        <TactileButton
          title={t('ui.play.hideRole')}
          onPress={onHide}
          variant="secondary"
          icon="eye-off-outline"
          style={styles.hide}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  heroText: {
    flex: 1,
    gap: 7,
  },
  roleName: {
    color: theme.colors.text,
    fontSize: theme.type.hero,
    fontWeight: '900',
    lineHeight: 34,
  },
  teamPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.raised,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  teamDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  teamText: {
    color: theme.colors.dim,
    fontSize: 12,
    fontWeight: '800',
  },
  description: {
    color: theme.colors.text,
    fontSize: theme.type.body,
    lineHeight: 24,
  },
  block: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    gap: 6,
  },
  heading: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  body: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  action: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 22,
    paddingStart: 10,
  },
  hide: {
    marginTop: 20,
  },
  covered: {
    alignItems: 'center',
    paddingVertical: 18,
    gap: 10,
  },
  coverMark: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: theme.colors.raised,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverGlyph: {
    color: theme.colors.primary,
    fontSize: 42,
    fontWeight: '900',
  },
  coveredTitle: {
    color: theme.colors.text,
    fontSize: theme.type.section,
    fontWeight: '900',
  },
  coveredBody: {
    color: theme.colors.dim,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  coverButton: {
    alignSelf: 'stretch',
    marginTop: 6,
  },
  empty: {
    paddingVertical: 38,
    alignItems: 'center',
  },
  emptyText: {
    color: theme.colors.dim,
    fontSize: 15,
    textAlign: 'center',
  },
});
