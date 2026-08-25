import { describe, expect, it } from 'vitest';
import { calculationEvidenceSchema, ENGINE_VERSION } from '@fgo-lab/schema';
import { calculationEvidenceRegistry, evaluateCalculationEvidence } from './evidence';

describe('calculation evidence registry', () => {
  it('contains only evidence that satisfies the current result schema', () => {
    expect(calculationEvidenceRegistry.size).toBeGreaterThan(0);
    for (const [key, entry] of calculationEvidenceRegistry) {
      expect(entry.key).toBe(key);
      expect(entry.engineVersion).toBe(ENGINE_VERSION);
      expect(calculationEvidenceSchema.safeParse(entry).success).toBe(true);
    }
  });

  it('derives exact precision when every used entry is validated', () => {
    expect(evaluateCalculationEvidence(['kernel:np-damage-v1'])).toMatchObject({
      status: 'resolved',
      precision: 'exact',
      evidence: [{ key: 'kernel:np-damage-v1' }],
    });
  });

  it('derives approximate precision from a used provisional entry', () => {
    expect(
      evaluateCalculationEvidence(['kernel:np-damage-v1', 'np-function:standard']),
    ).toMatchObject({
      status: 'resolved',
      precision: 'approximate',
    });
  });

  it('does not let an unused provisional entry demote the result', () => {
    expect(evaluateCalculationEvidence(['kernel:np-damage-v1'])).toMatchObject({
      status: 'resolved',
      precision: 'exact',
    });
  });

  it('fails closed for unknown evidence keys', () => {
    expect(evaluateCalculationEvidence(['kernel:np-damage-v1', 'unknown:evidence'])).toEqual({
      status: 'unsupported',
      missingEvidence: ['unknown:evidence'],
      evidence: [calculationEvidenceRegistry.get('kernel:np-damage-v1')],
    });
  });

  it('deduplicates evidence while preserving first-use order', () => {
    const result = evaluateCalculationEvidence([
      'np-function:standard',
      'kernel:np-damage-v1',
      'np-function:standard',
    ]);
    expect(result.evidence.map((entry) => entry.key)).toEqual([
      'np-function:standard',
      'kernel:np-damage-v1',
    ]);
  });
});
