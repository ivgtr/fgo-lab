import { defaultTargetClassRelation } from '@fgo-lab/calc-core';
import { naturalServantLevel, type MasterDataSnapshot } from '@fgo-lab/master-data';
import type { PortableCalculationRequest } from '@fgo-lab/schema';
import { STANDARD_RANKING_SCENARIO_POLICY as fixed } from './rankingContracts';
import { hasCanonicalRankingSkillSlots } from './rankingBasis';

export function validatePinnedRankingBasis(
  request: PortableCalculationRequest,
  master: MasterDataSnapshot,
): boolean {
  if (request.executionIntent.kind !== 'ranking' || request.scenario.mode !== 'resolved')
    return true;
  const { basis, policy } = request.executionIntent;
  const { attacker, craftEssence, mysticCode, support, initialOvercharge, explicitOverrides } =
    request.scenario;
  const servants = master.servants.filter(({ id }) => id === basis.servantId);
  if (servants.length !== 1) return false;
  return (
    hasCanonicalRankingSkillSlots(servants[0]!, basis.skillLevels) &&
    (policy.levelBasis !== 'naturalLimit' ||
      basis.level === naturalServantLevel(servants[0]!.rarity)) &&
    attacker.source === 'master' &&
    attacker.fouAtk === basis.fouAtk &&
    (basis.growthBasis !== 'common' || attacker.fouAtk === fixed.fouAtk) &&
    initialOvercharge === request.executionIntent.basis.initialOvercharge &&
    craftEssence === fixed.craftEssence &&
    mysticCode === fixed.mysticCode &&
    support === fixed.support &&
    Object.keys(explicitOverrides).length === 0 &&
    (policy.conditionalEffects === 'satisfied' ||
      (request.scenario.attackerHpPermille === fixed.attackerHpPermille &&
        request.scenario.battleState.battlePointPhase === fixed.battlePointPhase)) &&
    (request.scenario.targetContext.attribute.kind === 'concrete' ||
      request.scenario.targetContext.attribute.relation === fixed.attributeRelation) &&
    (request.scenario.targetContext.class.kind === 'concrete' ||
      request.scenario.targetContext.class.relation ===
        (policy.classAffinity === 'favorable'
          ? defaultTargetClassRelation(servants[0]!.classId, master.combatRules)
          : 'neutral')) &&
    request.scenario.preNoblePhantasmPlan.every(
      (command) =>
        command.kind !== 'useSkillSlot' ||
        (command.skillLevel === basis.skillLevels[String(command.slot) as '1' | '2' | '3'] &&
          (basis.growthBasis !== 'common' || command.skillLevel === fixed.skillLevel)),
    )
  );
}
