import { createHash } from 'node:crypto';
import type { MasterDataSnapshot, ServantMaster } from '@fgo-lab/master-data';
import {
  compileCandidateLocalActionAdmissionDispositions,
  type CandidateLocalActionAdmission,
  type StaticRankingProgramDisposition,
} from './rankingActionAdmission';
import { attackProfileKey } from './attackProfile';
import type { RankingPolicyConditions } from './rankingContracts';
import type { RankingCandidateCalculation } from './rankingPolicyCandidates';
import { compileStaticRankingSemantics } from './rankingStaticSemantics';
import { UnsupportedStackQuantity } from './rankingStackDomain';
import {
  compileStaticRankingPreparationPrograms,
  type StaticRankingPreparationProgram,
} from './rankingStaticPreparation';
import type { CalculationExecution } from './scenario';

type EligibilityStatus = 'calculated' | 'unreachable' | 'inputRequired' | 'invalid' | 'unsupported';

export const RANKING_ELIGIBILITY_DIGEST_PARTITION_COUNT = 8;

interface CountMap {
  [key: string]: number;
}

export interface RankingStaticSemanticsInventory {
  servants: number;
  attackProfiles: number;
  sourcePrograms: number;
  sourceUses: number;
  skillSources: number;
  noblePhantasmSources: number;
  effects: number;
  semanticPrograms: number;
  operations: number;
  conditions: number;
  inputDefinitions: number;
  unsupportedPrograms: number;
  invalidPrograms: number;
  sourceKinds: CountMap;
  operationKinds: CountMap;
  digest: string;
}

export interface RankingAdmissionInventory {
  observations: number;
  dispositions: number;
  byPolicy: CountMap;
  byKind: CountMap;
  digest: string;
}

export interface RankingCandidateEligibilityInventory {
  observations: number;
  candidatePlans: number;
  generated: number;
  deduplicated: number;
  upperBound: number;
  maximumSingleProfileUpperBound: number;
  maximumSingleProfileGenerated: number;
  byStatus: Record<EligibilityStatus, number>;
  byPolicy: CountMap;
  candidateSpaceStatus: CountMap;
  digest: string;
}

export interface RankingEligibilityAudit {
  conditionCount: number;
  staticSemantics: RankingStaticSemanticsInventory;
  admissions: RankingAdmissionInventory;
  candidates: RankingCandidateEligibilityInventory;
  digest: string;
}

