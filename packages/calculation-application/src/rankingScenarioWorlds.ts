import type { MasterDataSnapshot, ServantMaster } from '@fgo-lab/master-data';
import type { VersionContext } from '@fgo-lab/schema';
import type { DamageContributionProjection } from '@fgo-lab/battle-execution';
import type { EffectControlViewModel } from './effectControls';
import {
  contributesAreaSupport,
  contributesToAttackerDamage,
  isSpecialAttack,
} from './rankingContribution';
import { rankingDamageContributionProjection, type RankingConditions } from './rankingContracts';
import {
  createRankingFieldCandidates,
  materializeRankingField,
  type RankingFieldCandidate,
} from './rankingFieldWorld';
import type { ResolvedScenario } from './rankingPolicy';
import {
  createRankingWorldCandidates,
  effectMatchesRankingWorld,
  materializeRankingWorld,
  type RankingWorldCandidate,
} from './rankingWorld';
import type { PreparedCalculationProjection } from './scenario';

interface RankingWorld {
  target: RankingWorldCandidate | null;
  field: RankingFieldCandidate;
}

export interface CompiledRankingScenarioWorlds {
  rankingScenarios: readonly ResolvedScenario[];
  withoutAreaScenarios: readonly (ResolvedScenario | null)[];
  contributionProjections: readonly DamageContributionProjection[];
  withoutAreaContributionProjections: readonly (DamageContributionProjection | null)[];
  worldCandidateCount: number;
}

export function selectedKeysForScope(
  controls: readonly EffectControlViewModel[],
  conditions: RankingConditions,
  scope: 'ranking' | 'withoutArea',
  candidate: RankingWorldCandidate | null,
  master: MasterDataSnapshot,
): Set<string> {
  const contributionProjection = rankingDamageContributionProjection(conditions.selfBuffs);
  const selected = new Set<string>();
  for (const control of controls) {
    const contributes =
      contributesToAttackerDamage(control.projection) &&
      (scope === 'ranking' || !contributesAreaSupport(control.projection));
    if (!contributes) continue;
    if (
      contributionProjection === 'counterfactualWithoutVoluntarySkillModifiers' &&
      control.projection.source.origin === 'attacker'
    )
      continue;
    if (!isSpecialAttack(control.projection)) selected.add(control.key);
    else if (
      conditions.specialAttack === 'active' &&
      candidate &&
      effectMatchesRankingWorld(control, candidate, master)
    )
      selected.add(control.key);
  }
  return new Set(
    controls.flatMap((control) =>
      selected.has(control.key) &&
      control.projection.outcome !== 'impossible' &&
      control.projection.outcome !== 'unsupported'
        ? [control.key]
        : [],
    ),
  );
}

function scenarioForPolicy(
  servant: ServantMaster,
  scenario: ResolvedScenario,
  baseline: PreparedCalculationProjection,
  conditions: RankingConditions,
  scope: 'ranking' | 'withoutArea',
  worldCandidate: RankingWorld,
  master: MasterDataSnapshot,
): { scenario: ResolvedScenario; contributionProjection: DamageContributionProjection } {
  const targetWorld = worldCandidate.target
    ? materializeRankingWorld(scenario, worldCandidate.target)
    : scenario;
  const fieldWorld = materializeRankingField(targetWorld, worldCandidate.field);
  const selectedKeys = selectedKeysForScope(
    baseline.effectControls,
    conditions,
    scope,
    worldCandidate.target,
    master,
  );
  return {
    scenario: fieldWorld,
    contributionProjection: {
      includedOperationIds: new Set(
        baseline.effectControls.flatMap((control) =>
          contributesToAttackerDamage(control.projection) && selectedKeys.has(control.key)
            ? [control.projection.operationId]
            : [],
        ),
      ),
      excludedOperationIds: new Set(
        baseline.effectControls.flatMap((control) =>
          contributesToAttackerDamage(control.projection) &&
          control.projection.outcome === 'applied' &&
          !selectedKeys.has(control.key)
            ? [control.projection.operationId]
            : [],
        ),
      ),
    },
  };
}

export function compileRankingScenarioWorlds(input: {
  servant: ServantMaster;
  master: MasterDataSnapshot;
  conditions: RankingConditions;
  versions: VersionContext;
  canonical: ResolvedScenario;
  baseline: PreparedCalculationProjection;
}): CompiledRankingScenarioWorlds {
  const { servant, master, conditions, canonical, baseline } = input;
  const rankingScenarios: ResolvedScenario[] = [];
  const withoutAreaScenarios: (ResolvedScenario | null)[] = [];
  const contributionProjections: DamageContributionProjection[] = [];
  const withoutAreaContributionProjections: (DamageContributionProjection | null)[] = [];
  let worldCandidateCount = 0;
  {
    const variantScenario = canonical;
    const variantBaseline = baseline;
    const specialControls = variantBaseline.effectControls.filter(
      (control) =>
        isSpecialAttack(control.projection) && contributesToAttackerDamage(control.projection),
    );
    const candidates =
      conditions.specialAttack === 'active'
        ? createRankingWorldCandidates(servant, master, variantScenario, specialControls)
        : [];
    const targetWorlds = candidates.length > 0 ? candidates : [null];
    const fieldWorlds = createRankingFieldCandidates(
      variantBaseline.effectControls,
      conditions.field === 'active',
    );
    const worlds: RankingWorld[] = targetWorlds.flatMap((target) =>
      fieldWorlds.map((field) => ({ target, field })),
    );
    worldCandidateCount += worlds.length;
    const rankedWorlds = worlds.map((candidate) =>
      scenarioForPolicy(
        servant,
        variantScenario,
        variantBaseline,
        conditions,
        'ranking',
        candidate,
        master,
      ),
    );
    rankingScenarios.push(...rankedWorlds.map(({ scenario }) => scenario));
    contributionProjections.push(
      ...rankedWorlds.map(({ contributionProjection }) => contributionProjection),
    );
    const hasArea = variantBaseline.effectControls.some((control) =>
      contributesAreaSupport(control.projection),
    );
    const withoutAreaWorlds = worlds.map((candidate) =>
      conditions.selfBuffs === 'included' && hasArea
        ? scenarioForPolicy(
            servant,
            variantScenario,
            variantBaseline,
            conditions,
            'withoutArea',
            candidate,
            master,
          )
        : null,
    );
    withoutAreaScenarios.push(...withoutAreaWorlds.map((item) => item?.scenario ?? null));
    withoutAreaContributionProjections.push(
      ...withoutAreaWorlds.map((item) => item?.contributionProjection ?? null),
    );
  }
  return {
    rankingScenarios,
    withoutAreaScenarios,
    contributionProjections,
    withoutAreaContributionProjections,
    worldCandidateCount,
  };
}
