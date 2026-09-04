import type { BattleOperation } from '@fgo-lab/battle-execution';
import { contributionIsIncluded } from '@fgo-lab/battle-execution';
import { describe, expect, it } from 'vitest';
import {
  compileRankingContributionPolicy,
  isAreaDamageContribution,
  isAttackerDamageContribution,
} from './contributionPolicy';

function operation(
  origin: BattleOperation['source']['origin'],
  contributionScope: BattleOperation['contributionScope'],
  condition: BattleOperation['condition'] = { kind: 'always' },
): BattleOperation {
  return {
    operationId: `${origin}:${contributionScope}`,
    order: 1,
    phase: 'attackerSkill',
    source: {
      origin,
      sourceInstanceId: `${origin}:source`,
      sourceId: `${origin}:1`,
      skillId: 'skill:1',
      effectId: 'effect:1',
      effectOccurrenceId: 'effect:1:0',
    },
    contributionScope,
    condition,
    decisionKey: null,
    decisionPlan: { activation: 'automatic', condition: 'evaluate' },
    sourceEnabled: true,
    enabledByDefault: true,
    gameActivation: origin === 'attacker' ? 'skillUse' : 'constant',
    proc: { kind: 'guaranteed' },
    stochasticOutcome: null,
    procRatePermille: 1_000,
    activation: { kind: 'sourceDefault' },
    evidence: { rawPath: 'fixture', functionId: 'fixture' },
    presentation: { label: 'fixture', sourceName: origin, skillName: 'skill' },
    inputDefinitions: [],
    kind: 'addModifier',
    modifier: 'attackBuff',
    valuePermille: 100,
    valueExpression: null,
    card: null,
  };
}

describe('canonical contribution application policy', () => {
  it('keeps self, condition, and area decisions independent', () => {
    const policy = compileRankingContributionPolicy(
      { selfBuffs: 'excluded', conditionalEffects: 'baseline' },
      'excluded',
    );
    expect(
      contributionIsIncluded(operation('attacker', 'personal'), { kind: 'always' }, policy),
    ).toBe(false);
    const targetCondition = {
      kind: 'trait',
      scope: 'target',
      trait: 'dragon',
      present: true,
    } as const;
    expect(
      contributionIsIncluded(operation('np', 'personal', targetCondition), targetCondition, policy),
    ).toBe(false);
    expect(
      contributionIsIncluded(operation('passive', 'partyWide'), { kind: 'always' }, policy),
    ).toBe(false);
    expect(contributionIsIncluded(operation('np', 'personal'), { kind: 'always' }, policy)).toBe(
      true,
    );
    expect(isAttackerDamageContribution(operation('passive', 'personal'))).toBe(true);
    expect(isAttackerDamageContribution(operation('passive', 'partyWide'))).toBe(true);
    expect(isAreaDamageContribution(operation('passive', 'partyWide'))).toBe(true);
    expect(isAttackerDamageContribution(operation('passive', 'partyOther'))).toBe(false);
    expect(isAreaDamageContribution(operation('passive', 'partyOther'))).toBe(false);
  });
});
