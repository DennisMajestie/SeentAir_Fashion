/**
 * Nigerian states, and matching a shopper's free-text state to one of them.
 *
 * The storefront asks for a state from a dropdown, but the field has always
 * accepted anything typed or pasted, so the server cannot assume it receives
 * clean input. Matching here is deliberately tolerant - trimming, collapsing
 * spaces, case and the common abbreviations - because rejecting "fct" as a
 * typo would lose a real order.
 *
 * What it will NOT do is guess. An address the matcher does not recognise
 * returns null, and the caller must treat that as "ask again" or "quote
 * later", never as "use the nearest looking state". Every state carries a
 * stable key, and that key is what gets stored against a zone, so a zone
 * mapping cannot break because someone renamed "FCT - Abuja" to "Abuja".
 */

export interface NigerianState {
  /** Stable identifier used in the database; never shown to a shopper. */
  key: string;
  /** The name the storefront dropdown shows. */
  name: string;
  /** Other spellings, abbreviations and legacy names that mean the same place. */
  aliases: readonly string[];
}

export const NIGERIAN_STATES: readonly NigerianState[] = [
  {
    key: 'abja',
    name: 'Abuja',
    aliases: ['fct', 'fct - abuja', 'federal capital territory', 'fct abuja', 'abuja fct'],
  },
  { key: 'lag', name: 'Lagos', aliases: ['lagos state'] },
  { key: 'abv', name: 'Abia', aliases: [] },
  { key: 'adm', name: 'Adamawa', aliases: [] },
  { key: 'aky', name: 'Akwa Ibom', aliases: ['akwa-ibom', 'akwaibom'] },
  { key: 'ana', name: 'Anambra', aliases: [] },
  { key: 'bau', name: 'Bauchi', aliases: [] },
  { key: 'bay', name: 'Bayelsa', aliases: ['bayelsa state'] },
  { key: 'ben', name: 'Benue', aliases: [] },
  { key: 'boc', name: 'Borno', aliases: [] },
  { key: 'bra', name: 'Cross River', aliases: ['crossriver'] },
  { key: 'del', name: 'Delta', aliases: [] },
  { key: 'ebo', name: 'Ebonyi', aliases: ['ebonyi state'] },
  { key: 'eby', name: 'Edo', aliases: [] },
  { key: 'ekk', name: 'Ekiti', aliases: [] },
  { key: 'enugu', name: 'Enugu', aliases: [] },
  { key: 'gom', name: 'Gombe', aliases: [] },
  { key: 'imi', name: 'Imo', aliases: [] },
  { key: 'jig', name: 'Jigawa', aliases: [] },
  { key: 'kad', name: 'Kaduna', aliases: [] },
  { key: 'kan', name: 'Kano', aliases: [] },
  { key: 'kat', name: 'Katsina', aliases: [] },
  { key: 'keb', name: 'Kebbi', aliases: [] },
  { key: 'kogi', name: 'Kogi', aliases: [] },
  { key: 'kwara', name: 'Kwara', aliases: ['kwara state'] },
  { key: 'nas', name: 'Nasarawa', aliases: [] },
  { key: 'ngr', name: 'Niger', aliases: [] },
  { key: 'ogi', name: 'Ogun', aliases: [] },
  { key: 'ond', name: 'Ondo', aliases: [] },
  { key: 'osn', name: 'Osun', aliases: [] },
  { key: 'oyo', name: 'Oyo', aliases: [] },
  { key: 'pla', name: 'Plateau', aliases: [] },
  { key: 'rivers', name: 'Rivers', aliases: [] },
  { key: 'sok', name: 'Sokoto', aliases: [] },
  { key: 'tar', name: 'Taraba', aliases: [] },
  { key: 'yob', name: 'Yobe', aliases: [] },
  { key: 'zam', name: 'Zamfara', aliases: [] },
];

/**
 * Lower-cases, trims and collapses internal whitespace and separators so that
 * "  Lagos ", "LAGOS" and "lagos " all reduce to the same comparison key.
 */
export function normalizeState(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s_/]+/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .trim();
}

/**
 * The state key for free-text input, or null when it is not a state we serve.
 * Null means "do not guess" - the caller must surface it rather than picking
 * the closest name.
 */
export function matchState(input: string | null | undefined): string | null {
  const normalized = normalizeState(input ?? '');
  if (!normalized) return null;

  for (const state of NIGERIAN_STATES) {
    if (normalizeState(state.name) === normalized) return state.key;
    for (const alias of state.aliases) {
      if (normalizeState(alias) === normalized) return state.key;
    }
  }

  // "FCT, Abuja" and "Abuja - FCT" both normalise to something with a comma
  // or a trailing qualifier; fall back to a token match only when every token
  // is a recognised word for that one state. A partial city or street name can
  // never match, because it must match a state name or a known alias.
  for (const state of NIGERIAN_STATES) {
    const words = [state.name, ...state.aliases].map(normalizeState);
    const tokens = normalized.split(/[,\-()]+/);
    if (tokens.length > 1 && tokens.every((t) => words.some((w) => w.includes(t) || t.includes(w)))) {
      return state.key;
    }
  }

  return null;
}

/**
 * Whether a string is a canonical state KEY. Distinct from matchState(), which
 * takes free text from a shopper and returns a key - running it on a key would
 * look for a state literally called 'lag' and find nothing.
 */
export function isKnownStateKey(key: string | null | undefined): boolean {
  return NIGERIAN_STATES.some((s) => s.key === key);
}

/** The display name for a key, or null if the key is unknown. */
export function stateNameFor(key: string): string | null {
  return NIGERIAN_STATES.find((s) => s.key === key)?.name ?? null;
}