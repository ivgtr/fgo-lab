import { rankingHpInitialBoundaries } from './rankingHpBoundary';
import { resolveInitialMaximumHp } from '@fgo-lab/master-data';
import {
  traitConditionEvaluationSource,
  traitConditionReadScopes,
  npTransferInputSaturation,
  populationInputIssue,
  populationInputEquivalenceKey,
  populationCountSaturation,
  populationInputsHaveEquivalentTerminalDamage,
} from '@fgo-lab/battle-execution';
import { UnsupportedStackQuantity } from './rankingStackDomain';
import type { ConditionExpression, ContributionApplicationPolicy } from '@fgo-lab/battle-execution';
import {
  findNoblePhantasmVariant,
  type ActorFormId,
  type MasterDataSnapshot,
  type ServantMaster,
} from '@fgo-lab/master-data';
import { attackProfileKey, type AttackProfile } from './attackProfile';
import { applyCanonicalInputCommand } from './canonicalInputs';
import { finiteSemanticProduct, type FiniteSemanticDimension } from './finiteSemanticProduct';
import {
  assertRankingCandidateMaterialization,
  certifyRankingProgramDomain,
  type FiniteRankingDomainCertificate,
} from './rankingCandidateCertificate';
import {
  createCanonicalInputValueDomains,
  isPopulationInputDefinition,
  type PopulationInputDefinition,
} from './rankingCanonicalInputs';
import type { CanonicalInputDefinition } from '@fgo-lab/master-data';
import { compileRankingComparisonPolicy } from './rankingComparisonPolicy';
import {
  compileRankingContributionPolicy,
  isAreaDamageContribution,
  isAttackerDamageContribution,
} from './contributionPolicy';
import type { RankingPolicyConditions, ResolvedRankingBasis } from './rankingContracts';
import {
  createRankingFieldCandidatesForConditions,
  materializeRankingField,
  type RankingFieldCandidate,
} from './rankingFieldWorld';
import { createRankingBaseScenario, type ResolvedScenario } from './rankingPolicy';
import {
  createRankingQuantityCandidatesForConditions,
  materializeRankingQuantity,
  type RankingQuantityCandidate,
} from './rankingQuantityWorld';
import {
  compileStaticRankingPreparationPrograms,
  type StaticRankingPreparationProgram,
} from './rankingStaticPreparation';
import { compileCandidateLocalActionAdmission } from './rankingActionAdmission';
import {
  compileStaticRankingSemantics,
  type StaticRankingSemantics,
} from './rankingStaticSemantics';
import { materializeRankingWorld, type RankingWorldCandidate } from './rankingWorld';
import { enumerateRankingWorldDomain } from './rankingWorldDomain';
import { compileRankingWorldObservationPlan } from './rankingWorldObservation';
import { analyzeRankingWorldDomain } from './rankingWorldQuotient';

export const MAX_RANKING_CANDIDATES_PER_ATTACK_PROFILE = 4_096;

export type CandidateSpaceIssue =
  | { kind: 'staticPreparationInvalid'; detail: string }
  | { kind: 'semanticDomainInvalid'; detail: string }
  | { kind: 'unsupportedCanonicalSemantics'; projectionKeys: readonly string[] }
  | { kind: 'unsupportedActionAdmission'; attackProfileKey: string }
  | { kind: 'unsupportedFiniteDomain'; upperBound: number; supportedMaximum: 4_096 };

export type { FiniteRankingDomainCertificate } from './rankingCandidateCertificate';

export interface RankingCandidateEvidence {
  policyKey: string;
  attackProfileKey: string;
  preparationPlanKey: string;
  startNpGauge: number;
  canonicalInputValues: Readonly<Record<string, number>>;
  canonicalInputBaselineDeviation: number;
  targetCandidateKey: string;
  fieldCandidateKey: string;
  quantityCandidateKey: string;
}

export interface RankingCandidate {
  key: string;
  attackProfile: AttackProfile;
  expectedTerminalFormId: ActorFormId;
  scenario: ResolvedScenario;
  contributionPolicy: ContributionApplicationPolicy;
  withoutAreaContributionPolicy: ContributionApplicationPolicy | null;
  evidence: RankingCandidateEvidence;
}

