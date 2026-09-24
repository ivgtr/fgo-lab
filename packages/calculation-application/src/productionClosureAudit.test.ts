import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { createTsk065ProductionAuditSource } from '@fgo-lab/master-data/production-audit';
import type {
  ProductionPreparationTransactionAction,
  ProductionPreparationTransactionObservation,
  ProductionUserControlObservation,
} from './productionParityDiagnostics';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import fixture from '../../test-fixtures/master/fixture.json';
import tsk065Evidence from '../../../docs/evidence/tsk-06-5-production-closure.json';
import {
  auditProductionClosure,
  productionClosureConditionKey,
  productionClosureConditions,
} from './productionClosureAudit';
import {
  evaluateProductionFinalOutcomeGate,
  auditProductionPreparationTransactionObservations,
  compareProductionParity,
  evaluateProductionPreparationTransactionGate,
  evaluateProductionParityGate,
  auditProductionUserControlObservations,
  productionFinalOutcomeShardDifference,
} from './productionParityDiagnostics';
import { combineRankingEligibilityPartitionDigests } from './rankingEligibilityAudit';
import {
  productionAuditTestOptions,
  writeProductionAuditArtifact,
} from './productionAuditArtifacts';

async function writeProductionClosureDiagnosticArtifact(
  taskMetadata: unknown,
  path: string,
  value: unknown,
) {
  return writeProductionAuditArtifact(taskMetadata, path, value);
}

async function writeParityDiagnosticArtifact(taskMetadata: unknown, value: unknown): Promise<void> {
  await writeProductionClosureDiagnosticArtifact(
    taskMetadata,
    'production-closure-parity-diagnostics.json',
    value,
  );
}

async function writePreparationTransactionDiagnosticArtifact(
  taskMetadata: unknown,
  value: unknown,
): Promise<void> {
  await writeProductionClosureDiagnosticArtifact(
    taskMetadata,
    'production-preparation-transaction-diagnostics.json',
    value,
  );
}

async function writeUserControlDiagnosticArtifact(
  taskMetadata: unknown,
  value: unknown,
): Promise<void> {
  await writeProductionClosureDiagnosticArtifact(
    taskMetadata,
    'production-inert-control-fixture.json',
    value,
  );
}

it('combines eligibility partition digests in canonical order and rejects incomplete merges', () => {
  const partitions = Array.from({ length: 8 }, (_, partition) => ({
    partition,
    digest: createHash('sha256')
      .update(`eligibility-partition-${String(partition)}`)
      .digest('hex'),
  }));
  const expected = createHash('sha256')
    .update(JSON.stringify(partitions.map(({ digest }) => digest)))
    .digest('hex');

  expect(combineRankingEligibilityPartitionDigests([...partitions].reverse())).toBe(expected);
  expect(combineRankingEligibilityPartitionDigests([partitions[3]!])).toBe(partitions[3]!.digest);
  expect(() => combineRankingEligibilityPartitionDigests(partitions.slice(0, 7))).toThrow(
    'ranking_eligibility_partition_digest_count_mismatch',
  );
  expect(() =>
    combineRankingEligibilityPartitionDigests(
      partitions.map((partition, index) =>
        index === 7 ? { ...partition, partition: 6 } : partition,
      ),
    ),
  ).toThrow('ranking_eligibility_partition_digest_invalid');
});

