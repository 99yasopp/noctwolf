import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { teamColor, theme } from '../theme/colors';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

// One glyph per shipped card. A custom card gets the star, so a generated role
// still has a face on the table.
const glyphs: Record<string, IconName> = {
  werewolf: 'paw',
  'red-wolf': 'paw',
  alien: 'ufo',
  'big-bad-wolf': 'paw',
  'infectious-father': 'biohazard',
  'white-werewolf': 'snowflake',
  seer: 'eye',
  villager: 'home-heart',
  guard: 'shield',
  witch: 'flask',
  hunter: 'crosshairs-gps',
  fox: 'magnify',
  'little-girl': 'account-child',
  'bear-tamer': 'teddy-bear',
  raven: 'bird',
  'two-sisters': 'account-multiple',
  'three-brothers': 'account-group',
  'wolf-dog': 'dog-side',
  'wild-child': 'account-star',
  thief: 'hand-back-right',
  scapegoat: 'sheep',
  'village-idiot': 'emoticon-confused',
  'stuttering-judge': 'gavel',
  angel: 'star-four-points',
  'pied-piper': 'music-note',
  cupid: 'heart',
};

interface Props {
  roleId?: string | null;
  name?: string;
  team: string;
  size?: number;
  muted?: boolean;
}

// The role's face: a team-coloured ring around a dark glass disc. It is the
// same object in the seat corner, the role sheet and the rules compendium.
export const RoleSigil: React.FC<Props> = ({ roleId, team, size = 56, muted }) => {
  const accent = muted ? theme.colors.dim : teamColor(team);
  const icon = glyphs[roleId ?? ''] ?? 'star-four-points';
  const inner = Math.round(size * 0.76);

  return (
    <View
      accessible={false}
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          shadowColor: accent,
          shadowOpacity: muted ? 0 : 0.22,
          shadowRadius: size * 0.18,
          elevation: muted ? 0 : 2,
        },
      ]}
    >
      <LinearGradient
        colors={[accent, 'rgba(255,255,255,0.10)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }]}
      >
        <View
          style={[
            styles.inner,
            {
              width: inner,
              height: inner,
              borderRadius: inner / 2,
            },
          ]}
        >
          <MaterialCommunityIcons
            name={icon}
            size={Math.round(size * 0.4)}
            color={accent}
          />
        </View>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.base,
  },
});
