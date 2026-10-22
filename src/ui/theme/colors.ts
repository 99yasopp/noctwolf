// Moonlit Table: near-black blue ground, bone text, moon gold for anything
// you can act on, and three team hues that never share a colour. Every text
// pairing below clears 4.5:1 on its own surface.
export const theme = {
  colors: {
    background: '#070B14',
    // The table itself; one step above the window.
    base: '#0C1424',
    surface: '#121D31',
    // One step up from the surface, for tiles and inputs that sit on top.
    raised: '#1A2740',
    // A quiet edge for cards; fields get the brighter one below.
    border: '#26344D',
    fieldBorder: '#4A6185',
    text: '#F6F1E7',
    primary: '#F6C667', // full-moon gold
    primaryDeep: '#D9A63F',
    secondary: '#A8C7FF', // moonlight blue
    danger: '#FF7A6B',
    success: '#71E3B4',
    warn: '#FFB454',
    dim: '#9AA8BE',
    // Tinted panels: the same three hues as the teams, held back.
    tintDanger: '#2B1720',
    tintAlliance: '#221A38',
    tintGood: '#13291F',
    glass: 'rgba(18,29,49,0.72)',
    glassStrong: 'rgba(18,29,49,0.88)',
    scrim: 'rgba(3,6,12,0.66)',
    highlight: 'rgba(255,255,255,0.08)',
    // One colour per side, so a role reads at a glance.
    team: {
      Village: '#71E3B4',
      Wolf: '#FF7A6B',
      Solitary: '#C6A8FF',
    },
  },
  // A short, loud scale: screens open at 28, section titles at 20, roles at
  // 30. Body copy stays at 16 so the contrast between the two is the point.
  type: {
    display: 34,
    title: 28,
    hero: 30,
    section: 20,
    card: 17,
    body: 16,
    small: 14,
    label: 12,
    timer: 20,
  },
  spacing: {
    xsmall: 4,
    small: 8,
    medium: 16,
    large: 24,
    xlarge: 32,
  },
  // Android asks for 48; iOS for 44. Take the larger one wherever a thumb
  // aims, and 44 for the small inline actions that sit inside a row.
  touchTarget: 48,
  inlineTouchTarget: 44,
  borderRadius: 14,
  radius: {
    control: 14,
    card: 20,
    sheet: 28,
    pill: 999,
  },
  shadow: {
    color: '#000000',
    card: { width: 0, height: 8 },
    float: { width: 0, height: 14 },
  },
};

// The colour of a side, for anything that names a role. A custom role may
// bring a side of its own that the theme has never seen.
export const teamColor = (team: string): string =>
  (theme.colors.team as Record<string, string>)[team] ?? theme.colors.dim;
