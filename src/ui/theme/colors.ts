export const theme = {
  colors: {
    background: '#121212',
    surface: '#1E1E1E',
    // One step up from the surface, for tiles and cards that sit on top.
    raised: '#2A2A2A',
    text: '#E0E0E0',
    primary: '#BB86FC', // Muted Purple
    secondary: '#03DAC6', // Muted Teal
    danger: '#CF6679', // Subtle Red
    success: '#4CAF50',
    warn: '#FFB74D',
    dim: '#9E9E9E',
    // One colour per side, so a role reads at a glance.
    team: {
      Village: '#4CAF50',
      Wolf: '#E53935',
      Solitary: '#9575CD',
    },
  },
  spacing: {
    small: 8,
    medium: 16,
    large: 24,
  },
  borderRadius: 8,
};

// The colour of a side, for anything that names a role. A custom role may
// bring a side of its own that the theme has never seen.
export const teamColor = (team: string): string =>
  (theme.colors.team as Record<string, string>)[team] ?? theme.colors.dim;
