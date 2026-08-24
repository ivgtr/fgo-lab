import { describe, expect, it } from 'vitest';
import { traitLabel } from './traitPresentation';

describe('trait presentation', () => {
  it('uses maintained labels and a stable fallback', () => {
    expect(traitLabel('dragon')).toBe('竜');
    expect(traitLabel('classSaber')).toBe('セイバー');
    expect(traitLabel('trait:unregistered')).toBe('未登録条件');
  });
});
