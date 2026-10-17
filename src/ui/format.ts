  // Shared display helpers.

import { Team } from '../engine/types';
import { Key, Params, Translate } from '../i18n';

// Who won, in one line. 'Solitary' alone would always read as the lovers, so
// the engine's own line wins when it sent one, in the reader's own language.
export const winnerText = (
  winner: Team,
  t: Translate,
  own?: { key?: string; params?: Params } | null,
): string => {
  if (own?.key) return t(own.key as Key, own.params);
  if (winner === 'Wolf') return t('log.wolvesWin');
  if (winner === 'Solitary') return t('log.loversWin');
  return t('log.villageWins');
};

// A countdown as m:ss, never negative.
export const formatRemaining = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};
