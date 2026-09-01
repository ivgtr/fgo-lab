import type { DamageContributionProjection } from '@fgo-lab/battle-execution';
import type { ActorFormId, MasterDataSnapshot, ServantMaster } from '@fgo-lab/master-data';
import { attackProfileKey, type AttackProfile } from './attackProfile';
import { applyCanonicalInputCommand } from './canonicalInputs';
import {
  finiteSemanticProduct,
  finiteSemanticProductBound,
  type FiniteSemanticDimension,
} from './finiteSemanticProduct';
import { createCanonicalInputValueDomains } from './rankingCanonicalInputs';
import { compileRankingComparisonPolicy } from './rankingComparisonPolicy';
import { compileDamageContributionProjection } from './contributionProjection';
import type { RankingPolicyConditions, RankingProfileInput } from './rankingContracts';
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
import {
  compileStaticRankingSemantics,
  type StaticRankingSemantics,
} from './rankingStaticSemantics';
import {
  createRankingWorldCandidatesForConditions,
  materializeRankingWorld,
  type RankingWorldCandidate,
} from './rankingWorld';

export const MAX_RANKING_CANDIDATES_PER_ATTACK_PROFILE = 4_096;

export type CandidateSpaceIssue =
  | { kind: 'staticPreparationInvalid'; detail: string }
  | { kind: 'semanticDomainInvalid'; detail: string }
  | { kind: 'unsupportedCanonicalSemantics'; projectionKeys: readonly string[] }
  | { kind: 'candidateLimitExceeded'; upperBound: number; limit: number };

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
  contributionProjection: DamageContributionProjection;
  withoutAreaContributionProjection: DamageContributionProjection | null;
  evidence: RankingCandidateEvidence;
}

interface ProgramCandidateDomain {
  program: StaticRankingPreparationProgram;
  semantics: StaticRankingSemantics;
  startNpGauges: readonly number[];
  canonicalInputs: readonly { key: string; values: readonly number[] }[];
  targets: readonly (RankingWorldCandidate | null)[];
  fields: readonly RankingFieldCandidate[];
  quantities: readonly RankingQuantityCandidate[];
  upperBound: number;
}

export type RankingCandidateSpace =
  | {
      status: 'invalid';
      attackProfile: AttackProfile;
      issue: CandidateSpaceIssue;
    }
  | {
      status: 'ready';
      attackProfile: AttackProfile;
      policyKey: string;
      programs: readonly ProgramCandidateDomain[];
      upperBound: number;
    };

function dimensionIndexes(
  key: string,
  values: readonly unknown[],
): FiniteSemanticDimension<number> {
  return { key, values: values.map((_, index) => index) };
}

function programDimensions(domain: Omit<ProgramCandidateDomain, 'upperBound'>) {
  return [
    dimensionIndexes('startNpGauge', domain.startNpGauges),
    ...domain.canonicalInputs.map(({ key, values }) => dimensionIndexes(`input:${key}`, values)),
    dimensionIndexes('target', domain.targets),
    dimensionIndexes('field', domain.fields),
    dimensionIndexes('quantity', domain.quantities),
  ];
}

function compileProgramDomain(input: {
  servant: ServantMaster;
  master: MasterDataSnapshot;
  profile: RankingProfileInput;
  conditions: RankingPolicyConditions;
  program: StaticRankingPreparationProgram;
}): Omit<ProgramCandidateDomain, 'upperBound'> {
  const { servant, master, profile, conditions, program } = input;
  const policy = compileRankingComparisonPolicy(conditions, master);
  const semantics = compileStaticRankingSemantics(servant, program, conditions);
  if (semantics.unsupported.length > 0)
    throw new UnsupportedStaticSemantics(
      semantics.unsupported.map(({ projectionKey }) => projectionKey),
    );
  const active = conditions.conditionalEffects === 'satisfied';
  const base = createRankingBaseScenario(
    servant,
    master,
    profile,
    conditions,
    program.initialFormId,
  );
  const generatedTargets = active
    ? createRankingWorldCandidatesForConditions(servant, master, base, semantics.conditions)
    : [];
  const generatedFields = createRankingFieldCandidatesForConditions(semantics.conditions, active);
  const baselineField: RankingFieldCandidate = { key: 'field:none', traits: [], facts: [] };
  return {
    program,
    semantics,
    startNpGauges: policy.startNpGaugeCandidates,
    canonicalInputs: createCanonicalInputValueDomains(
      semantics.inputDefinitions,
      semantics.conditions,
      conditions.conditionalEffects,
    ),
    targets: [
      null,
      ...new Map(generatedTargets.map((candidate) => [candidate.key, candidate])).values(),
    ],
    fields: [
      ...new Map(
        [baselineField, ...(active ? generatedFields : [])].map((candidate) => [
          candidate.key,
          candidate,
        ]),
      ).values(),
    ],
    quantities: createRankingQuantityCandidatesForConditions(semantics.conditions, active),
  };
}

class UnsupportedStaticSemantics extends Error {
  constructor(readonly projectionKeys: readonly string[]) {
    super('unsupported_canonical_semantics');
  }
}