interface ProgramCandidateDomain {
  program: StaticRankingPreparationProgram;
  semantics: StaticRankingSemantics;
  baseScenario: ResolvedScenario;
  initialNpGauge: number;
  canonicalInputs: readonly { key: string; values: readonly number[] }[];
  populationInputKeys: ReadonlySet<string>;
  populationInputs: readonly Readonly<Record<string, number>>[];
  canonicalInputDefaults: ReadonlyMap<string, number | null>;
  targets: readonly (RankingWorldCandidate | null)[];
  fields: readonly RankingFieldCandidate[];
  quantities: readonly RankingQuantityCandidate[];
  rawWorldCardinality: number;
  upperBound: number;
}

interface PopulationCandidateInputs {
  keys: ReadonlySet<string>;
  values: readonly Readonly<Record<string, number>>[];
}

function buildPopulationCandidateInputs(input: {
  canonicalInputs: readonly { key: string; values: readonly number[] }[];
  populationDefinitions: readonly PopulationInputDefinition[];
  inputDefinitions: readonly CanonicalInputDefinition[];
  definitionsByKey: ReadonlyMap<string, CanonicalInputDefinition>;
  sources: Parameters<typeof populationInputEquivalenceKey>[0];
}): PopulationCandidateInputs {
  const { canonicalInputs, populationDefinitions, inputDefinitions, definitionsByKey, sources } =
    input;
  const populationInputKeys = new Set(populationDefinitions.map((definition) => definition.key));
  const legalPopulationInputs = finiteSemanticProduct(
    canonicalInputs.filter((candidate) => populationInputKeys.has(candidate.key)),
    MAX_RANKING_CANDIDATES_PER_ATTACK_PROFILE,
    'population_input_product_limit',
  ).candidates.filter((values) => !populationInputIssue(inputDefinitions, values));
  const transferDonorDefinitions = populationDefinitions.filter(
    (definition): definition is Extract<PopulationInputDefinition, { kind: 'transferDonor' }> =>
      definition.kind === 'transferDonor',
  );
  const deviation = (tuple: Readonly<Record<string, number>>) =>
    Object.entries(tuple).reduce(
      (sum, [key, value]) => sum + Math.abs(value - (definitionsByKey.get(key)?.defaultValue ?? 0)),
      0,
    );
  const representatives = new Map<string, Readonly<Record<string, number>>>();
  for (const values of legalPopulationInputs) {
    const key = JSON.stringify([
      populationInputEquivalenceKey(sources, values),
      transferDonorDefinitions.map((definition) => values[definition.key]),
    ]);
    const prior = representatives.get(key);
    if (!prior || deviation(values) < deviation(prior)) representatives.set(key, values);
  }
  return { keys: populationInputKeys, values: [...representatives.values()] };
}

function worldTraitFacts(conditions: readonly (ConditionExpression | null)[]): readonly {
  scope: 'attacker' | 'attackerState' | 'target' | 'targetState' | 'field';
  trait: string;
}[] {
  const facts = new Map<
    string,
    { scope: 'attacker' | 'attackerState' | 'target' | 'targetState' | 'field'; trait: string }
  >();
  const visit = (condition: ConditionExpression): void => {
    if (condition.kind === 'all' || condition.kind === 'any') {
      condition.expressions.forEach(visit);
      return;
    }
    if (condition.kind === 'not') {
      visit(condition.expression);
      return;
    }
    if (
      (condition.kind !== 'trait' && condition.kind !== 'traitCount') ||
      traitConditionEvaluationSource(condition) !== 'worldFacts'
    )
      return;
    const traits = condition.kind === 'trait' ? [condition.trait] : condition.traits;
    for (const scope of traitConditionReadScopes(condition.scope))
      for (const trait of traits) facts.set(`${scope}:${trait}`, { scope, trait });
  };
  for (const condition of conditions) if (condition) visit(condition);
  return [...facts.values()];
}

