import { defaultTargetClassRelation } from '@fgo-lab/calc-core';
import { naturalServantLevel, type MasterDataSnapshot } from '@fgo-lab/master-data';
import type { PortableCalculationRequest } from '@fgo-lab/schema';
import { STANDARD_RANKING_SCENARIO_POLICY as fixed } from './rankingContracts';

export function validatePinnedRankingBasis(
  request: PortableCalculationRequest,
  master: MasterDataSnapshot,
): boolean {
  if (request.executionIntent.kind !== 'ranking' || request.scenario.mode !== 'resolved')
    return true;
  const { basis, policy } = request.executionIntent;
  const { attacker, craftEssence, mysticCode, support, overcharge, explicitOverrides } =
    request.scenario;
  const servants = master.servants.filter(({ id }) => id === basis.servantId);
  if (servants.length !== 1) return false;
  return (
    (policy.levelBasis !== 'naturalLimit' ||
      basis.level === naturalServantLevel(servants[0]!.rarity)) &&
    attacker.source === 'master' &&
    attacker.fouAtk === fixed.fouAtk &&
    overcharge === fixed.overcharge &&
    craftEssence === fixed.craftEssence &&
    mysticCode === fixed.mysticCode &&
    support === fixed.support &&
    Object.keys(explicitOverrides).length === 0 &&
    request.scenario.attackerHpPermille === fixed.attackerHpPermille &&
    request.scenario.battleState.battlePointPhase === fixed.battlePointPhase &&
    (request.scenario.targetContext.attribute.kind === 'concrete' ||
      request.scenario.targetContext.attribute.relation === fixed.attributeRelation) &&
    (request.scenario.targetContext.class.kind === 'concrete' ||
      request.scenario.targetContext.class.relation ===
        (policy.classAffinity === 'favorable'
          ? defaultTargetClassRelation(servants[0]!.classId)
          : 'neutral')) &&
    request.scenario.preNoblePhantasmPlan.every(
      (command) => command.kind !== 'useSkillSlot' || command.skillLevel === fixed.skillLevel,
    )
  );
}
