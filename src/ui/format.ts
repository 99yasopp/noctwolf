// Shared display helpers.

import { Team } from '../engine/types';

// Who won, in one line. 'Solitary' alone would always read as the lovers, so
// the engine's own label wins when it sent one.
export const winnerText = (winner: Team, label?: string | null): string => {
  if (label) return label;
  if (winner === 'Wolf') return 'The Werewolves win.';
  if (winner === 'Solitary') return 'The Lovers win.';
  return 'The Village wins.';
};

// A countdown as m:ss, never negative.
export const formatRemaining = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};