function materializeFixedRankingWorld(
  scenario: ResolvedScenario,
  semantics: StaticRankingSemantics,
  intrinsicTraits: ReadonlySet<string>,
): ResolvedScenario {
  const owned = new Set(
    semantics.inputDefinitions.flatMap((definition) =>
      definition.kind === 'effectStackCount'
        ? [`${definition.quantitySource.scope}:${definition.quantitySource.trait}`]
        : [],
    ),
  );
  const assertions = worldTraitFacts(semantics.conditions).flatMap(({ scope, trait }) => {
    if (owned.has(`${scope}:${trait}`)) return [];
    const present = scope === 'attacker' && intrinsicTraits.has(trait);
    return [
      {
        decisionKey: `ranking:${scope}:${trait}`,
        fact: { kind: 'trait' as const, scope, trait, present },
      },
    ];
  });
  return {
    ...scenario,
    worldFactAssertions: [
      ...scenario.worldFactAssertions.filter(
        ({ decisionKey }) => !decisionKey.startsWith('ranking:'),
      ),
      ...assertions,
    ],
  };
}

export type RankingCandidateSpace =
  | {
      status: 'invalid';
      attackProfile: AttackProfile;
      issue: CandidateSpaceIssue;
    }
  | {
      status: 'unsupported';
      attackProfile: AttackProfile;
      issue: Extract<
        CandidateSpaceIssue,
        {
          kind:
            | 'unsupportedFiniteDomain'
            | 'unsupportedActionAdmission'
            | 'unsupportedCanonicalSemantics';
        }
      >;
    }
  | {
      status: 'ready';
      attackProfile: AttackProfile;
      policyKey: string;
      programs: readonly ProgramCandidateDomain[];
      upperBound: number;
      certificate: FiniteRankingDomainCertificate;
    };

function dimensionIndexes(
  key: string,
  values: readonly unknown[],
): FiniteSemanticDimension<number> {
  return { key, values: values.map((_, index) => index) };
}

function programDimensions(domain: Omit<ProgramCandidateDomain, 'upperBound'>) {
  return [
    ...domain.canonicalInputs
      .filter(({ key }) => !domain.populationInputKeys.has(key))
      .map(({ key, values }) => dimensionIndexes(`input:${key}`, values)),
    ...(domain.populationInputKeys.size
      ? [dimensionIndexes('population', domain.populationInputs)]
      : []),
    dimensionIndexes('target', domain.targets),
    dimensionIndexes('field', domain.fields),
    dimensionIndexes('quantity', domain.quantities),
  ];
}

