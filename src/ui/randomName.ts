// Two devices left on the same default name are indistinguishable in the
// roster and in the host's dashboard, so every install starts with a random
// one. "Wolf" is deliberately not in the list: it reads as the role.
const ANIMALS = [
  'Fox',
  'Owl',
  'Raven',
  'Bear',
  'Lynx',
  'Crane',
  'Boar',
  'Stag',
  'Hare',
  'Crow',
  'Moth',
  'Deer',
];

export const randomPlayerName = (): string =>
  `${ANIMALS[Math.floor(Math.random() * ANIMALS.length)]} ${
    1000 + Math.floor(Math.random() * 9000)
  }`;
