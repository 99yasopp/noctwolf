// One table, one night: ink-blue ground, bone text, full-moon gold for
// anything you can act on, and three team colours that never share a hue.
// Every text pairing below clears 4.5:1 on its own surface; the gold reads
// with ink text at 10:1, so filled buttons and role cards stay legible.
export const theme = {
  colors: {
    background: '#0F172A',
    surface: '#192134',
    // One step up from the surface, for tiles and inputs that sit on top.
    raised: '#232D44',
    // A quiet edge for cards; fields get the brighter one below.
    border: '#3B4B6B',
    fieldBorder: '#6380A8',
    text: '#F4EFE6',
    primary: '#F2B94B', // full-moon gold
    secondary: '#8FB3FF', // moonlight blue
    danger: '#FF6B6B',
    success: '#6EE7A8',
    warn: '#FF9F43',
    dim: '#A2AEC2',
    // Tinted panels: the same three hues as the teams, held back.
    tintDanger: '#2B1720',
    tintAlliance: '#221A38',
    tintGood: '#13291F',
    // One colour per side, so a role reads at a glance.
    team: {
      Village: '#6EE7A8',
      Wolf: '#FF6B6B',
      Solitary: '#C7A6FF',
    },
  },
  // A short, loud scale: screens open at 28, section titles at 20, roles at
  // 32. Body copy stays at 16 so the contrast between the two is the point.
  type: {
    display: 34,
    title: 28,
    hero: 32,
    section: 20,
    card: 18,
    body: 16,
    small: 14,
    label: 12,
  },
  spacing: {
    small: 8,
    medium: 16,
    large: 24,
  },
  // Android asks for 48; iOS for 44. Take the larger one wherever a thumb
  // aims, and 44 for the small inline actions that sit inside a row.
  touchTarget: 48,
  inlineTouchTarget: 44,
  borderRadius: 12,
};

// The colour of a side, for anything that names a role. A custom role may
// bring a side of its own that the theme has never seen.
export const teamColor = (team: string): string =>
  (theme.colors.team as Record<string, string>)[team] ?? theme.colors.dim;