function compileProgramDomain(input: {
  servant: ServantMaster;
  master: MasterDataSnapshot;
  basis: ResolvedRankingBasis;
  conditions: Pick<
    RankingPolicyConditions,
    'classAffinity' | 'selfBuffs' | 'conditionalEffects' | 'initialOvercharge'
  >;
  program: StaticRankingPreparationProgram;
}): Omit<ProgramCandidateDomain, 'upperBound'> {
  const { servant, master, basis, conditions, program } = input;
  const policy = compileRankingComparisonPolicy(conditions, master);
  const semantics = compileStaticRankingSemantics(servant, program, basis.npLevel);
  if (semantics.unsupported.length > 0)
    throw new UnsupportedStaticSemantics(
      semantics.unsupported.map(({ projectionKey }) => projectionKey),
    );
  const active = conditions.conditionalEffects === 'satisfied';
  const base = materializeFixedRankingWorld(
    createRankingBaseScenario(servant, master, basis, conditions, program.initialFormId),
    semantics,
    new Set(program.attackProfile.id.terminalActorFormProfileId.semantics.intrinsicTraits),
  );
  const initialHp = active ? resolveInitialMaximumHp(base, master) : null;
  const hpAttackVariant = findNoblePhantasmVariant(
    servant,
    program.attackProfile.noblePhantasmVariant,
  );
  const hpBoundaries =
    initialHp?.status === 'resolved'
      ? rankingHpInitialBoundaries(
          initialHp.maximum,
          semantics.sources,
          semantics.conditions,
          hpAttackVariant?.kind === 'attack' &&
            hpAttackVariant.damage.some((damage) => damage.kind === 'hpRatioLow'),
        )
      : [];
  const ownedTraitFacts = new Set(
    semantics.inputDefinitions.flatMap((definition) =>
      definition.kind === 'effectStackCount'
        ? [`${definition.quantitySource.scope}:${definition.quantitySource.trait}`]
        : [],
    ),
  );
  const observationPlan = compileRankingWorldObservationPlan(
    semantics.operations,
    semantics.conditions,
  );
  const rawTargets = active
    ? enumerateRankingWorldDomain({
        servant,
        master,
        scenario: base,
        conditions: semantics.conditions,
        ownedTraitFacts,
        canonicalCombinedState: { transitionTraits: observationPlan.transitionTraits },
      })
    : [];
  const worldDomain = analyzeRankingWorldDomain(rawTargets, observationPlan);
  const generatedTargets = worldDomain.representatives;
  const generatedFields = createRankingFieldCandidatesForConditions(semantics.conditions, active);
  const baselineField: RankingFieldCandidate = { key: 'field:none', facts: [] };
  const inputDefinitionsByKey = new Map(
    semantics.inputDefinitions.map((definition) => [definition.key, definition] as const),
  );
  const populationDefinitions = semantics.inputDefinitions.filter(isPopulationInputDefinition);
  const hasPopulation = populationDefinitions.length > 0;
  const populationIndependent =
    hasPopulation &&
    program.sourceUses.every(
      (use) => use.kind === 'skill' && use.skill.resourceRequirement === null,
    ) &&
    populationInputsHaveEquivalentTerminalDamage(
      semantics.sources,
      {
        semantics: master.npResourceSemantics,
        npLevel: basis.npLevel,
        initialGauge: policy.initialNpGauge,
      },
      findNoblePhantasmVariant(servant, program.attackProfile.noblePhantasmVariant) ?? undefined,
    );
  const transferSaturation = new Map(npTransferInputSaturation(semantics.sources));
  if (populationIndependent)
    for (const input of semantics.inputDefinitions)
      if (input.kind === 'transferDonor' && input.resource === 'enemyHp')
        transferSaturation.set(input.key, 0);
  const inputDomains = createCanonicalInputValueDomains(
    semantics.inputDefinitions,
    semantics.conditions,
    conditions.conditionalEffects,
    semantics.stackWitnesses,
    new Map([
      ...(populationIndependent
        ? [...transferSaturation].map(([key]) => [key, 0] as const)
        : transferSaturation),
      ...(hasPopulation
        ? populationCountSaturation(
            semantics.sources,
            master.npResourceSemantics.capacityByNpLevel[basis.npLevel - 1]!,
          )
        : new Map()),
    ]),
  );
  const canonicalInputs = populationIndependent
    ? inputDomains.map((domain) => {
        const definition = inputDefinitionsByKey.get(domain.key);
        if (!definition || !isPopulationInputDefinition(definition)) return domain;
        return { ...domain, values: [definition.defaultValue ?? definition.minimum] };
      })
    : inputDomains;
  const populationCandidateInputs = buildPopulationCandidateInputs({
    canonicalInputs,
    populationDefinitions,
    inputDefinitions: semantics.inputDefinitions,
    definitionsByKey: inputDefinitionsByKey,
    sources: semantics.sources,
  });
  return {
    program,
    semantics,
    baseScenario: base,
    initialNpGauge: policy.initialNpGauge,
    canonicalInputs,
    populationInputKeys: populationCandidateInputs.keys,
    populationInputs: populationCandidateInputs.values,
    canonicalInputDefaults: new Map(
      semantics.inputDefinitions.map((definition) => [definition.key, definition.defaultValue]),
    ),
    targets: [null, ...generatedTargets],
    fields: [
      ...new Map(
        [baselineField, ...(active ? generatedFields : [])].map((candidate) => [
          candidate.key,
          candidate,
        ]),
      ).values(),
    ],
    quantities: createRankingQuantityCandidatesForConditions(
      semantics.conditions,
      active,
      hpBoundaries,
    ),
    rawWorldCardinality: worldDomain.rawWorldCardinality + 1,
  };
}

class UnsupportedStaticSemantics extends Error {
  constructor(readonly projectionKeys: readonly string[]) {
    super('unsupported_canonical_semantics');
  }
}

function resolveCanonicalInputOrigin(
  mode: 'baseline' | 'satisfied',
  value: number,
  definition: Extract<CanonicalInputDefinition, { kind: 'effectStackCount' }>,
): 'baseline' | 'maximum' | 'witness' {
  if (mode === 'baseline' || value === definition.defaultValue) return 'baseline';
  if (value === definition.maximum) return 'maximum';
  return 'witness';
}

