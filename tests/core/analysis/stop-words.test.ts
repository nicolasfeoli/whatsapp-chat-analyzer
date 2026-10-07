import { describe, expect, it } from 'vitest';

import { isStopWord } from '../../../src/core/analysis/stop-words';

describe('isStopWord', () => {
  it.each(['the', 'and', 'that', 'with', 'because', 'really', 'yeah', 'okay'])(
    'recognises the English filler word "%s"',
    (word) => {
      expect(isStopWord(word)).toBe(true);
    },
  );

  it.each(['dont', 'didnt', 'thats', 'youre', 'cant', 'isnt'])(
    'recognises "%s", an English contraction typed without its apostrophe',
    (word) => {
      expect(isStopWord(word)).toBe(true);
    },
  );

  it.each(['que', 'pero', 'para', 'porque', 'entonces', 'bueno', 'vale', 'quiero'])(
    'recognises the Spanish filler word "%s"',
    (word) => {
      expect(isStopWord(word)).toBe(true);
    },
  );

  it.each([
    { accented: 'qué', plain: 'que' },
    { accented: 'más', plain: 'mas' },
    { accented: 'también', plain: 'tambien' },
    { accented: 'después', plain: 'despues' },
    { accented: 'aquí', plain: 'aqui' },
    { accented: 'sólo', plain: 'solo' },
  ])('recognises "$accented" with and without its accent', ({ accented, plain }) => {
    expect(isStopWord(accented)).toBe(true);
    expect(isStopWord(plain)).toBe(true);
  });

  it.each(['pizza', 'playa', 'weekend', 'fútbol', 'birthday'])(
    'does not take the meaningful word "%s" for filler',
    (word) => {
      expect(isStopWord(word)).toBe(false);
    },
  );

  it('expects a lower-case word and does not recognise other letter cases', () => {
    expect(isStopWord('The')).toBe(false);
  });

  it('does not recognise the empty string', () => {
    expect(isStopWord('')).toBe(false);
  });
});