interface StaticProgramRecord {
  servantKey: string;
  programKey: string;
  attackProfileKey: string;
  sourceKinds: readonly string[];
  sourceEffects: number;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(',')}}`;
}

function digestRecords(records: readonly unknown[]): string {
  const hash = createHash('sha256');
  for (const record of records) hash.update(stableJson(record)).update('\n');
  return hash.digest('hex');
}

export function combineRankingEligibilityPartitionDigests(
  partitions: readonly { partition: number; digest: string }[],
): string {
  const ordered = [...partitions].sort((left, right) => left.partition - right.partition);
  if (ordered.length === 1) {
    const only = ordered[0]!;
    if (
      !Number.isSafeInteger(only.partition) ||
      only.partition < 0 ||
      only.partition >= RANKING_ELIGIBILITY_DIGEST_PARTITION_COUNT ||
      !/^[a-f0-9]{64}$/.test(only.digest)
    )
      throw new TypeError('ranking_eligibility_partition_digest_invalid');
    return only.digest;
  }
  if (ordered.length !== RANKING_ELIGIBILITY_DIGEST_PARTITION_COUNT)
    throw new TypeError('ranking_eligibility_partition_digest_count_mismatch');
  for (const [index, item] of ordered.entries()) {
    if (
      item.partition !== index ||
      !Number.isSafeInteger(item.partition) ||
      !/^[a-f0-9]{64}$/.test(item.digest)
    )
      throw new TypeError('ranking_eligibility_partition_digest_invalid');
  }
  return createHash('sha256')
    .update(JSON.stringify(ordered.map(({ digest }) => digest)))
    .digest('hex');
}

function increment(counts: CountMap, key: string, amount = 1): void {
  counts[key] = (counts[key] ?? 0) + amount;
}

function policyKey(conditions: RankingPolicyConditions): string {
  return `${conditions.population}:${conditions.levelBasis}:${conditions.npLevelBasis.kind}:${conditions.classAffinity}:${conditions.selfBuffs}:${conditions.conditionalEffects}:np${String(
    conditions.npLevelBasis.kind === 'specified' ? conditions.npLevelBasis.npLevel : 'owned',
  )}:oc${String(conditions.initialOvercharge)}`;
}

function statusOf(execution: CalculationExecution): EligibilityStatus {
  switch (execution.result.status) {
    case 'calculated':
      return 'calculated';
    case 'unavailable':
      return 'unreachable';
    case 'inputRequired':
      return 'inputRequired';
    case 'invalid':
      return 'invalid';
    case 'unsupported':
      return 'unsupported';
  }
}

function admissionKey(admission: CandidateLocalActionAdmission): string {
  return admission.kind === 'admitted'
    ? `${admission.kind}:${admission.role}`
    : admission.kind === 'unsupported'
      ? `${admission.kind}:${admission.reason}`
      : admission.kind;
}

function staticProgramRecords(master: MasterDataSnapshot): {
  programsByServant: ReadonlyMap<string, readonly StaticRankingPreparationProgram[]>;
  inventory: RankingStaticSemanticsInventory;
} {
  const programsByServant = new Map<string, readonly StaticRankingPreparationProgram[]>();
  const records: StaticProgramRecord[] = [];
  const sourceKinds: CountMap = {};
  const operationKinds: CountMap = {};
  let attackProfiles = 0;
  let sourceUses = 0;
  let skillSources = 0;
  let noblePhantasmSources = 0;
  let effects = 0;
  let semanticPrograms = 0;
  let operations = 0;
  let conditions = 0;
  let inputDefinitions = 0;
  let unsupportedPrograms = 0;
  let invalidPrograms = 0;

  for (const servant of master.servants) {
    const programs = compileStaticRankingPreparationPrograms(servant);
    programsByServant.set(servant.id, programs);
    attackProfiles += new Set(programs.map(({ attackProfile }) => attackProfileKey(attackProfile)))
      .size;
    for (const program of programs) {
      const sourceKindsForProgram = program.sourceUses.map(({ kind }) => kind);
      records.push({
        servantKey: servant.id,
        programKey: program.key,
        attackProfileKey: attackProfileKey(program.attackProfile),
        sourceKinds: sourceKindsForProgram,
        sourceEffects: program.sourceUses.reduce((sum, source) => sum + source.effects.length, 0),
      });
      sourceUses += program.sourceUses.length;
      effects += program.sourceUses.reduce((sum, source) => sum + source.effects.length, 0);
      for (const source of program.sourceUses) {
        increment(sourceKinds, source.kind);
        if (source.kind === 'skill') skillSources += 1;
        else noblePhantasmSources += 1;
      }
      for (const npLevel of [1, 2, 3, 4, 5] as const) {
        try {
          const semantics = compileStaticRankingSemantics(servant, program, npLevel);
          semanticPrograms += 1;
          operations += semantics.operations.length;
          conditions += semantics.conditions.length;
          inputDefinitions += semantics.inputDefinitions.length;
          for (const operation of semantics.operations) increment(operationKinds, operation.kind);
        } catch (error) {
          if (error instanceof UnsupportedStackQuantity) unsupportedPrograms += 1;
          else invalidPrograms += 1;
        }
      }
    }
  }

  return {
    programsByServant,
    inventory: {
      servants: master.servants.length,
      attackProfiles,
      sourcePrograms: records.length,
      sourceUses,
      skillSources,
      noblePhantasmSources,
      effects,
      semanticPrograms,
      operations,
      conditions,
      inputDefinitions,
      unsupportedPrograms,
      invalidPrograms,
      sourceKinds,
      operationKinds,
      digest: digestRecords(records),
    },
  };
}

function updateAdmissionInventory(
  inventory: {
    observations: number;
    dispositions: number;
    byPolicy: CountMap;
    byKind: CountMap;
    records: unknown[];
  },
  conditions: RankingPolicyConditions,
  servant: ServantMaster,
  dispositions: readonly StaticRankingProgramDisposition[],
): void {
  const policy = policyKey(conditions);
  inventory.observations += 1;
  for (const disposition of dispositions) {
    inventory.dispositions += 1;
    increment(inventory.byPolicy, `${policy}:dispositions`);
    inventory.records.push({
      policy,
      servantKey: servant.id,
      programKey: disposition.programKey,
      attackProfileKey: disposition.attackProfileKey,
      actionAdmissions: disposition.actionAdmissions.map(admissionKey),
    });
    for (const admission of disposition.actionAdmissions) {
      increment(inventory.byKind, admissionKey(admission));
      increment(inventory.byPolicy, `${policy}:${admissionKey(admission)}`);
    }
  }
}

export class RankingEligibilityAuditAccumulator {
  private readonly staticData: ReturnType<typeof staticProgramRecords>;
  private readonly admissionCache = new Map<string, readonly StaticRankingProgramDisposition[]>();
  private readonly admission = {
    observations: 0,
    dispositions: 0,
    byPolicy: {} as CountMap,
    byKind: {} as CountMap,
    records: [] as unknown[],
  };
  private readonly candidate = {
    observations: 0,
    candidatePlans: 0,
    generated: 0,
    deduplicated: 0,
    upperBound: 0,
    maximumSingleProfileUpperBound: 0,
    maximumSingleProfileGenerated: 0,
    byStatus: {
      calculated: 0,
      unreachable: 0,
      inputRequired: 0,
      invalid: 0,
      unsupported: 0,
    } as Record<EligibilityStatus, number>,
    byPolicy: {} as CountMap,
    candidateSpaceStatus: {} as CountMap,
    hashes: new Map<number, ReturnType<typeof createHash>>(),
  };
  private readonly conditionKeys = new Set<string>();

  constructor(master: MasterDataSnapshot) {
    this.staticData = staticProgramRecords(master);
  }

  observe(
    master: MasterDataSnapshot,
    servant: ServantMaster,
    conditions: RankingPolicyConditions,
    candidateSet: RankingCandidateCalculation,
    digestPartition: number,
  ): void {
    if (
      !Number.isSafeInteger(digestPartition) ||
      digestPartition < 0 ||
      digestPartition >= RANKING_ELIGIBILITY_DIGEST_PARTITION_COUNT
    )
      throw new TypeError(`ranking_eligibility_partition_invalid:${String(digestPartition)}`);
    const programs = this.staticData.programsByServant.get(servant.id);
    if (!programs) throw new TypeError(`ranking_eligibility_servant_missing:${servant.id}`);
    const npLevel = candidateSet.plan.basis.npLevel;
    const gaugePerStage = master.npResourceSemantics.noblePhantasmUse.baseOvercharge.gaugePerStage;
    const admissionCacheKey = `${servant.id}:${npLevel}:${conditions.initialOvercharge}:${conditions.selfBuffs}:${conditions.conditionalEffects}`;
    let dispositions = this.admissionCache.get(admissionCacheKey);
    if (!dispositions) {
      dispositions = compileCandidateLocalActionAdmissionDispositions(programs, conditions, {
        semantics: master.npResourceSemantics,
        npLevel,
        initialGauge: conditions.initialOvercharge * gaugePerStage,
        automaticEffects: servant.passives.flatMap((passive) => passive.effects),
      });
      this.admissionCache.set(admissionCacheKey, dispositions);
    }
    updateAdmissionInventory(this.admission, conditions, servant, dispositions);
    this.conditionKeys.add(this.conditionKey(conditions));
    this.candidate.observations += 1;
    const policy = policyKey(conditions);
    const planKeys = new Set(candidateSet.plan.candidateKeys);
    this.candidate.candidatePlans += 1;
    this.candidate.generated += candidateSet.plan.candidateKeys.length;
    this.candidate.deduplicated += planKeys.size;
    this.candidate.upperBound += candidateSet.plan.candidateUpperBound;
    increment(
      this.candidate.byPolicy,
      `${policy}:generated`,
      candidateSet.plan.candidateKeys.length,
    );
    increment(
      this.candidate.byPolicy,
      `${policy}:upperBound`,
      candidateSet.plan.candidateUpperBound,
    );
    for (const space of candidateSet.plan.candidateSpaces) {
      increment(this.candidate.candidateSpaceStatus, space.status);
      if (space.status === 'ready') {
        this.candidate.maximumSingleProfileUpperBound = Math.max(
          this.candidate.maximumSingleProfileUpperBound,
          space.upperBound,
        );
        const generated = candidateSet.plan.attackProfiles.filter(
          (attackProfile) =>
            attackProfileKey(attackProfile) === attackProfileKey(space.attackProfile),
        ).length;
        this.candidate.maximumSingleProfileGenerated = Math.max(
          this.candidate.maximumSingleProfileGenerated,
          generated,
        );
      }
    }
    for (const [index, candidateKey] of candidateSet.plan.candidateKeys.entries()) {
      const execution = candidateSet.executions[index];
      if (!execution) throw new TypeError(`ranking_eligibility_execution_missing:${candidateKey}`);
      const status = statusOf(execution);
      this.candidate.byStatus[status] += 1;
      increment(this.candidate.byPolicy, `${policy}:${status}`);
      let hash = this.candidate.hashes.get(digestPartition);
      if (!hash) {
        hash = createHash('sha256');
        this.candidate.hashes.set(digestPartition, hash);
      }
      hash
        .update(policy)
        .update('\0')
        .update(servant.id)
        .update('\0')
        .update(candidateKey)
        .update('\0')
        .update(candidateSet.plan.candidateEvidence[index]?.attackProfileKey ?? '')
        .update('\0')
        .update(candidateSet.plan.preparationPlanKeys[index] ?? '')
        .update('\0')
        .update(String(candidateSet.plan.startNpGauges[index] ?? ''))
        .update('\0')
        .update(status)
        .update('\n');
    }
  }

  private conditionKey(conditions: RankingPolicyConditions): string {
    return policyKey(conditions);
  }

  finalize(): RankingEligibilityAudit {
    const staticSemantics = this.staticData.inventory;
    const admissions: RankingAdmissionInventory = {
      observations: this.admission.observations,
      dispositions: this.admission.dispositions,
      byPolicy: this.admission.byPolicy,
      byKind: this.admission.byKind,
      digest: digestRecords(this.admission.records),
    };
    const candidates: RankingCandidateEligibilityInventory = {
      observations: this.candidate.observations,
      candidatePlans: this.candidate.candidatePlans,
      generated: this.candidate.generated,
      deduplicated: this.candidate.deduplicated,
      upperBound: this.candidate.upperBound,
      maximumSingleProfileUpperBound: this.candidate.maximumSingleProfileUpperBound,
      maximumSingleProfileGenerated: this.candidate.maximumSingleProfileGenerated,
      byStatus: this.candidate.byStatus,
      byPolicy: this.candidate.byPolicy,
      candidateSpaceStatus: this.candidate.candidateSpaceStatus,
      digest: combineRankingEligibilityPartitionDigests(
        [...this.candidate.hashes].map(([partition, hash]) => ({
          partition,
          digest: hash.digest('hex'),
        })),
      ),
    };
    return {
      conditionCount: this.conditionKeys.size,
      staticSemantics,
      admissions,
      candidates,
      digest: digestRecords([
        { conditionCount: this.conditionKeys.size, staticSemantics, admissions, candidates },
      ]),
    };
  }
}
