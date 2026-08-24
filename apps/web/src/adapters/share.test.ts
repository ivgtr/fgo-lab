import { describe, expect, it } from 'vitest';
import { importBackup, MAX_SHARE_FRAGMENT_LENGTH } from './share';
describe('portable input limits', () => {
  it('rejects oversized backups before schema use', () =>
    expect(() => importBackup('x'.repeat(101), 100)).toThrow('backup_too_large'));
  it('keeps a conservative URL limit', () => expect(MAX_SHARE_FRAGMENT_LENGTH).toBe(8192));
});
