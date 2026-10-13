import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { portableSha256 } from './portableHash';

describe('portable canonical identifier hash', () => {
  it('matches SHA-256 vectors across UTF-8 and block boundaries', () => {
    for (const value of ['', 'abc', '形態／宝具', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(1000)])
      expect(portableSha256(value)).toBe(createHash('sha256').update(value).digest('hex'));
  });
});
