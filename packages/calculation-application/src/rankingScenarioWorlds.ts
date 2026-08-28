import type { MasterDataSnapshot, ServantMaster } from '@fgo-lab/master-data';
import { activationChoiceGroupKey, type VersionContext } from '@fgo-lab/schema';
import { applyActivationFactSelection } from './activationContext';
import type { EffectControlViewModel } from './effectControls';
import { materializeRankingAttackerFacts } from './rankingActorWorld';
import { createRankingChoiceCandidates, type RankingChoiceWorld } from './rankingChoiceWorld';
import {
  contributesAreaSupport,
  contributesToAttackerDamage,
  isSpecialAttack,
} from './rankingContribution';
import type { RankingConditions } from './rankingContracts';
import {
  applyRankingExecutionPolicy,
  compileRankingExecutionPolicy,
} from './rankingExecutionPolicy';
import {
  createRankingFieldCandidates,
  materializeRankingField,
  type RankingFieldCandidate,
} from './rankingFieldWorld';
import { applyRankingCanonicalMinimums, type ResolvedScenario } from './rankingPolicy';
import {
  createRankingWorldCandidates,
  effectMatchesRankingWorld,
  materializeRankingWorld,
  type RankingWorldCandidate,
} from './rankingWorld';
import { calculateScenario, type CalculationExecution } from './scenario';

interface RankingWorld {
  target: RankingWorldCandidate | null;
  field: RankingFieldCandidate;
  choices: RankingChoiceWorld;
}

export interface CompiledRankingScenarioWorlds {
  rankingScenarios: readonly ResolvedScenario[];
  withoutAreaScenarios: readonly ResolvedScenario[];
  worldCandidateCount: number;
}

function applyRankingChoices(
  scenario: ResolvedScenario,
  choices: RankingChoiceWorld,
  baseline: CalculationExecution,
): ResolvedScenario {
  const selectedKeys = new Set(
    baseline.effectControls.flatMap((control) => {
      const groups = control.projection.selectionGroups.filter(({ groupKey }) =>
        groupKey.startsWith('choice:'),
      );
      const selected =
        groups.length > 0 &&
        groups.every(({ groupKey, candidateKey }) => choices[groupKey] === candidateKey);
      return selected ? [control.key] : [];
    }),
  );
  const policy = compileRankingExecutionPolicy(
    scenario.targetContext,
    baseline.effectControls,
    selectedKeys,
  );
  const choiceScenario = applyRankingExecutionPolicy(
    scenario,
    policy,
    baseline.effectInputs,
    baseline.activationRequirements,
  );
  return Object.entries(choices).reduce((current, [groupKey, candidate]) => {
    const fact = baseline.activationRequirements
      .flatMap((requirement) => requirement.facts)
      .find(
        (item) =>
          item.kind === 'choice' &&
          `choice:${activationChoiceGroupKey(item.source, item.family)}` === groupKey &&
          item.candidate === candidate,
      );
    if (!fact) throw new TypeError(`ranking_choice_fact_missing:${groupKey}:${candidate}`);
    return applyActivationFactSelection(current, [fact], true, baseline.activationRequirements);
  }, choiceScenario);
}

export function selectedKeysForScope(
  controls: readonly EffectControlViewModel[],
  conditions: RankingConditions,
  scope: 'ranking' | 'withoutArea',
  candidate: RankingWorldCandidate | null,
  master: MasterDataSnapshot,
  choices: Readonly<Record<string, string>> | null = null,
): Set<string> {
  const selected = new Set<string>();
  for (const control of controls) {
    const contributes =
      contributesToAttackerDamage(control.projection) &&
      (scope === 'ranking' || !contributesAreaSupport(control.projection));
    if (!contributes || conditions.selfBuffs === 'excluded') continue;
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
      control.projection.selectionGroups
        .filter(({ groupKey }) => groupKey.startsWith('choice:'))
        .every(
          (group) =>
            choices === null ||
            (choices[group.groupKey] !== undefined &&
              choices[group.groupKey] === group.candidateKey),
        )
        ? [control.key]
        : [],
    ),
  );
}

function scenarioForPolicy(
  servant: ServantMaster,
  scenario: ResolvedScenario,
  baseline: CalculationExecution,
  conditions: RankingConditions,
  scope: 'ranking' | 'withoutArea',
  worldCandidate: RankingWorld,
  master: MasterDataSnapshot,
): ResolvedScenario {
  const targetWorld = worldCandidate.target
    ? materializeRankingWorld(scenario, worldCandidate.target)
    : scenario;
  const fieldWorld = materializeRankingField(targetWorld, worldCandidate.field);
  const world = materializeRankingAttackerFacts(fieldWorld, servant, baseline.effectControls);
  const selectedKeys = selectedKeysForScope(
    baseline.effectControls,
    conditions,
    scope,
    worldCandidate.target,
    master,
    worldCandidate.choices,
  );
  const policy = compileRankingExecutionPolicy(
    world.targetContext,
    baseline.effectControls,
    selectedKeys,
  );
  return applyRankingExecutionPolicy(
    world,
    policy,
    baseline.effectInputs,
    baseline.activationRequirements,
  );
}

export function compileRankingScenarioWorlds(input: {
  servant: ServantMaster;
  master: MasterDataSnapshot;
  conditions: RankingConditions;
  versions: VersionContext;
  canonical: ResolvedScenario;
  baseline: CalculationExecution;
}): CompiledRankingScenarioWorlds {
  const { servant, master, conditions, versions, canonical, baseline } = input;
  const selected = selectedKeysForScope(
    baseline.effectControls,
    conditions,
    'ranking',
    null,
    master,
  );
  const choiceWorlds = createRankingChoiceCandidates(baseline.effectControls, selected);
  const rankingScenarios: ResolvedScenario[] = [];
  const withoutAreaScenarios: ResolvedScenario[] = [];
  let worldCandidateCount = 0;
  for (const choices of choiceWorlds) {
    let variantScenario = canonical;
    let variantBaseline = baseline;
    if (Object.keys(choices).length > 0) {
      const selectedScenario = applyRankingChoices(canonical, choices, baseline);
      const preliminary = calculateScenario(selectedScenario, master, versions);
      variantScenario = applyRankingCanonicalMinimums(selectedScenario, preliminary);
      variantBaseline = calculateScenario(variantScenario, master, versions);
    }
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
      fieldWorlds.map((field) => ({ target, field, choices })),
    );
    worldCandidateCount += worlds.length;
    rankingScenarios.push(
      ...worlds.map((candidate) =>
        scenarioForPolicy(
          servant,
          variantScenario,
          variantBaseline,
          conditions,
          'ranking',
          candidate,
          master,
        ),
      ),
    );
    const hasArea = variantBaseline.effectControls.some((control) =>
      contributesAreaSupport(control.projection),
    );
    if (conditions.selfBuffs === 'included' && hasArea)
      withoutAreaScenarios.push(
        ...worlds.map((candidate) =>
          scenarioForPolicy(
            servant,
            variantScenario,
            variantBaseline,
            conditions,
            'withoutArea',
            candidate,
            master,
          ),
        ),
      );
  }
  return { rankingScenarios, withoutAreaScenarios, worldCandidateCount };
}
