import { defaultTargetClassRelation } from '@fgo-lab/calc-core';
import {
  getDefaultInitialActorForm,
  type ActorFormId,
  type MasterDataSnapshot,
  type ServantMaster,
} from '@fgo-lab/master-data';
import type { CalculationScenario } from '@fgo-lab/schema';
import { applyCanonicalInputCommand } from './canonicalInputs';
import type { RankingPolicyConditions, ResolvedRankingBasis } from './rankingContracts';
import { STANDARD_RANKING_SCENARIO_POLICY } from './rankingContracts';
import { applyTargetContextCommand, createDefaultTargetContext } from './targetContext';

export type ResolvedScenario = Extract<CalculationScenario, { mode: 'resolved' }>;
export function createRankingBaseScenario(
  servant: ServantMaster,
  master: MasterDataSnapshot,
  basis: ResolvedRankingBasis,
  conditions: Pick<RankingPolicyConditions, 'classAffinity'>,
  initialActorFormId: ActorFormId = getDefaultInitialActorForm(servant)!.id,
): ResolvedScenario {
  let targetContext = createDefaultTargetContext(servant.classId);
  targetContext = applyTargetContextCommand(targetContext, {
    kind: 'setClassRelation',
    relation:
      conditions.classAffinity === 'favorable'
        ? defaultTargetClassRelation(servant.classId)
        : 'neutral',
  });
  targetContext = applyTargetContextCommand(targetContext, {
    kind: 'setAttributeRelation',
    relation: STANDARD_RANKING_SCENARIO_POLICY.attributeRelation,
  });
  return {
    mode: 'resolved',
    attacker: {
      servantId: servant.id,
      initialActorFormId,
      source: 'master',
      level: basis.level,
      npLevel: basis.npLevel,
      fouAtk: STANDARD_RANKING_SCENARIO_POLICY.fouAtk,
    },
    overcharge: STANDARD_RANKING_SCENARIO_POLICY.overcharge,
    targetContext,
    attackerHpPermille: STANDARD_RANKING_SCENARIO_POLICY.attackerHpPermille,
    battleState: { battlePointPhase: STANDARD_RANKING_SCENARIO_POLICY.battlePointPhase },
    craftEssence: null,
    preNoblePhantasmPlan: [{ kind: 'executeAttackNoblePhantasm' }],
    mysticCode: null,
    support: null,
    worldFactAssertions: [],
    canonicalInputValues: {},
    effectDecisions: [],
    activationFacts: [],
    explicitOverrides: {},
  };
}

export function applyRankingCanonicalMinimums(
  scenario: ResolvedScenario,
  calculation: {
    inputDefinitions: readonly { key: string; kind: string; minimum: number; maximum: number }[];
  },
): ResolvedScenario {
  return calculation.inputDefinitions.reduce(
    (current, definition) =>
      applyCanonicalInputCommand(current, {
        kind: 'setCanonicalIntegerInput',
        key: definition.key,
        value: definition.kind === 'procSuccessCount' ? definition.maximum : definition.minimum,
      }),
    scenario,
  );
}