export function compileRankingCandidateSpaces(
  servant: ServantMaster,
  master: MasterDataSnapshot,
  basis: ResolvedRankingBasis,
  conditions: Pick<
    RankingPolicyConditions,
    'classAffinity' | 'selfBuffs' | 'conditionalEffects' | 'initialOvercharge'
  >,
  attackProfiles: readonly AttackProfile[],
): readonly RankingCandidateSpace[] {
  let programs: readonly StaticRankingPreparationProgram[];
  let unsupportedAttackProfileKeys: ReadonlySet<string> = new Set();
  try {
    const admission = compileCandidateLocalActionAdmission(
      compileStaticRankingPreparationPrograms(servant),
      conditions,
      {
        semantics: master.npResourceSemantics,
        npLevel: basis.npLevel,
        initialGauge:
          conditions.initialOvercharge *
          master.npResourceSemantics.noblePhantasmUse.baseOvercharge.gaugePerStage,
        automaticEffects: servant.passives.flatMap((passive) => passive.effects),
      },
    );
    programs = admission.programs;
    unsupportedAttackProfileKeys = admission.unsupportedAttackProfileKeys;
  } catch (error) {
    return attackProfiles.map((attackProfile) => ({
      status: 'invalid',
      attackProfile,
      issue: {
        kind: 'staticPreparationInvalid',
        detail: error instanceof Error ? error.message : String(error),
      },
    }));
  }
  const policyKey = compileRankingComparisonPolicy(conditions, master).key;
  return attackProfiles.map((attackProfile): RankingCandidateSpace => {
    const profileKey = attackProfileKey(attackProfile);
    if (unsupportedAttackProfileKeys.has(profileKey))
      return {
        status: 'unsupported',
        attackProfile,
        issue: { kind: 'unsupportedActionAdmission', attackProfileKey: profileKey },
      };
    try {
      const domains = programs
        .filter(
          (program) => attackProfileKey(program.attackProfile) === attackProfileKey(attackProfile),
        )
        .map((program) => compileProgramDomain({ servant, master, basis, conditions, program }));
      const readyPrograms: ProgramCandidateDomain[] = [];
      const programBounds: FiniteRankingDomainCertificate['programBounds'][number][] = [];
      let upperBound = 0;
      for (const domain of domains) {
        const remaining = MAX_RANKING_CANDIDATES_PER_ATTACK_PROFILE - upperBound;
        const bound = certifyRankingProgramDomain({
          programKey: domain.program.key,
          rawWorldCardinality: domain.rawWorldCardinality,
          worldEquivalenceClasses: domain.targets.length,
          dimensions: programDimensions(domain),
          remaining,
        });
        if ('limitExceeded' in bound)
          return {
            status: 'unsupported',
            attackProfile,
            issue: {
              kind: 'unsupportedFiniteDomain',
              upperBound: upperBound + bound.limitExceeded,
              supportedMaximum: MAX_RANKING_CANDIDATES_PER_ATTACK_PROFILE,
            },
          };
        upperBound += bound.upperBound;
        readyPrograms.push({ ...domain, upperBound: bound.upperBound });
        programBounds.push(bound);
      }
      return {
        status: 'ready',
        attackProfile,
        policyKey,
        programs: readyPrograms,
        upperBound,
        certificate: {
          supportedMaximum: MAX_RANKING_CANDIDATES_PER_ATTACK_PROFILE,
          programBounds,
          completeUpperBound: upperBound,
        },
      };
    } catch (error) {
      if (error instanceof UnsupportedStaticSemantics || error instanceof UnsupportedStackQuantity)
        return {
          status: 'unsupported',
          attackProfile,
          issue: {
            kind: 'unsupportedCanonicalSemantics',
            projectionKeys:
              error instanceof UnsupportedStackQuantity ? [error.message] : error.projectionKeys,
          },
        };
      return {
        status: 'invalid',
        attackProfile,
        issue: {
          kind: 'semanticDomainInvalid',
          detail: error instanceof Error ? error.message : String(error),
        },
      };
    }
  });
}