it(
  'constructs exactly the 80 legal production conditions and reuses one supplied inventory',
  productionAuditTestOptions(['production-closure-parity-diagnostics.json']),
  async ({ task }) => {
    const conditions = productionClosureConditions();
    const conditionCount = conditions.length;
    const uniqueConditionCount = new Set(conditions.map(productionClosureConditionKey)).size;
    const conditionInputsLegal = conditions.every(
      (condition) =>
        condition.npLevelBasis.kind === 'specified' &&
        condition.initialOvercharge <=
          (condition.npLevelBasis.npLevel === 1 ? 1 : condition.npLevelBasis.npLevel === 5 ? 3 : 2),
    );

    const master = masterSnapshotSchema.parse(fixture);
    const preparationObservations: ProductionPreparationTransactionObservation[] = [];
    const audit = await auditProductionClosure(
      master,
      { servantBuilds: {} },
      {
        schemaVersion: SCHEMA_VERSION,
        engineVersion: ENGINE_VERSION,
        appVersion: APP_VERSION,
        masterDataVersion: master.version,
        gameRegion: 'JP',
        masterDataLocale: 'ja-JP',
      },
      ({ records, ...summary }) => {
        for (const value of records) {
          if (
            typeof value === 'object' &&
            value !== null &&
            'status' in value &&
            value.status === 'calculated' &&
            'profileKey' in value &&
            typeof value.profileKey === 'string' &&
            'scenario' in value &&
            typeof value.scenario === 'object' &&
            value.scenario !== null &&
            'preNoblePhantasmPlan' in value.scenario &&
            Array.isArray(value.scenario.preNoblePhantasmPlan) &&
            'appliedPreparationActions' in value &&
            Array.isArray(value.appliedPreparationActions)
          )
            preparationObservations.push({
              conditionKey: summary.key,
              profileKey: value.profileKey,
              commands: value.scenario
                .preNoblePhantasmPlan as ProductionPreparationTransactionObservation['commands'],
              actions:
                value.appliedPreparationActions as ProductionPreparationTransactionObservation['actions'],
            });
        }
      },
      conditions.slice(0, 1),
    );
    const preparationTransactionAudit =
      auditProductionPreparationTransactionObservations(preparationObservations);
    const preparationGate = evaluateProductionPreparationTransactionGate({
      expectedCalculatedProfiles: audit.outcomes.calculated,
      ...preparationTransactionAudit,
    });

    const canonicalFailure = compareProductionParity({
      conditionKey: 'fixture-condition',
      profileKey: 'fixture-profile',
      path: 'portable',
      actualStatus: 'executable',
      expected: { scenario: { phase: 'expected', value: 1 } },
      actual: { scenario: { phase: 'actual', value: 1 } },
    });
    const statusFailure = compareProductionParity({
      conditionKey: 'fixture-condition',
      profileKey: 'fixture-profile',
      path: 'calculator',
      actualStatus: 'rejected',
      expected: { scenario: { phase: 'expected', value: 1 } },
      actual: null,
    });
    const matchingParity = compareProductionParity({
      conditionKey: 'fixture-condition',
      profileKey: 'fixture-profile',
      path: 'calculator',
      actualStatus: 'executable',
      expected: { scenario: { phase: 'same' } },
      actual: { scenario: { phase: 'same' } },
    });
    const source = createTsk065ProductionAuditSource(tsk065Evidence, {
      masterDataVersion: 'fixture-master',
      artifact: 'docs/evidence/tsk-06-5-production-closure.json',
    });
    const matrixInput = {
      conditionCount: source.matrix.conditionCount,
      attackProfileCount: source.matrix.attackProfileCount,
      outcomeCount: source.matrix.outcomeCount,
      outcomes: source.matrix.outcomes,
      parityCount: source.matrix.parityCount,
      digest: source.matrix.mergedDigest,
      eligibility: { candidates: { digest: source.matrix.eligibilityDigest } },
    };
    const parityGate = evaluateProductionParityGate(source, {
      ...matrixInput,
      parityFailures: canonicalFailure ? [canonicalFailure] : [],
    });
    const passingParityGate = evaluateProductionParityGate(source, {
      ...matrixInput,
      parityFailures: [],
    });
    const digestMismatch = evaluateProductionParityGate(source, {
      ...matrixInput,
      digest: '0'.repeat(64),
      parityFailures: [],
    });
    const eligibilityMismatch = evaluateProductionParityGate(source, {
      ...matrixInput,
      eligibility: { candidates: { digest: '0'.repeat(64) } },
      parityFailures: [],
    });
    const missingEligibilityMismatch = evaluateProductionParityGate(source, {
      ...matrixInput,
      eligibility: {} as typeof matrixInput.eligibility,
      parityFailures: [],
    });
    await writeParityDiagnosticArtifact(task.meta, {
      schemaVersion: 1,
      boundary: 'calculation-application-production-parity',
      source: 'productionClosureAudit.test.ts',
      audit,
      preparationObservations,
      preparationGate,
      passingParityGate,
      parityGate,
      digestMismatch,
      eligibilityMismatch,
      missingEligibilityMismatch,
      comparisons: { canonicalFailure, statusFailure, matchingParity },
      failures: [canonicalFailure, statusFailure].filter(Boolean),
      firstDifference: canonicalFailure?.firstDifference,
    });
    expect(conditionCount).toBe(80);
    expect(uniqueConditionCount).toBe(80);
    expect(conditionInputsLegal).toBe(true);
    expect(audit).toMatchObject({
      conditionCount: 1,
      outcomeCount: audit.attackProfileCount,
      outcomes: { invalid: 0, unsupported: 0, inputRequired: 0 },
      parityFailures: [],
    });
    expect(audit.parityCount).toBe(audit.outcomes.calculated);
    expect(audit.eligibility.conditionCount).toBe(1);
    expect(audit.eligibility.staticSemantics.servants).toBe(master.servants.length);
    expect(audit.eligibility.staticSemantics.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(audit.eligibility.admissions.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(audit.eligibility.candidates.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(audit.eligibility.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(audit.eligibility.staticSemantics.sourcePrograms).toBeGreaterThan(0);
    expect(audit.eligibility.admissions.dispositions).toBeGreaterThan(0);
    expect(audit.eligibility.candidates.generated).toBeGreaterThan(0);
    expect(preparationGate).toMatchObject({
      status: 'passed',
      summary: {
        calculatedProfiles: audit.outcomes.calculated,
        commandCount: preparationObservations.reduce(
          (count, observation) => count + observation.commands.length,
          0,
        ),
        actionCount: preparationObservations.reduce(
          (count, observation) => count + observation.actions.length,
          0,
        ),
      },
      firstDifference: null,
    });
    expect(canonicalFailure).toMatchObject({
      reason: 'canonicalMismatch',
      canonicalIdentity: 'production:fixture-condition:profile:fixture-profile:parity:portable',
      firstDifference: {
        identity: 'production:fixture-condition:profile:fixture-profile:parity:portable',
        path: 'scenario.phase',
        expected: 'expected',
        actual: 'actual',
      },
    });
    expect(statusFailure).toMatchObject({
      reason: 'executionNotExecutable',
      firstDifference: { path: 'status', expected: 'executable', actual: 'rejected' },
    });
    expect(matchingParity).toBeNull();
    expect(passingParityGate).toMatchObject({
      status: 'passed',
      canonicalIdentity: 'tsk-06.5:production-matrix',
      firstDifference: null,
    });
    expect(parityGate).toMatchObject({
      status: 'failed',
      reason: 'parityFailure',
      canonicalIdentity: 'tsk-06.5:production-matrix',
      firstDifference: {
        identity: 'tsk-06.5:production-matrix',
        path: 'parityFailures',
        expected: 0,
        actual: 1,
      },
      failures: [canonicalFailure],
    });
    expect(digestMismatch).toMatchObject({
      status: 'failed',
      reason: 'matrixMismatch',
      firstDifference: {
        identity: 'tsk-06.5:production-matrix',
        path: 'digest',
        expected: source.matrix.mergedDigest,
        actual: '0'.repeat(64),
      },
      failures: [],
    });
    expect(eligibilityMismatch).toMatchObject({
      status: 'failed',
      reason: 'matrixMismatch',
      firstDifference: {
        identity: 'tsk-06.5:production-matrix',
        path: 'eligibilityDigest',
        expected: source.matrix.eligibilityDigest,
        actual: '0'.repeat(64),
      },
    });
    expect(missingEligibilityMismatch).toMatchObject({
      status: 'failed',
      reason: 'matrixMismatch',
      firstDifference: {
        identity: 'tsk-06.5:production-matrix',
        path: 'eligibilityDigest',
        expected: source.matrix.eligibilityDigest,
        actual: undefined,
      },
    });
  },
);

it(
  'fails closed on final profile statuses and retains unique profile identities',
  productionAuditTestOptions(['production-final-outcome-diagnostics.json']),
  async ({ task }) => {
    const passing = evaluateProductionFinalOutcomeGate({
      outcomes: { unsupported: 0, invalid: 0, inputRequired: 0 },
      failures: [],
    });
    const missingShardGateDifference = productionFinalOutcomeShardDifference(undefined, 3);
    const missingFirstDifferenceGate = Object.fromEntries(
      Object.entries(passing).filter(([key]) => key !== 'firstDifference'),
    );
    const missingFirstDifferenceShardDifference = productionFinalOutcomeShardDifference(
      missingFirstDifferenceGate,
      2,
    );
    const mismatchedShardGateDifference = productionFinalOutcomeShardDifference(
      { ...passing, actual: { unsupported: 1, invalid: 0, inputRequired: 0 } },
      1,
    );
    const failed = evaluateProductionFinalOutcomeGate({
      outcomes: { unsupported: 1, invalid: 1, inputRequired: 1 },
      failures: [
        {
          conditionKey: 'fixture-condition',
          profileKey: 'fixture-profile-u',
          status: 'unsupported',
        },
        { conditionKey: 'fixture-condition', profileKey: 'fixture-profile-i', status: 'invalid' },
        {
          conditionKey: 'fixture-condition',
          profileKey: 'fixture-profile-r',
          status: 'inputRequired',
        },
      ],
    });
    const missingIdentity = evaluateProductionFinalOutcomeGate({
      outcomes: { unsupported: 1, invalid: 0, inputRequired: 0 },
      failures: [],
    });
    const duplicateIdentity = evaluateProductionFinalOutcomeGate({
      outcomes: { unsupported: 2, invalid: 0, inputRequired: 0 },
      failures: [
        { conditionKey: 'fixture-condition', profileKey: 'fixture-profile', status: 'unsupported' },
        { conditionKey: 'fixture-condition', profileKey: 'fixture-profile', status: 'unsupported' },
      ],
    });
    await writeProductionClosureDiagnosticArtifact(
      task.meta,
      'production-final-outcome-diagnostics.json',
      {
        schemaVersion: 1,
        boundary: 'calculation-application-final-profile-outcomes',
        canonicalIdentity: passing.canonicalIdentity,
        passing,
        shardObservations: [
          { shardIndex: 0, gate: passing, difference: null },
          { shardIndex: 3, gate: undefined, difference: missingShardGateDifference },
          {
            shardIndex: 2,
            gate: missingFirstDifferenceGate,
            difference: missingFirstDifferenceShardDifference,
          },
          {
            shardIndex: 1,
            gate: { ...passing, actual: { unsupported: 1, invalid: 0, inputRequired: 0 } },
            difference: mismatchedShardGateDifference,
          },
        ],
        intentionalFailures: [failed, missingIdentity, duplicateIdentity],
      },
    );
    expect(passing).toMatchObject({
      status: 'passed',
      canonicalIdentity: 'tsk-06.5:final-profile-outcomes',
      firstDifference: null,
      failures: [],
    });
    expect(productionFinalOutcomeShardDifference(passing, 0)).toBeNull();
    expect(missingShardGateDifference).toMatchObject({
      identity: 'tsk-08:final-profile-shard:3',
      path: 'canonicalIdentity',
      expected: 'tsk-06.5:final-profile-outcomes',
      actual: null,
    });
    expect(missingFirstDifferenceShardDifference).toMatchObject({
      identity: 'tsk-08:final-profile-shard:2',
      path: 'hasFirstDifference',
      expected: true,
      actual: false,
    });
    expect(mismatchedShardGateDifference).toMatchObject({
      identity: 'tsk-08:final-profile-shard:1',
      path: 'validGateState',
      expected: true,
      actual: false,
    });
    expect(productionFinalOutcomeShardDifference(failed, 4)).toBeNull();
    expect(failed).toMatchObject({
      status: 'failed',
      canonicalIdentity: 'tsk-06.5:final-profile-outcomes',
      firstDifference: {
        identity: 'tsk-06.5:final-profile-outcomes',
        path: 'inputRequired',
        expected: 0,
        actual: 1,
      },
      failures: [
        {
          reason: 'finalProfileStatusPresent',
          canonicalIdentity: 'production:fixture-condition:profile:fixture-profile-u:final-outcome',
          conditionKey: 'fixture-condition',
          profileKey: 'fixture-profile-u',
          status: 'unsupported',
          expected: 'calculated',
          actual: 'unsupported',
          firstDifference: { path: 'status', expected: 'calculated', actual: 'unsupported' },
        },
        {
          reason: 'finalProfileStatusPresent',
          canonicalIdentity: 'production:fixture-condition:profile:fixture-profile-i:final-outcome',
          conditionKey: 'fixture-condition',
          profileKey: 'fixture-profile-i',
          status: 'invalid',
          expected: 'calculated',
          actual: 'invalid',
        },
        {
          reason: 'finalProfileStatusPresent',
          canonicalIdentity: 'production:fixture-condition:profile:fixture-profile-r:final-outcome',
          conditionKey: 'fixture-condition',
          profileKey: 'fixture-profile-r',
          status: 'inputRequired',
          expected: 'calculated',
          actual: 'inputRequired',
        },
      ],
    });
    expect(missingIdentity).toMatchObject({
      status: 'failed',
      failures: [
        {
          reason: 'finalProfileOutcomeIdentityMismatch',
          canonicalIdentity: 'tsk-06.5:final-profile-outcomes',
        },
      ],
    });
    expect(duplicateIdentity).toMatchObject({
      status: 'failed',
      failures: [
        {
          reason: 'finalProfileOutcomeIdentityMismatch',
          firstDifference: { path: 'distinctProfileFailures', expected: 2, actual: 1 },
        },
        {
          reason: 'finalProfileStatusPresent',
          canonicalIdentity: 'production:fixture-condition:profile:fixture-profile:final-outcome',
          status: 'unsupported',
        },
        {
          reason: 'finalProfileStatusPresent',
          canonicalIdentity: 'production:fixture-condition:profile:fixture-profile:final-outcome',
          status: 'unsupported',
        },
      ],
    });
  },
);

it(
  'ties production preparation commands to their committed action and NP-use receipt',
  productionAuditTestOptions(['production-preparation-transaction-diagnostics.json']),
  async ({ task }) => {
    const skillCommand = {
      kind: 'useSkillSlot',
      slot: 1,
      skillLevel: 10,
      choice: null,
    } as const;
    const attackCommand = { kind: 'executeAttackNoblePhantasm' } as const;
    const initialResource = { npLevel: 1 as const, capacity: 10_000, gauge: 10_000 };
    const consumedResource = { ...initialResource, gauge: 0 };
    const receipt = {
      actionId: 'preparation:1:executeAttackNoblePhantasm',
      gaugeBefore: 10_000,
      baseOc: 1,
      boostTotal: 0,
      effectiveOc: 1,
      participatingInstances: [],
      excludedInstances: [],
      boostUses: [],
    };
    const skillAction: ProductionPreparationTransactionAction = {
      command: skillCommand,
      sourceKind: 'skill',
      baseOvercharge: null,
      ocUse: null,
      resourceBefore: initialResource,
      resourceAfter: initialResource,
    };
    const attackAction: ProductionPreparationTransactionAction = {
      command: attackCommand,
      sourceKind: 'attackNoblePhantasm',
      baseOvercharge: 1,
      ocUse: receipt,
      resourceBefore: initialResource,
      resourceAfter: consumedResource,
    };
    const observation = {
      conditionKey: 'fixture-condition',
      profileKey: 'fixture-profile',
      commands: [skillCommand, attackCommand],
      actions: [skillAction, attackAction],
    };
    const audit = auditProductionPreparationTransactionObservations([observation]);
    const passing = evaluateProductionPreparationTransactionGate({
      expectedCalculatedProfiles: 1,
      ...audit,
    });
    const staleReceiptAction = {
      ...attackAction,
      ocUse: { ...receipt, actionId: 'preparation:0:executeAttackNoblePhantasm' },
    };
    const staleReceiptObservation = { ...observation, actions: [skillAction, staleReceiptAction] };
    const failedAudit = auditProductionPreparationTransactionObservations([
      staleReceiptObservation,
    ]);
    const failed = evaluateProductionPreparationTransactionGate({
      expectedCalculatedProfiles: 1,
      ...failedAudit,
    });
    const missingProfile = evaluateProductionPreparationTransactionGate({
      expectedCalculatedProfiles: 2,
      ...audit,
    });
    const discontinuousResourceObservation = {
      ...observation,
      actions: [
        { ...skillAction, resourceAfter: { ...initialResource, gauge: 15_000 } },
        attackAction,
      ],
    };
    const discontinuousResourceAudit = auditProductionPreparationTransactionObservations([
      discontinuousResourceObservation,
    ]);
    const discontinuousResource = evaluateProductionPreparationTransactionGate({
      expectedCalculatedProfiles: 1,
      ...discontinuousResourceAudit,
    });
    await writePreparationTransactionDiagnosticArtifact(task.meta, {
      schemaVersion: 1,
      boundary: 'calculation-application-production-preparation-transaction',
      source: 'productionClosureAudit.test.ts',
      canonicalIdentity: 'tsk-08:preparation-transactions',
      observations: [observation, staleReceiptObservation, discontinuousResourceObservation],
      audit,
      failedAudit,
      discontinuousResourceAudit,
      passing,
      intentionalFailures: [failed, missingProfile, discontinuousResource],
    });
    expect(passing).toMatchObject({
      status: 'passed',
      canonicalIdentity: 'tsk-08:preparation-transactions',
      summary: {
        calculatedProfiles: 1,
        commandCount: 2,
        actionCount: 2,
        npUseReceiptCount: 1,
      },
      firstDifference: null,
      failures: [],
    });
    expect(failed).toMatchObject({
      status: 'failed',
      firstDifference: {
        identity: 'production:fixture-condition:profile:fixture-profile:preparation:action:1',
        path: 'actionId',
        expected: 'preparation:1:executeAttackNoblePhantasm',
        actual: 'preparation:0:executeAttackNoblePhantasm',
      },
      failures: [
        {
          reason: 'preparationReceiptMismatch',
          canonicalIdentity:
            'production:fixture-condition:profile:fixture-profile:preparation:action:1',
        },
      ],
    });
    expect(missingProfile).toMatchObject({
      status: 'failed',
      firstDifference: {
        identity: 'tsk-08:preparation-transactions',
        path: 'calculatedProfiles',
        expected: 2,
        actual: 1,
      },
      failures: [
        {
          reason: 'preparationProfileCoverageMismatch',
          canonicalIdentity: 'tsk-08:preparation-transactions',
        },
      ],
    });
    expect(discontinuousResourceAudit.failures).toMatchObject([
      {
        reason: 'preparationResourceSequenceMismatch',
        canonicalIdentity:
          'production:fixture-condition:profile:fixture-profile:preparation:action:1',
        firstDifference: { path: 'gauge', expected: 15_000, actual: 10_000 },
      },
    ]);
    expect(discontinuousResource).toMatchObject({ status: 'failed' });
  },
);

it(
  'requires user controls to reach their ordered operation or bound damage input',
  productionAuditTestOptions(['production-inert-control-fixture.json']),
  async ({ task }) => {
    const identity: ProductionUserControlObservation['identity'] = {
      ownerId: 'fixture-servant',
      profileKey: 'fixture-profile',
      path: 'selectedProfile',
      projectionKey: 'np:fixture:traitCount:trait:burn',
      operationId: 'np:fixture:damage',
      contributionId: 'np:fixture:damage:npSpecial',
      modifier: 'npSpecial',
      contributionControl: 'worldAssumption',
    };
    const event = (
      projectionKey: string,
      projectionOutcome: ProductionUserControlObservation['enabled']['operationEvents'][number]['projectionOutcome'],
    ): ProductionUserControlObservation['enabled']['operationEvents'][number] => ({
      projectionKey,
      operationId: identity.operationId,
      contributionId: 'np:fixture:damage:npBase',
      kind: 'executeNpDamage',
      operationOutcome: 'applied',
      projectionOutcome,
      projectionValuePermille: null,
    });
    const executionObservation = (
      operationEvents: readonly ProductionUserControlObservation['enabled']['operationEvents'][number][],
    ): ProductionUserControlObservation['enabled']['executionObservation'] => ({
      battlePointWitness: null,
      targetExecution: {
        selection: 'selected',
        candidateIndex: 0,
        targetCandidate: {
          classId: 'saber',
          attribute: 'man',
          families: [],
          facts: [],
        },
        operationEvents: operationEvents.map((operationEvent, sequence) => ({
          sequence,
          operationId: operationEvent.operationId,
          projectionKey: operationEvent.projectionKey,
          contributionId: operationEvent.contributionId,
          operationKind: operationEvent.kind,
          operationOutcome: operationEvent.operationOutcome,
          projectionOutcome: operationEvent.projectionOutcome,
          condition: 'satisfied',
          projectionValuePermille: operationEvent.projectionValuePermille,
        })),
      },
    });
    const projection = (
      outcome: ProductionUserControlObservation['enabled']['projections'][number]['outcome'],
    ): ProductionUserControlObservation['enabled']['projections'][number] => ({
      projectionKey: identity.projectionKey,
      operationId: identity.operationId,
      contributionId: identity.contributionId,
      outcome,
      valuePermille: 1_500,
    });
    const contribution = (
      effective: boolean,
      executionOutcome: ProductionUserControlObservation['enabled']['effectiveContributions'][number]['executionOutcome'],
    ): ProductionUserControlObservation['enabled']['effectiveContributions'][number] => ({
      operationId: identity.operationId,
      contributionId: identity.contributionId!,
      modifier: 'npSpecial',
      resolvedValue: null,
      executionOutcome,
      effective,
    });
    const observation: ProductionUserControlObservation = {
      identity,
      enabled: {
        executionObservation: executionObservation([event('np:fixture:operation', 'applied')]),
        operationEvents: [event('np:fixture:operation', 'applied')],
        projections: [projection('applied')],
        inputBinding: {
          kind: 'bound',
          address: 'npSpecialMultipliers',
          value: [1.5, 1.5, 1.5, 1.5, 1.5],
        },
        effectiveContributions: [contribution(true, 'applied')],
        damageResult: { status: 'calculated', rows: [{ average: 1_500 }] },
      },
      excluded: {
        executionObservation: executionObservation([event('np:fixture:operation', 'notApplied')]),
        operationEvents: [event('np:fixture:operation', 'notApplied')],
        projections: [projection('notApplied')],
        inputBinding: {
          kind: 'bound',
          address: 'npSpecialMultipliers',
          value: [1, 1, 1, 1, 1],
        },
        effectiveContributions: [contribution(false, 'notApplied')],
        damageResult: { status: 'calculated', rows: [{ average: 1_000 }] },
      },
    };
    const passing = auditProductionUserControlObservations({
      expectedProjectionCount: 1,
      observations: [observation],
    });
    const inertNpSpecialObservation: ProductionUserControlObservation = {
      ...observation,
      excluded: {
        ...observation.excluded,
        executionObservation: executionObservation([event('np:fixture:operation', 'applied')]),
        operationEvents: [event('np:fixture:operation', 'applied')],
        projections: [projection('applied')],
        inputBinding: observation.enabled.inputBinding,
        effectiveContributions: [contribution(true, 'applied')],
        damageResult: observation.enabled.damageResult,
      },
    };
    const inertNpSpecial = auditProductionUserControlObservations({
      expectedProjectionCount: 1,
      observations: [inertNpSpecialObservation],
    });

    const modifierContributionId = 'skill:fixture:operation:modifier' as const;
    const modifierIdentity: ProductionUserControlObservation['identity'] = {
      ...identity,
      projectionKey: 'skill:fixture:attackBuff',
      operationId: 'skill:fixture:operation',
      contributionId: modifierContributionId,
      modifier: 'attackBuff',
      contributionControl: 'operation' as const,
    };
    const inertModifier: ProductionUserControlObservation = {
      identity: modifierIdentity,
      enabled: {
        executionObservation: executionObservation([
          {
            projectionKey: modifierIdentity.projectionKey,
            operationId: modifierIdentity.operationId,
            contributionId: modifierContributionId,
            kind: 'addModifier',
            operationOutcome: 'applied',
            projectionOutcome: 'applied',
            projectionValuePermille: 200,
          },
        ]),
        operationEvents: [
          {
            projectionKey: modifierIdentity.projectionKey,
            operationId: modifierIdentity.operationId,
            contributionId: modifierContributionId,
            kind: 'addModifier',
            operationOutcome: 'applied',
            projectionOutcome: 'applied',
            projectionValuePermille: 200,
          },
        ],
        projections: [
          {
            projectionKey: modifierIdentity.projectionKey,
            operationId: modifierIdentity.operationId,
            contributionId: modifierIdentity.contributionId,
            outcome: 'applied',
            valuePermille: 200,
          },
        ],
        inputBinding: { kind: 'bound', address: 'attackBuff', value: 0.2 },
        effectiveContributions: [
          {
            operationId: modifierIdentity.operationId,
            contributionId: modifierContributionId,
            modifier: 'attackBuff',
            resolvedValue: 200,
            executionOutcome: 'applied',
            effective: true,
          },
        ],
        damageResult: { status: 'calculated', rows: [{ average: 1_200 }] },
      },
      excluded: {
        executionObservation: executionObservation([
          {
            projectionKey: modifierIdentity.projectionKey,
            operationId: modifierIdentity.operationId,
            contributionId: modifierIdentity.contributionId,
            kind: 'addModifier',
            operationOutcome: 'applied',
            projectionOutcome: 'applied',
            projectionValuePermille: 200,
          },
        ]),
        operationEvents: [
          {
            projectionKey: modifierIdentity.projectionKey,
            operationId: modifierIdentity.operationId,
            contributionId: modifierIdentity.contributionId,
            kind: 'addModifier',
            operationOutcome: 'applied',
            projectionOutcome: 'applied',
            projectionValuePermille: 200,
          },
        ],
        projections: [
          {
            projectionKey: modifierIdentity.projectionKey,
            operationId: modifierIdentity.operationId,
            contributionId: modifierIdentity.contributionId,
            outcome: 'applied',
            valuePermille: 200,
          },
        ],
        inputBinding: { kind: 'bound', address: 'attackBuff', value: 0.2 },
        effectiveContributions: [
          {
            operationId: modifierIdentity.operationId,
            contributionId: modifierContributionId,
            modifier: 'attackBuff',
            resolvedValue: 200,
            executionOutcome: 'applied',
            effective: true,
          },
        ],
        damageResult: { status: 'calculated', rows: [{ average: 1_200 }] },
      },
    };
    const inertOperation = auditProductionUserControlObservations({
      expectedProjectionCount: 1,
      observations: [inertModifier],
    });
    const unresolvedSelectionObservation: ProductionUserControlObservation = {
      ...observation,
      enabled: {
        ...observation.enabled,
        executionObservation: {
          battlePointWitness: null,
          targetExecution: {
            selection: 'unresolved',
            targetResolution: { kind: 'impossible', sourceKeys: ['fixture-target'] },
            operationEvents: [],
          },
        },
      },
    };
    const unresolvedSelection = auditProductionUserControlObservations({
      expectedProjectionCount: 1,
      observations: [unresolvedSelectionObservation],
    });
    const auditOne = (candidate: ProductionUserControlObservation) =>
      auditProductionUserControlObservations({
        expectedProjectionCount: 1,
        observations: [candidate],
      });
    const nonAppliedEvent: ProductionUserControlObservation['excluded']['operationEvents'][number] =
      {
        ...inertModifier.excluded.operationEvents[0]!,
        operationOutcome: 'notApplied',
        projectionOutcome: 'notApplied',
      };
    const normalNonApplication: ProductionUserControlObservation = {
      ...inertModifier,
      excluded: {
        ...inertModifier.excluded,
        executionObservation: executionObservation([nonAppliedEvent]),
        operationEvents: [nonAppliedEvent],
        projections: [{ ...inertModifier.excluded.projections[0]!, outcome: 'notApplied' }],
        effectiveContributions: [
          {
            ...inertModifier.excluded.effectiveContributions[0]!,
            executionOutcome: 'notApplied',
            effective: false,
          },
        ],
      },
    };
    const normalNonApplicationGate = auditOne(normalNonApplication);
    const excludedOutcomeGate = (outcome: 'notRelevant' | 'impossible') => {
      const alternateEvent = {
        ...nonAppliedEvent,
        operationOutcome: outcome,
        projectionOutcome: outcome,
      };
      return auditOne({
        ...normalNonApplication,
        excluded: {
          ...normalNonApplication.excluded,
          executionObservation: executionObservation([alternateEvent]),
          operationEvents: [alternateEvent],
          projections: [{ ...normalNonApplication.excluded.projections[0]!, outcome }],
          effectiveContributions: [
            {
              ...normalNonApplication.excluded.effectiveContributions[0]!,
              executionOutcome: outcome,
            },
          ],
        },
      });
    };
    const notRelevantGate = excludedOutcomeGate('notRelevant');
    const impossibleGate = excludedOutcomeGate('impossible');
    const alternateGate = auditOne({
      ...normalNonApplication,
      identity: { ...normalNonApplication.identity, path: 'withoutAreaAlternate' },
    });
    const withoutBinding: ProductionUserControlObservation = {
      ...normalNonApplication,
      identity: {
        ...normalNonApplication.identity,
        contributionId: null,
        modifier: null,
      },
      enabled: {
        ...normalNonApplication.enabled,
        executionObservation: executionObservation([
          {
            ...normalNonApplication.enabled.operationEvents[0]!,
            contributionId: null,
            kind: 'addQuantity',
          },
        ]),
        operationEvents: [
          {
            ...normalNonApplication.enabled.operationEvents[0]!,
            contributionId: null,
            kind: 'addQuantity',
          },
        ],
        projections: [{ ...normalNonApplication.enabled.projections[0]!, contributionId: null }],
        inputBinding: { kind: 'unbound', reason: 'projection_has_no_damage_input_binding' },
        effectiveContributions: [],
      },
      excluded: {
        ...normalNonApplication.excluded,
        executionObservation: executionObservation([
          {
            ...nonAppliedEvent,
            contributionId: null,
            kind: 'addQuantity',
          },
        ]),
        operationEvents: [{ ...nonAppliedEvent, contributionId: null, kind: 'addQuantity' }],
        projections: [{ ...normalNonApplication.excluded.projections[0]!, contributionId: null }],
        inputBinding: { kind: 'unbound', reason: 'projection_has_no_damage_input_binding' },
        effectiveContributions: [],
      },
    };
    const withoutBindingGate = auditOne(withoutBinding);
    const missingProjection: ProductionUserControlObservation = {
      ...observation,
      enabled: { ...observation.enabled, projections: [] },
    };
    const missingEvent: ProductionUserControlObservation = {
      ...observation,
      enabled: { ...observation.enabled, operationEvents: [] },
    };
    const missingContribution: ProductionUserControlObservation = {
      ...observation,
      enabled: { ...observation.enabled, effectiveContributions: [] },
    };
    const eventContradiction: ProductionUserControlObservation = {
      ...observation,
      enabled: {
        ...observation.enabled,
        operationEvents: [
          { ...observation.enabled.operationEvents[0]!, projectionOutcome: 'notApplied' },
        ],
      },
    };
    const contributionContradiction: ProductionUserControlObservation = {
      ...observation,
      enabled: {
        ...observation.enabled,
        effectiveContributions: [
          {
            ...observation.enabled.effectiveContributions[0]!,
            modifier: 'attackBuff',
          },
        ],
      },
    };
    const partialContribution: ProductionUserControlObservation = {
      ...observation,
      enabled: {
        ...observation.enabled,
        effectiveContributions: [
          {
            ...observation.enabled.effectiveContributions[0]!,
            effective: false,
          },
        ],
      },
    };
    const bindingContradiction: ProductionUserControlObservation = {
      ...observation,
      enabled: {
        ...observation.enabled,
        inputBinding: { kind: 'bound', address: 'attackBuff', value: [1.5] as never },
      },
    };
    const explicitlyUndefined: ProductionUserControlObservation = {
      ...normalNonApplication,
      enabled: {
        ...normalNonApplication.enabled,
        inputBinding: { kind: 'bound', address: 'attackBuff', value: undefined as never },
      },
    };
    const absentValue: ProductionUserControlObservation = {
      ...explicitlyUndefined,
      enabled: {
        ...explicitlyUndefined.enabled,
        inputBinding: { kind: 'bound', address: 'attackBuff' } as never,
      },
    };
    const nullValue: ProductionUserControlObservation = {
      ...normalNonApplication,
      enabled: {
        ...normalNonApplication.enabled,
        inputBinding: { kind: 'bound', address: 'attackBuff', value: null as never },
      },
    };
    const unresolvedDamage: ProductionUserControlObservation = {
      ...observation,
      enabled: { ...observation.enabled, damageResult: { status: 'unsupported', rows: [] } },
    };
    const invalidDamage: ProductionUserControlObservation = {
      ...observation,
      enabled: { ...observation.enabled, damageResult: { status: 'invalid', rows: [] } },
    };
    const inputRequiredDamage: ProductionUserControlObservation = {
      ...observation,
      enabled: { ...observation.enabled, damageResult: { status: 'inputRequired', rows: [] } },
    };
    const unsupportedProjection: ProductionUserControlObservation = {
      ...observation,
      enabled: {
        ...observation.enabled,
        projections: [{ ...observation.enabled.projections[0]!, outcome: 'unsupported' }],
      },
    };
    const ambiguousTarget: ProductionUserControlObservation = {
      ...observation,
      enabled: {
        ...observation.enabled,
        executionObservation: {
          battlePointWitness: null,
          targetExecution: {
            selection: 'ambiguous',
            candidates: [0, 1].map((candidateIndex) => ({
              candidateIndex,
              targetCandidate: { classId: 'saber', attribute: 'man', families: [], facts: [] },
              operationEvents: [],
            })),
          },
        },
      },
    };
    const unsupportedTarget: ProductionUserControlObservation = {
      ...unresolvedSelectionObservation,
      enabled: {
        ...unresolvedSelectionObservation.enabled,
        executionObservation: {
          battlePointWitness: null,
          targetExecution: {
            selection: 'unresolved',
            targetResolution: { kind: 'unsupported', reason: 'targetSearchLimit', sourceKeys: [] },
            operationEvents: [],
          },
        },
      },
    };
    const absentTarget: ProductionUserControlObservation = {
      ...observation,
      enabled: {
        ...observation.enabled,
        executionObservation: { battlePointWitness: null, targetExecution: null },
      },
    };
    const missingFields: ProductionUserControlObservation = {
      ...observation,
      enabled: { ...observation.enabled },
    };
    Reflect.deleteProperty(missingFields.enabled, 'projections');
    const absentIdentity: ProductionUserControlObservation = {
      ...observation,
      identity: { ...observation.identity },
    };
    Reflect.deleteProperty(absentIdentity.identity, 'contributionId');
    const undefinedIdentity: ProductionUserControlObservation = {
      ...observation,
      identity: { ...observation.identity, contributionId: undefined as never },
    };
    const absentInputValueGate = auditOne(absentValue);
    const undefinedInputValueGate = auditOne(explicitlyUndefined);
    const nullInputValueGate = auditOne(nullValue);
    const failureCases = {
      inventoryCount: auditProductionUserControlObservations({
        expectedProjectionCount: 2,
        observations: [observation],
      }),
      duplicateIdentity: auditProductionUserControlObservations({
        expectedProjectionCount: 2,
        observations: [observation, observation],
      }),
      missingProjection: auditOne(missingProjection),
      missingEvent: auditOne(missingEvent),
      missingContribution: auditOne(missingContribution),
      eventContradiction: auditOne(eventContradiction),
      contributionContradiction: auditOne(contributionContradiction),
      partialContribution: auditOne(partialContribution),
      bindingContradiction: auditOne(bindingContradiction),
      absentInputValue: absentInputValueGate,
      undefinedInputValue: undefinedInputValueGate,
      nullInputValue: nullInputValueGate,
      missingFields: auditOne(missingFields),
      absentIdentity: auditOne(absentIdentity),
      undefinedIdentity: auditOne(undefinedIdentity),
      unresolvedDamage: auditOne(unresolvedDamage),
      invalidDamage: auditOne(invalidDamage),
      inputRequiredDamage: auditOne(inputRequiredDamage),
      unsupportedProjection: auditOne(unsupportedProjection),
      ambiguousTarget: auditOne(ambiguousTarget),
      unsupportedTarget: auditOne(unsupportedTarget),
      absentTarget: auditOne(absentTarget),
    };
    await writeUserControlDiagnosticArtifact(task.meta, {
      schemaVersion: 1,
      boundary: 'calculation-application-production-inert-control',
      source: 'productionClosureAudit.test.ts',
      passing,
      observations: [
        observation,
        inertNpSpecialObservation,
        inertModifier,
        unresolvedSelectionObservation,
      ],
      passingCases: {
        normalNonApplicationGate,
        notRelevantGate,
        impossibleGate,
        alternateGate,
        withoutBindingGate,
      },
      failureCases,
      intentionalFailures: [inertNpSpecial, inertOperation, unresolvedSelection],
    });
    expect(passing).toMatchObject({
      status: 'passed',
      summary: {
        projectionCount: 1,
        selectedProfileCount: 1,
        operationEventCount: 2,
        effectiveContributionCount: 2,
        directInputDifferenceCount: 1,
        eventProjectionOutcomeDifferenceCount: 1,
        damageResultDifferenceCount: 1,
      },
      failures: [],
    });
    expect(observation.excluded.effectiveContributions[0]?.resolvedValue).toBeNull();
    expect(passing.firstDifference).toBeNull();
    expect(inertNpSpecial).toMatchObject({
      status: 'failed',
      failures: [
        {
          reason: 'userControlNpSpecialInputNotChanged',
          firstDifference: { path: 'changed', expected: true, actual: false },
        },
      ],
    });
    expect(inertOperation).toMatchObject({
      status: 'failed',
      failures: [
        {
          reason: 'userControlDidNotReachOperationOrDamage',
          firstDifference: {
            path: 'reached',
            expected: true,
            actual: false,
          },
        },
      ],
    });
    expect(unresolvedSelection.failures).toContainEqual(
      expect.objectContaining({ reason: 'userControlExecutionSelectionNotUnique' }),
    );
    for (const gate of [
      normalNonApplicationGate,
      notRelevantGate,
      impossibleGate,
      alternateGate,
      withoutBindingGate,
    ])
      expect(gate).toMatchObject({ status: 'passed', firstDifference: null, failures: [] });
    expect(alternateGate.summary.withoutAreaAlternateCount).toBe(1);
    const reasons = {
      inventoryCount: 'userControlInventoryCoverageMismatch',
      duplicateIdentity: 'userControlDuplicateIdentity',
      missingProjection: 'userControlProjectionIdentityMismatch',
      missingEvent: 'userControlOperationEventMissing',
      missingContribution: 'userControlEffectiveContributionMissing',
      eventContradiction: 'userControlObservationInconsistent',
      contributionContradiction: 'userControlObservationInconsistent',
      partialContribution: 'userControlObservationInconsistent',
      bindingContradiction: 'userControlInputBindingUnsupported',
      absentInputValue: 'userControlInputBindingUnsupported',
      undefinedInputValue: 'userControlInputBindingUnsupported',
      nullInputValue: 'userControlInputBindingUnsupported',
      missingFields: 'userControlObservationInconsistent',
      absentIdentity: 'userControlProjectionIdentityMismatch',
      undefinedIdentity: 'userControlProjectionIdentityMismatch',
      unresolvedDamage: 'userControlDamageOutcomeNotCalculated',
      invalidDamage: 'userControlDamageOutcomeNotCalculated',
      inputRequiredDamage: 'userControlDamageOutcomeNotCalculated',
      unsupportedProjection: 'userControlObservationInconsistent',
      ambiguousTarget: 'userControlExecutionSelectionNotUnique',
      unsupportedTarget: 'userControlExecutionSelectionNotUnique',
      absentTarget: 'userControlExecutionObservationMissing',
    } as const;
    for (const [name, gate] of Object.entries(failureCases)) {
      const reason = reasons[name as keyof typeof reasons];
      expect(gate.status, name).toBe('failed');
      expect(
        gate.failures.map((failure) => failure.reason),
        name,
      ).toContain(reason);
      expect(gate.firstDifference?.identity, name).toBe(gate.failures[0]?.canonicalIdentity);
    }
    expect(absentInputValueGate.failures[0]?.firstDifference.path).toBe('present');
    expect(undefinedInputValueGate.failures[0]?.firstDifference.path).toBe('valueDefined');
    expect(nullInputValueGate.failures[0]?.firstDifference.path).toBe('valueValid');
    expect(failureCases.ambiguousTarget.failures[0]?.firstDifference.path).toBe('selection');
    expect(failureCases.unsupportedTarget.failures[0]?.firstDifference.path).toBe('selection');
    expect(failureCases.absentIdentity.failures[0]?.firstDifference.path).toBe(
      'contributionIdPresent',
    );
    expect(failureCases.undefinedIdentity.failures[0]?.firstDifference.path).toBe(
      'contributionIdType',
    );
  },
);
