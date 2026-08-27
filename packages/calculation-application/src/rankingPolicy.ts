import { defaultTargetClassRelation } from '@fgo-lab/calc-core';
import {
  naturalServantLevel,
  type MasterDataSnapshot,
  type ServantMaster,
} from '@fgo-lab/master-data';
import type { CalculationScenario, ServantBuild } from '@fgo-lab/schema';
import { applyCanonicalInputCommand } from './canonicalInputs';
import type { RankingConditions, RankingProfileInput } from './rankingContracts';
import { STANDARD_RANKING_SCENARIO_POLICY } from './rankingContracts';
import { createDefaultResolvedScenario, type CalculationExecution } from './scenario';
import { applyTargetContextCommand, createDefaultTargetContext } from './targetContext';

export type ResolvedScenario = Extract<CalculationScenario, { mode: 'resolved' }>;

function ownedBuild(
  servant: ServantMaster,
  profile: RankingProfileInput,
  conditions: RankingConditions,
): ServantBuild | undefined {
  const build = profile.servantBuilds[servant.id];
  if (conditions.comparisonMode === 'owned' && (!build || build.npLevel === 0))
    throw new TypeError(`ranking_owned_build_missing:${servant.id}`);
  return build;
}

export function createRankingBaseScenario(
  servant: ServantMaster,
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingConditions,
): ResolvedScenario {
  const build = ownedBuild(servant, profile, conditions);
  const owned = conditions.comparisonMode === 'owned';
  const scenario = createDefaultResolvedScenario(master, owned ? build : undefined, servant);
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
    ...scenario,
    attacker: {
      servantId: servant.id,
      source: owned ? 'owned' : 'master',
      level: owned ? build!.level : naturalServantLevel(servant.rarity),
      npLevel: owned ? build!.npLevel : conditions.npLevel,
      fouAtk: owned ? build!.fouAtk : STANDARD_RANKING_SCENARIO_POLICY.fouAtk,
    },
    overcharge: STANDARD_RANKING_SCENARIO_POLICY.overcharge,
    targetContext,
    attackerHpPermille: STANDARD_RANKING_SCENARIO_POLICY.attackerHpPermille,
    battleState: { battlePointPhase: STANDARD_RANKING_SCENARIO_POLICY.battlePointPhase },
    craftEssence: null,
    attackerSkills: servant.skills.slice(0, 3).map((skill, index) => ({
      skillId: skill.id,
      skillLevel: owned
        ? (build!.skills[String(index + 1)] ?? 1)
        : STANDARD_RANKING_SCENARIO_POLICY.skillLevel,
    })),
    mysticCode: null,
    support: null,
    worldFactAssertions: [],
    canonicalInputValues: {},
  };
}

export function applyRankingCanonicalMinimums(
  scenario: ResolvedScenario,
  calculation: CalculationExecution,
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
