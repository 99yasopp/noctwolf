import { Catalog, Key, en } from './en';

export type { Catalog, Key } from './en';

// One line a screen keeps and reads again later: the key plus what fills it.
export interface SaidLine {
  key: Key;
  params?: Params;
}

// The game is read in one language per device: every phone picks its own, and
// the engine sends keys rather than sentences, so a French phone at an English
// table reads French.
export type Language = 'en' | 'fr' | 'ar';

// Each language is named in its own words: nobody should have to read English
// to find his own.
export const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'fr', label: 'Français' },
  { id: 'ar', label: 'العربية' },
];

// A value parked inside a line: a name, a count, or a role, which each reader
// sees in his own language. The name travels as the fallback, so a role the
// host invented still shows.
export interface RoleRef {
  role: string;
  name: string;
}

export type ParamValue = string | number | RoleRef;
export type Params = Record<string, ParamValue>;

export const roleRef = (role: { id: string; name: string } | undefined): RoleRef => ({
  role: role?.id ?? '',
  name: role?.name ?? '',
});

// The catalog of each language, filled key by key over the English: a line
// that has not been written yet falls back to English rather than breaking.
const catalogs: Record<Language, Partial<Catalog>> = {
  en,
  fr: {},
  ar: {},
};

// Arabic reads right to left, and so does anything laid out around it.
export const isRtl = (language: Language): boolean => language === 'ar';

// The language the code outside React reads: the engine's own journal, and any
// reader that is not a component. The UI keeps it in step with its provider.
let current: Language = 'en';

export const getLanguage = (): Language => current;
export const setLanguage = (language: Language): void => {
  current = language;
};

export const translate = (
  language: Language,
  key: string,
  params?: Params,
  fallback?: string,
): string => {
  const text =
    catalogs[language][key as Key] ?? en[key as Key] ?? fallback ?? key;
  if (!params) return text;

  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    if (value === undefined) return whole;

    const plain = typeof value === 'object' ? roleNameFor(language, value) : String(value);
    // A name or a number keeps its own direction inside an Arabic line, so it
    // is fenced off with the invisible isolate marks around it.
    return isRtl(language) ? `\u2068${plain}\u2069` : plain;
  });
};

// A role's own name, and the label of one of its night actions: the catalog
// has a word for every role this app ships, and a role the host invented
// brings its own.
export const roleNameFor = (language: Language, ref: RoleRef): string =>
  translate(language, `role.${ref.role}.name`, undefined, ref.name);

export const roleName = (
  id: string,
  fallback: string,
  language: Language = current,
): string => translate(language, `role.${id}.name`, undefined, fallback);

export const roleDescription = (
  id: string,
  fallback: string,
  language: Language = current,
): string => translate(language, `role.${id}.description`, undefined, fallback);

// The side a role plays for, and the same word in a sentence ("Wolf team").
// A side nobody ships — a custom role's own — keeps the word it came with.
export const teamName = (team: string, language: Language = current): string =>
  translate(language, `team.${team}`, undefined, team);

export const teamOf = (team: string, language: Language = current): string =>
  translate(language, `teamOf.${team}`, undefined, team);

// The tips a role shows on the rules page: one line each, in the reader's own
// language. A role the host invented has none.
export const roleTips = (
  id: string,
  fallback: string[],
  language: Language = current,
): string[] =>
  (fallback.length === 0
    ? []
    : translate(language, `role.${id}.tips`, undefined, fallback.join('\n')).split('\n')
  ).filter(line => line.trim().length > 0);

export const actionLabel = (
  roleId: string,
  optionId: string,
  fallback: string,
  language: Language = current,
): string => translate(language, `action.${roleId}.${optionId}`, undefined, fallback);

// One line, in the language the device is reading right now.
export const say = (key: string, params?: Params, fallback?: string): string =>
  translate(current, key, params, fallback);

// A translator that keeps a reader's own language, for components that must
// re-render when the language changes.
export interface Translate {
  (key: Key, params?: Params): string;
  (key: string, params: Params | undefined, fallback: string): string;
}

export const translator = (language: Language): Translate =>
  ((key: string, params?: Params, fallback?: string) =>
    translate(language, key, params, fallback)) as Translate;

// Every key a catalog holds: what the other languages have to fill.
export const catalogKeys = (language: Language = current): string[] =>
  Object.keys(catalogs[language]);
