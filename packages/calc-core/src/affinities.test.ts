import { describe, expect, it } from 'vitest';
import { attributeRelationFromMultiplier, classRelationFromMultiplier } from './affinities';

describe('canonical affinity relations', () => {
  it.each([
    [2, 'advantage2'],
    [1.5, 'advantage15'],
    [1, 'neutral'],
    [0.5, 'disadvantage'],
  ] as const)('maps class multiplier %s without a fallback', (multiplier, relation) => {
    expect(classRelationFromMultiplier(multiplier)).toBe(relation);
  });

  it.each([
    [1.1, 'advantage'],
    [1, 'neutral'],
    [0.9, 'disadvantage'],
  ] as const)('maps attribute multiplier %s without a fallback', (multiplier, relation) => {
    expect(attributeRelationFromMultiplier(multiplier)).toBe(relation);
  });

  it('rejects unsupported multipliers instead of coercing them to disadvantage', () => {
    expect(() => classRelationFromMultiplier(1.25)).toThrow('invalid_class_affinity:1.25');
    expect(() => attributeRelationFromMultiplier(0)).toThrow('invalid_attribute_affinity:0');
  });
});
