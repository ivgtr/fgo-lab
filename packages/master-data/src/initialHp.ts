import { findActorForm, readHpAtLevel, type MasterDataSnapshot } from './index';
import type { CalculationScenario } from '@fgo-lab/schema';

type Scenario = Extract<CalculationScenario, { mode: 'resolved' }>;
export interface InitialHpUnavailableIssue {
  kind: 'initialHpUnavailable';
  servantId: string;
  level: number;
  source: 'servant' | 'craftEssence';
  reason: 'missingHp' | 'invalidEquipment' | 'unsafeMaximum' | 'conflictingInitialIntent';
}
export type InitialMaximumHpResolution =
  { status: 'resolved'; maximum: number } | { status: 'invalid'; issue: InitialHpUnavailableIssue };

/** Product condition approved 2026-09-08; independent of ATK Fou and ATK overrides. */
const FIXED_HP_FOU = 1000;

export function resolveInitialMaximumHp(
  scenario: Pick<Scenario, 'attacker' | 'craftEssence'>,
  master: MasterDataSnapshot,
): InitialMaximumHpResolution {
  const invalid = (
    source: InitialHpUnavailableIssue['source'],
    reason: InitialHpUnavailableIssue['reason'],
    level: number,
  ): InitialMaximumHpResolution => ({
    status: 'invalid',
    issue: {
      kind: 'initialHpUnavailable',
      servantId: scenario.attacker.servantId,
      level,
      source,
      reason,
    },
  });
  const servant = master.servants.find(({ id }) => id === scenario.attacker.servantId);
  const form = servant ? findActorForm(servant, scenario.attacker.initialActorFormId) : undefined;
  const hp =
    servant && form
      ? readHpAtLevel(
          form.baseHp.kind === 'lineage' ? servant.hpByLevel : form.baseHp.hpByLevel,
          scenario.attacker.level,
        )
      : null;
  if (hp === null || hp === 0) return invalid('servant', 'missingHp', scenario.attacker.level);
  const baseMaximum = hp + FIXED_HP_FOU;
  if (!Number.isSafeInteger(baseMaximum))
    return invalid('servant', 'unsafeMaximum', scenario.attacker.level);
  const equipped = scenario.craftEssence;
  if (!equipped) return { status: 'resolved', maximum: baseMaximum };
  const equip = master.craftEssences.find(({ id }) => id === equipped.craftEssenceId);
  const maximumLevel = equip?.maxLevelByLimitBreak[equipped.limitBreak];
  if (
    !equip ||
    maximumLevel === undefined ||
    !Number.isInteger(equipped.limitBreak) ||
    !Number.isInteger(equipped.level) ||
    equipped.level < 1 ||
    equipped.level > maximumLevel
  )
    return invalid('craftEssence', 'invalidEquipment', equipped.level);
  const equipHp = readHpAtLevel(equip.hpByLevel, equipped.level);
  if (equipHp === null) return invalid('craftEssence', 'missingHp', equipped.level);
  const maximum = baseMaximum + equipHp;
  return Number.isSafeInteger(maximum)
    ? { status: 'resolved', maximum }
    : invalid('craftEssence', 'unsafeMaximum', equipped.level);
}
