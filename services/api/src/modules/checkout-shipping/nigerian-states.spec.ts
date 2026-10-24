import { matchState, normalizeState, stateNameFor } from './nigerian-states';

describe('Nigerian state matching', () => {
  describe('normalizeState', () => {
    it('trims, lower-cases and collapses whitespace', () => {
      expect(normalizeState('  Lagos  ')).toBe('lagos');
      expect(normalizeState('LAGOS')).toBe('lagos');
      expect(normalizeState('Cross    River')).toBe('cross river');
    });

    it('treats underscores and slashes as spaces', () => {
      expect(normalizeState('AKWA_IBOM')).toBe('akwa ibom');
      expect(normalizeState('cross/river')).toBe('cross river');
    });

    it('keeps a hyphen as a hyphen', () => {
      expect(normalizeState('FCT - Abuja')).toBe('fct-abuja');
    });

    it('is empty for nothing', () => {
      expect(normalizeState('')).toBe('');
      expect(normalizeState('   ')).toBe('');
    });
  });

  describe('matchState', () => {
    it('matches every state by its own name', () => {
      for (const name of [
        'Lagos', 'Ogun', 'Kano', 'Rivers', 'Zamfara', 'Abuja', 'Imo', 'Benue', 'Kwara',
      ]) {
        expect(matchState(name)).not.toBeNull();
      }
    });

    it('matches regardless of case and surrounding space', () => {
      expect(matchState('  lAgOs ')).toBe('lag');
      expect(matchState('OGUN')).toBe('ogi');
    });

    it('accepts the common FCT spellings', () => {
      expect(matchState('FCT')).toBe('abja');
      expect(matchState('fct')).toBe('abja');
      expect(matchState('Federal Capital Territory')).toBe('abja');
      expect(matchState('Abuja FCT')).toBe('abja');
    });

    it('accepts punctuated state names', () => {
      expect(matchState('Akwa-Ibom')).toBe('aky');
      expect(matchState('Akwa Ibom')).toBe('aky');
      expect(matchState('Cross River')).toBe('bra');
    });

    it('accepts a qualified FCT string', () => {
      expect(matchState('FCT, Abuja')).toBe('abja');
      // The exact label the storefront state dropdown uses.
      expect(matchState('FCT: Abuja')).toBe('abja');
      expect(matchState('fct:abuja')).toBe('abja');
      expect(matchState('Abuja : FCT')).toBe('abja');
    });

    it('returns null rather than guessing', () => {
      expect(matchState('Accra')).toBeNull();
      expect(matchState('L')).toBeNull();
      expect(matchState('')).toBeNull();
      expect(matchState('   ')).toBeNull();
      expect(matchState(null)).toBeNull();
      expect(matchState(undefined)).toBeNull();
    });

    it('does not treat a city or street as a state', () => {
      expect(matchState('Victoria Island')).toBeNull();
      expect(matchState('Ikeja')).toBeNull();
      expect(matchState('14 Awolowo Road')).toBeNull();
    });

    it('is not fooled by a name that merely contains a state name', () => {
      expect(matchState('Lagos and Abuja')).toBeNull();
      expect(matchState('New Lagos')).toBeNull();
    });
  });

  describe('stateNameFor', () => {
    it('returns the display name for a known key', () => {
      expect(stateNameFor('lag')).toBe('Lagos');
      expect(stateNameFor('abja')).toBe('Abuja');
    });

    it('returns null for an unknown key', () => {
      expect(stateNameFor('nope')).toBeNull();
    });
  });
});