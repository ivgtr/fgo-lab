import type { BattleOperation } from '@fgo-lab/battle-execution';
import { describe, expect, it } from 'vitest';
import {
  compileDamageContributionProjection,
  type DamageContributionPolicy,
} from './contributionProjection';

function operation(
  operationId: string,
  origin: BattleOperation['source']['origin'],
  contributionScope: BattleOperation['contributionScope'],
  gameActivation: BattleOperation['gameActivation'],
): BattleOperation {
  return {
    operationId,
    order: 1,
    phase: 'attackerSkill',
    source: {
      origin,
      sourceInstanceId: `${origin}:source`,
      sourceId: `${origin}:1`,
      skillId: 'skill:1',
      effectId: 'effect:1',
      effectOccurrenceId: `${operationId}:0`,
    },
    contributionScope,
    condition: { kind: 'always' },
    decisionKey: null,
    decisionPlan: { activation: 'automatic', condition: 'evaluate' },
    sourceEnabled: true,
    enabledByDefault: true,
    gameActivation,
    proc: { kind: 'guaranteed' },
    stochasticOutcome: null,
    procRatePermille: 1_000,
    activation: { kind: 'sourceDefault' },
    evidence: { rawPath: 'fixture', functionId: operationId },
    presentation: { label: operationId, sourceName: origin, skillName: 'skill' },
    inputDefinitions: [],
    kind: 'addModifier',
    modifier: 'attackBuff',
    valuePermille: 100,
    valueExpression: null,
    card: null,
  };
}

const operations = [
  operation('self-skill', 'attacker', 'personal', 'skillUse'),
  operation('area-passive', 'passive', 'partyWide', 'constant'),
  operation('np-enemy', 'np', 'enemyApplied', 'npBeforeDamage'),
  operation('external-support', 'support', 'external', 'skillUse'),
];

describe('canonical damage contribution compiler', () => {
  for (const selfSkill of ['included', 'excluded'] as const)
    for (const area of ['included', 'excluded'] as const) {
      const policy: DamageContributionPolicy = { selfSkill, area };
      it(`compiles self ${selfSkill} and area ${area}`, () => {
        const projection = compileDamageContributionProjection(operations, policy);
        expect([...projection.includedOperationIds].sort()).toEqual(
          [
            ...(selfSkill === 'included' ? ['self-skill'] : []),
            ...(area === 'included' ? ['area-passive'] : []),
            'np-enemy',
          ].sort(),
        );
        expect([...projection.excludedOperationIds].sort()).toEqual(
          [
            ...(selfSkill === 'excluded' ? ['self-skill'] : []),
            ...(area === 'excluded' ? ['area-passive'] : []),
          ].sort(),
        );
      });
    }
});
