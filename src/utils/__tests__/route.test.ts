import { describe, it, expect } from 'vitest';
import { isBadanieHash } from '../route';

describe('isBadanieHash', () => {
  it.each(['#badanie', '#/badanie', '#badanie/', '#/badanie/'])(
    'accepts %s',
    (hash) => {
      expect(isBadanieHash(hash)).toBe(true);
    }
  );

  it.each(['', '#', '#badanie2', '#Badanie', '#/Badanie', '#badania', '#badanie-x', 'badanie'])(
    'rejects %s',
    (hash) => {
      expect(isBadanieHash(hash)).toBe(false);
    }
  );
});
