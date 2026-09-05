import { UnsupportedStackQuantity } from './rankingStackDomain';
import type { ContributionApplicationPolicy } from '@fgo-lab/battle-execution';
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
  | { kind: 'unsupportedActionAdmission'; attackProfileKey: string }
  | { kind: 'unsupportedFiniteDomain'; upperBound: number; supportedMaximum: 4_096 };

export interface FiniteRankingDomainCertificate {
  supportedMaximum: 4_096;
  programBounds: readonly {
    programKey: string;
    dimensions: readonly { key: string; cardinality: number }[];
    upperBound: number;
  }[];
  completeUpperBound: number;
}

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
  basis: ResolvedRankingBasis;
  conditions: Pick<RankingPolicyConditions, 'classAffinity' | 'selfBuffs' | 'conditionalEffects'>;
  program: StaticRankingPreparationProgram;
}): Omit<ProgramCandidateDomain, 'upperBound'> {
  const { servant, master, basis, conditions, program } = input;
  const policy = compileRankingComparisonPolicy(conditions, master, basis.npLevel);
  const semantics = compileStaticRankingSemantics(servant, program, basis.npLevel);
  if (semantics.unsupported.length > 0)
    throw new UnsupportedStaticSemantics(
      semantics.unsupported.map(({ projectionKey }) => projectionKey),
    );
  const active = conditions.conditionalEffects === 'satisfied';
  const base = createRankingBaseScenario(servant, master, basis, conditions, program.initialFormId);
  const generatedTargets = active
    ? createRankingWorldCandidatesForConditions(servant, master, base, semantics.conditions)
    : [];
  const generatedFields = createRankingFieldCandidatesForConditions(semantics.conditions, active);
  const baselineField: RankingFieldCandidate = { key: 'field:none', facts: [] };
  return {
    program,
    semantics,
    startNpGauges: policy.startNpGaugeCandidates,
    canonicalInputs: createCanonicalInputValueDomains(
      semantics.inputDefinitions,
      semantics.conditions,
      conditions.conditionalEffects,
      semantics.stackWitnesses,
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
  basis: ResolvedRankingBasis,
  conditions: Pick<RankingPolicyConditions, 'classAffinity' | 'selfBuffs' | 'conditionalEffects'>,
  attackProfiles: readonly AttackProfile[],
): readonly RankingCandidateSpace[] {
  let programs: readonly StaticRankingPreparationProgram[];
  let unsupportedAttackProfileKeys: ReadonlySet<string> = new Set();
  try {
    const admission = compileCandidateLocalActionAdmission(
      compileStaticRankingPreparationPrograms(servant),
      conditions,
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
  const policyKey = compileRankingComparisonPolicy(conditions, master, basis.npLevel).key;
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
        const bound = finiteSemanticProductBound(programDimensions(domain), remaining);
        if (bound.status === 'limitExceeded')
          return {
            status: 'unsupported',
            attackProfile,
            issue: {
              kind: 'unsupportedFiniteDomain',
              upperBound: upperBound + bound.upperBound,
              supportedMaximum: MAX_RANKING_CANDIDATES_PER_ATTACK_PROFILE,
            },
          };
        upperBound += bound.upperBound;
        readyPrograms.push({ ...domain, upperBound: bound.upperBound });
        programBounds.push({
          programKey: domain.program.key,
          dimensions: programDimensions(domain).map(({ key, values }) => ({
            key,
            cardinality: values.length,
          })),
          upperBound: bound.upperBound,
        });
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
  servant: ServantMaster;
  master: MasterDataSnapshot;
  basis: ResolvedRankingBasis;
  conditions: Pick<RankingPolicyConditions, 'classAffinity' | 'selfBuffs' | 'conditionalEffects'>;
  policyKey: string;
  attackProfile: AttackProfile;
  domain: ProgramCandidateDomain;
}): RankingCandidate[] {
  const { servant, master, basis, conditions, policyKey, attackProfile, domain } = input;
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
      basis,
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
    for (const definition of domain.semantics.inputDefinitions) {
      if (definition.kind !== 'effectStackCount') continue;
      const value = canonicalInputValues[definition.key]!;
      scenario.canonicalInputValues[definition.key] = {
        kind: 'integer',
        value,
        origin:
          conditions.conditionalEffects === 'baseline' || value === definition.defaultValue
            ? 'baseline'
            : value === definition.maximum
              ? 'maximum'
              : 'witness',
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
              (domain.semantics.inputDefinitions.find((definition) => definition.key === key)
                ?.defaultValue ??
                values[0] ??
                canonicalInputValues[key]!),
          ),
        0,
      ),
      targetCandidateKey: target?.key ?? 'target:baseline',
      fieldCandidateKey: field.key,
      quantityCandidateKey: quantity.key,
    };
    const contributionPolicy = compileRankingContributionPolicy(conditions, 'included');
    const withoutAreaContributionPolicy = compileRankingContributionPolicy(conditions, 'excluded');
    const hasAreaContribution = domain.semantics.operations.some(
      (operation) => isAttackerDamageContribution(operation) && isAreaDamageContribution(operation),
    );
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
  servant: ServantMaster;
  master: MasterDataSnapshot;
  basis: ResolvedRankingBasis;
  conditions: Pick<RankingPolicyConditions, 'classAffinity' | 'selfBuffs' | 'conditionalEffects'>;
  space: Extract<RankingCandidateSpace, { status: 'ready' }>;
}): readonly RankingCandidate[] {
  const candidates = input.space.programs.flatMap((domain) =>
    materializeProgramCandidates({
      ...input,
      domain,
      policyKey: input.space.policyKey,
      attackProfile: input.space.attackProfile,
    }),
  );
  if (candidates.length !== input.space.certificate.completeUpperBound)
    throw new TypeError(
      `ranking_candidate_space_materialization_mismatch:${candidates.length}:${input.space.certificate.completeUpperBound}`,
    );
  return candidates;
}