function materializeProgramCandidates(input: {
  conditions: Pick<
    RankingPolicyConditions,
    'classAffinity' | 'selfBuffs' | 'conditionalEffects' | 'initialOvercharge'
  >;
  policyKey: string;
  attackProfile: AttackProfile;
  domain: ProgramCandidateDomain;
}): RankingCandidate[] {
  const { conditions, policyKey, attackProfile, domain } = input;
  const product = finiteSemanticProduct(
    programDimensions(domain),
    domain.upperBound,
    'ranking_candidate_space_materialization_mismatch',
  );
  const contributionPolicy = compileRankingContributionPolicy(conditions, 'included');
  const withoutAreaContributionPolicy = compileRankingContributionPolicy(conditions, 'excluded');
  const hasAreaContribution = domain.semantics.operations.some(
    (operation) => isAttackerDamageContribution(operation) && isAreaDamageContribution(operation),
  );
  return product.candidates.map((indexes) => {
    const startNpGauge = domain.initialNpGauge;
    const canonicalInputValues = Object.fromEntries(
      domain.canonicalInputs.map(({ key, values }) => [
        key,
        domain.populationInputKeys.has(key)
          ? domain.populationInputs[indexes.population ?? 0]![key]!
          : values[indexes[`input:${key}`] ?? 0]!,
      ]),
    );
    const target = domain.targets[indexes.target ?? 0] ?? null;
    const field = domain.fields[indexes.field ?? 0]!;
    const quantity = domain.quantities[indexes.quantity ?? 0]!;
    let scenario = {
      ...domain.baseScenario,
      preNoblePhantasmPlan: [...domain.program.commands],
    };
    for (const [key, value] of Object.entries(canonicalInputValues))
      scenario = applyCanonicalInputCommand(scenario, {
        kind: 'setCanonicalIntegerInput',
        key,
        value,
      });
    for (const definition of domain.semantics.inputDefinitions) {
      if (definition.kind !== 'effectStackCount') continue;
      const value = canonicalInputValues[definition.key]!;
      scenario.canonicalInputValues[definition.key] = {
        kind: 'integer',
        value,
        origin: resolveCanonicalInputOrigin(conditions.conditionalEffects, value, definition),
      };
    }
    if (target) scenario = materializeRankingWorld(scenario, target);
    scenario = materializeRankingField(
      scenario,
      field,
      conditions.conditionalEffects === 'satisfied',
    );
    scenario = materializeRankingQuantity(scenario, quantity);
    const evidence: RankingCandidateEvidence = {
      policyKey,
      attackProfileKey: attackProfileKey(attackProfile),
      preparationPlanKey: domain.program.key,
      startNpGauge,
      canonicalInputValues,
      canonicalInputBaselineDeviation: domain.canonicalInputs.reduce(
        (sum, { key, values }) =>
          sum +
          Math.abs(
            canonicalInputValues[key]! -
              (domain.canonicalInputDefaults.get(key) ?? values[0] ?? canonicalInputValues[key]!),
          ),
        0,
      ),
      targetCandidateKey: target?.key ?? 'target:baseline',
      fieldCandidateKey: field.key,
      quantityCandidateKey: quantity.key,
    };
    return {
      key: JSON.stringify(evidence),
      attackProfile: domain.program.attackProfile,
      expectedTerminalFormId: domain.program.expectedTerminalFormId,
      scenario,
      contributionPolicy,
      withoutAreaContributionPolicy: hasAreaContribution ? withoutAreaContributionPolicy : null,
      evidence,
    };
  });
}

export function materializeRankingCandidateSpace(input: {
  conditions: Pick<
    RankingPolicyConditions,
    'classAffinity' | 'selfBuffs' | 'conditionalEffects' | 'initialOvercharge'
  >;
  space: Extract<RankingCandidateSpace, { status: 'ready' }>;
}): readonly RankingCandidate[] {
  const candidates = input.space.programs.flatMap((domain) =>
    materializeProgramCandidates({
      conditions: input.conditions,
      domain,
      policyKey: input.space.policyKey,
      attackProfile: input.space.attackProfile,
    }),
  );
  assertRankingCandidateMaterialization(candidates.length, input.space.certificate);
  return candidates;
}
