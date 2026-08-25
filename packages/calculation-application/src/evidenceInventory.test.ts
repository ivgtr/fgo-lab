import { describe, expect, it } from 'vitest';
import effectSources from '../../test-fixtures/golden/effect-sources-v1.json';
import externalDifferentials from '../../test-fixtures/golden/external-differentials-v1.json';
import masterNormalization from '../../test-fixtures/golden/master-normalization-v1.json';
import npDamage from '../../test-fixtures/golden/np-damage-v1.json';
import npFunctions from '../../test-fixtures/golden/np-functions-v1.json';
import { calculationEvidenceRegistry } from './evidence';

const expectedKeys = new Set([
  'kernel:np-damage-v1',
  'master:normalized-v6',
  ...[
    'standard',
    'defensePiercing',
    'trait',
    'traitCount',
    'stateTrait',
    'hpRatioLow',
    'battlePointPhase',
    'targetRarity',
    'traitExpression',
  ].map((kind) => `np-function:${kind}`),
  ...[
    'attackBuff',
    'cardBuff',
    'npDamageBuff',
    'eventDamageBuff',
    'specialDamageBuff',
    'powerMod',
    'flatDamage',
    'ignoreDefense',
    'ignoreDamageCut',
    'npDamageBuffRate',
  ].map((kind) => `effect-operation:${kind}`),
  'input:manual-final-modifiers',
]);
const goldenCaseIds = new Set([
  npDamage.caseId,
  effectSources.caseId,
  masterNormalization.caseId,
  ...npFunctions.cases.map((testCase) => testCase.caseId),
]);
const differentialCaseIds = new Set(externalDifferentials.cases.map((testCase) => testCase.caseId));

describe('calculation evidence inventory gate', () => {
  it('contains exactly the required evidence subjects', () => {
    expect(new Set(calculationEvidenceRegistry.keys())).toEqual(expectedKeys);
  });

  it('resolves every referenced golden and differential case ID', () => {
    for (const entry of calculationEvidenceRegistry.values()) {
      expect(entry.goldenCaseIds.every((caseId) => goldenCaseIds.has(caseId))).toBe(true);
      expect(entry.differentialCaseIds.every((caseId) => differentialCaseIds.has(caseId))).toBe(
        true,
      );
    }
  });

  it('requires every validated subject to have sources and test evidence', () => {
    for (const entry of calculationEvidenceRegistry.values()) {
      if (entry.status !== 'validated') continue;
      expect(entry.sources.length, entry.key).toBeGreaterThan(0);
      expect(
        entry.goldenCaseIds.length + entry.differentialCaseIds.length,
        entry.key,
      ).toBeGreaterThan(0);
    }
  });
});