export function compileRankingCandidateSpaces(
  servant: ServantMaster,
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingPolicyConditions,
  attackProfiles: readonly AttackProfile[],
  options: { candidateLimit?: number } = {},
): readonly RankingCandidateSpace[] {
  const candidateLimit = options.candidateLimit ?? MAX_RANKING_CANDIDATES_PER_ATTACK_PROFILE;
  let programs: readonly StaticRankingPreparationProgram[];
  try {
    programs = compileStaticRankingPreparationPrograms(servant);
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
    try {
      const domains = programs
        .filter(
          (program) => attackProfileKey(program.attackProfile) === attackProfileKey(attackProfile),
        )
        .map((program) => compileProgramDomain({ servant, master, profile, conditions, program }));
      const readyPrograms: ProgramCandidateDomain[] = [];
      let upperBound = 0;
      for (const domain of domains) {
        const remaining = candidateLimit - upperBound;
        const bound = finiteSemanticProductBound(programDimensions(domain), remaining);
        if (bound.status === 'limitExceeded')
          return {
            status: 'invalid',
            attackProfile,
            issue: {
              kind: 'candidateLimitExceeded',
              upperBound: upperBound + bound.upperBound,
              limit: candidateLimit,
            },
          };
        upperBound += bound.upperBound;
        readyPrograms.push({ ...domain, upperBound: bound.upperBound });
      }
      return { status: 'ready', attackProfile, policyKey, programs: readyPrograms, upperBound };
    } catch (error) {
      return {
        status: 'invalid',
        attackProfile,
        issue:
          error instanceof UnsupportedStaticSemantics
            ? {
                kind: 'unsupportedCanonicalSemantics',
                projectionKeys: error.projectionKeys,
              }
            : {
                kind: 'semanticDomainInvalid',
                detail: error instanceof Error ? error.message : String(error),
              },
      };
    }
  });
}

function materializeProgramCandidates(input: {
  servant: ServantMaster;
  master: MasterDataSnapshot;
  profile: RankingProfileInput;
  conditions: RankingPolicyConditions;
  policyKey: string;
  attackProfile: AttackProfile;
  domain: ProgramCandidateDomain;
}): RankingCandidate[] {
  const { servant, master, profile, conditions, policyKey, attackProfile, domain } = input;
  const product = finiteSemanticProduct(
    programDimensions(domain),
    domain.upperBound,
    'ranking_candidate_space_materialization_mismatch',
  );
  return product.candidates.map((indexes) => {
    const startNpGauge = domain.startNpGauges[indexes.startNpGauge ?? 0]!;
    const canonicalInputValues = Object.fromEntries(
      domain.canonicalInputs.map(({ key, values }) => [key, values[indexes[`input:${key}`] ?? 0]!]),
    );
    const target = domain.targets[indexes.target ?? 0] ?? null;
    const field = domain.fields[indexes.field ?? 0]!;
    const quantity = domain.quantities[indexes.quantity ?? 0]!;
    let scenario = createRankingBaseScenario(
      servant,
      master,
      profile,
      conditions,
      domain.program.initialFormId,
    );
    scenario = { ...scenario, preNoblePhantasmPlan: [...domain.program.commands] };
    for (const [key, value] of Object.entries(canonicalInputValues))
      scenario = applyCanonicalInputCommand(scenario, {
        kind: 'setCanonicalIntegerInput',
        key,
        value,
      });
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
          sum + Math.abs(canonicalInputValues[key]! - (values[0] ?? canonicalInputValues[key]!)),
        0,
      ),
      targetCandidateKey: target?.key ?? 'target:baseline',
      fieldCandidateKey: field.key,
      quantityCandidateKey: quantity.key,
    };
    const contributionProjection = compileDamageContributionProjection(
      domain.semantics.operations,
      { selfSkill: conditions.selfBuffs, area: 'included' },
    );
    const withoutAreaContributionProjection = compileDamageContributionProjection(
      domain.semantics.operations,
      { selfSkill: conditions.selfBuffs, area: 'excluded' },
    );
    const hasAreaContribution = [...withoutAreaContributionProjection.excludedOperationIds].some(
      (operationId) => !contributionProjection.excludedOperationIds.has(operationId),
    );
    return {
      key: JSON.stringify(evidence),
      attackProfile: domain.program.attackProfile,
      expectedTerminalFormId: domain.program.expectedTerminalFormId,
      scenario,
      contributionProjection,
      withoutAreaContributionProjection: hasAreaContribution
        ? withoutAreaContributionProjection
        : null,
      evidence,
    };
  });
}

export function materializeRankingCandidateSpace(input: {
  servant: ServantMaster;
  master: MasterDataSnapshot;
  profile: RankingProfileInput;
  conditions: RankingPolicyConditions;
  space: Extract<RankingCandidateSpace, { status: 'ready' }>;
}): readonly RankingCandidate[] {
  return input.space.programs.flatMap((domain) =>
    materializeProgramCandidates({
      ...input,
      domain,
      policyKey: input.space.policyKey,
      attackProfile: input.space.attackProfile,
    }),
  );
}
