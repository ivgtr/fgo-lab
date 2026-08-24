import { describe, expect, it } from 'vitest';
import { importBackup, MAX_SHARE_FRAGMENT_LENGTH, readShareFragment } from './share';
describe('portable input limits', () => {
  it('rejects oversized backups before schema use', () =>
    expect(() => importBackup('x'.repeat(101), 100)).toThrow('backup_too_large'));
  it('keeps a conservative URL limit', () => expect(MAX_SHARE_FRAGMENT_LENGTH).toBe(8192));
  it('rejects oversized shared fragments before decoding', () =>
    expect(() => readShareFragment(`#share=${'x'.repeat(MAX_SHARE_FRAGMENT_LENGTH)}`)).toThrow(
      'share_too_large',
    ));
});
