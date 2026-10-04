import type { BattleOperation, ConditionRead } from '@fgo-lab/battle-execution';
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
    sourceActivation: { kind: 'unread' as const },
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

const clock: ConditionRead['clock'] = {
  phase: 'operation',
  actorFormId: { actorId: 'policy-fixture', limitCount: 0 },
  actor: 'attacker',
  actionId: null,
  operationId: 'policy-fixture',
  sourceInstanceId: 'policy-fixture',
  occurrenceId: 'policy-fixture',
  valueSetIndex: 0,
  valueIndex: 0,
};
const guaranteedRead: ConditionRead = {
  kind: 'known',
  truth: true,
  certainty: 'guaranteed',
  clock,
  evidence: [],
  support: [{ kind: 'canonicalIntrinsic', clock }],
};
const externalRead: ConditionRead = {
  kind: 'known',
  truth: true,
  certainty: 'possible',
  clock,
  evidence: [],
  support: [{ kind: 'externalAssumption', clock }],
};

describe('canonical contribution application policy', () => {
  it('keeps self, condition, and area decisions independent', () => {
    const policy = compileRankingContributionPolicy(
      { selfBuffs: 'excluded', conditionalEffects: 'baseline' },
      'excluded',
    );
    expect(contributionIsIncluded(operation('attacker', 'personal'), guaranteedRead, policy)).toBe(
      false,
    );
    const targetCondition = {
      kind: 'trait',
      scope: 'target',
      trait: 'dragon',
      present: true,
    } as const;
    expect(
      contributionIsIncluded(operation('np', 'personal', targetCondition), externalRead, policy),
    ).toBe(false);
    expect(contributionIsIncluded(operation('passive', 'partyWide'), guaranteedRead, policy)).toBe(
      false,
    );
    expect(contributionIsIncluded(operation('np', 'personal'), guaranteedRead, policy)).toBe(true);
    expect(isAttackerDamageContribution(operation('passive', 'personal'))).toBe(true);
    expect(isAttackerDamageContribution(operation('passive', 'partyWide'))).toBe(true);
    expect(isAreaDamageContribution(operation('passive', 'partyWide'))).toBe(true);
    expect(isAttackerDamageContribution(operation('passive', 'partyOther'))).toBe(false);
    expect(isAreaDamageContribution(operation('passive', 'partyOther'))).toBe(false);
  });
});
