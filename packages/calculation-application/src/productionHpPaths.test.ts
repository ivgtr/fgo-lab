import {
  hpCoverageSources,
  reconcileHpCoverage,
  type HpCoverageObservation,
} from './productionHpCoverage';
import {
  HP_PROOF_DECLARATION_KINDS,
  hpProofCoverageInventory,
  reconcileHpProofCoverage,
} from './productionHpProofCoverage';
import { auditGiveAttemptIsolation } from './productionHpGivePreparationAttemptAudit';
import {
  isSelfHpTransfer,
  hpTransferObservations,
  reconcileHpTransferEvidence,
  type HpTransferRequest,
} from './productionHpTransferEvidence';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  masterSnapshotSchema,
  getNoblePhantasmVariants,
  getSkillsForActorForm,
  getDefaultInitialActorForm,
  canonicalRequirementLeaves,
  type MasterEffect,
  type ServantMaster,
} from '@fgo-lab/master-data';
import {
  isHpOperation,
  executeHpOperation,
  seedHp,
  type SourceEffect,
} from '@fgo-lab/battle-execution';
import { SCHEMA_VERSION, ENGINE_VERSION } from '@fgo-lab/schema';
import {
  createDefaultResolvedScenario,
  calculateScenario,
  calculateScenarioWithPolicy,
  prepareCalculationScenarioWithPolicy,
  evaluatePreparedCalculationScenario,
} from './scenario';
import {
  currentCalculationVersionContext,
  createCalculatorPortableRequest,
  createRankingPortableRequest,
  executePortableCalculation,
} from './portableCalculation';
import { calculateRankingPolicyDetail } from './rankingPolicyCalculation';
import { DEFAULT_RANKING_POLICY_CONDITIONS } from './rankingContracts';
import { createStaticAttackProfiles } from './attackProfile';
import {
  giveInventory,
  isGiveSelf,
  isGiveFixedGain,
  auditGive,
} from './productionHpGivePreparationAudit';
import {
  productionAuditTestOptions,
  writeProductionAuditArtifact,
  encodeProductionAuditDiagnostic,
  decodeProductionAuditArtifact,
  decodeProductionAuditDiagnostic,
} from './productionAuditArtifacts';
import { isDeepStrictEqual } from 'node:util';
import { planPreNoblePhantasmCandidates } from './preNoblePhantasmPlanner';
const root = resolve(import.meta.dirname, '../../..');
const masterPromise = readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8').then(
  (s) => masterSnapshotSchema.parse(JSON.parse(s)),
);
const hpEffect = (e: MasterEffect) => e.execution.some(isHpOperation);
const readsHp = (a: ServantMaster) =>
  [
    ...a.skills.flatMap((s) => s.effects),
    ...a.passives.flatMap((s) => s.effects),
    ...getNoblePhantasmVariants(a).flatMap((n) => n.effects),
  ].some(
    (e) =>
      canonicalRequirementLeaves(e.requirement.expression).some(
        (r) => r.kind === 'quantity' && r.quantity === 'attackerHpPermille',
      ) ||
      e.execution.some(
        (o) =>
          (o.kind === 'damageModifier' || o.kind === 'modifierRateChange') &&
          o.valueExpressions.some((row) =>
            row.some((v) => v?.kind === 'inverseHpLinear' || v?.kind === 'hpRangeLinear'),
          ),
      ),
  ) ||
  getNoblePhantasmVariants(a).some(
    (n) => n.kind === 'attack' && n.damage.some((d) => d.kind === 'hpRatioLow'),
  );
async function artifact(name: string, data: unknown) {
  if (process.env['FGO_TEST_ARTIFACT_DIR'])
    await writeFile(
      resolve(process.env['FGO_TEST_ARTIFACT_DIR'], name),
      JSON.stringify(data, null, 2) + '\n',
    );
}
it(
  'joins all production HP cells to source, recipient and observation time, and executes both actor bindings',
  productionAuditTestOptions(['hp-operation-coverage.json', 'hp-proof-coverage.json']),
  async ({ task }) => {
    const master = await masterPromise;
    const sources = hpCoverageSources(master);
    const observations: HpCoverageObservation[] = [];
    const records: unknown[] = [];
    const failures: string[] = [];
    let cells = 0;
    for (const record of sources)
      for (const [operationIndex, operation] of record.effect.execution.entries()) {
        if (!isHpOperation(operation)) continue;
        const rows =
          operation.kind === 'resourceMutation'
            ? operation.amount
            : operation.kind === 'hpModifier'
              ? operation
              : null;
        for (const limitBreak of [false, true]) {
          const values = rows ? (limitBreak ? rows.limitBreakValues : rows.values) : [[0]];
          if (!values) continue;
          for (const [valueSetIndex, row] of values.entries())
            for (const [valueIndex, value] of row.entries()) {
              if (value === null) continue;
              for (const origin of [...new Set([record.origin, 'support' as const])]) {
                const source: SourceEffect = {
                  phase: origin === 'np' ? 'beforeNpDamage' : 'attackerSkill',
                  origin,
                  sourceInstanceId: 'cell-source',
                  sourceId: record.owner,
                  sourceName: record.owner,
                  sourceTraits: [],
                  skillId: record.skill,
                  skillName: record.skill,
                  effect: record.effect,
                  valueSetIndex,
                  valueIndex,
                  limitBreak,
                  sourceEnabled: true,
                  enabledByDefault: true,
                  noblePhantasmVariant: null,
                  preparationStochasticOutcome: null,
                };
                const inputValues =
                  operation.kind === 'resourceMutation' && operation.amount.kind === 'hpTransfer'
                    ? Object.fromEntries(operation.amount.inputKeys.map((k) => [k, 10000]))
                    : {};
                const result = executeHpOperation({
                  source,
                  operation,
                  state: {
                    actors: {
                      attacker: seedHp(11001, 500),
                      'cell-source': seedHp(9001, 600),
                      'enemy:0': seedHp(17001, 750),
                    },
                    receipts: [],
                  },
                  values: inputValues,
                  actionId: 'cell',
                  valueSetIndex,
                });
                const identity = `${record.owner}/${record.skill}/${record.effect.occurrenceId}/${valueSetIndex}/${valueIndex}/${limitBreak}/${origin}`;
                if (result.status !== 'applied') {
                  failures.push(`${identity}:${result.status}`);
                  continue;
                }
                for (const actor of Object.values(result.state.actors))
                  if (actor.kind === 'absolute')
                    if (actor.current < 0 || actor.current > actor.maximum)
                      failures.push(
                        `${identity}:${actor.current.toString()}/${actor.maximum.toString()}`,
                      );
                observations.push({
                  declaration: record,
                  operationIndex,
                  operation,
                  source,
                  state: result.state,
                });
                cells++;
                records.push({
                  owner: record.owner,
                  skill: record.skill,
                  occurrence: record.effect.occurrenceId,
                  operationIndex,
                  kind: operation.kind,
                  recipient:
                    operation.kind === 'resourceMutation'
                      ? operation.recipient
                      : operation.route.target,
                  time: record.effect.gameActivation,
                  origin,
                  limitBreak,
                  valueSetIndex,
                  valueIndex,
                  value,
                  state: result.state,
                });
              }
            }
        }
      }
    await artifact('hp-cell-inventory.json', {
      master: master.version,
      sources: sources.length,
      cells,
      digest: createHash('sha256').update(JSON.stringify(records)).digest('hex'),
      records,
    });
    const coverage = reconcileHpCoverage(sources, observations);
    const payload = {
      master: master.version,
      primitiveDigest: createHash('sha256').update(JSON.stringify(records)).digest('hex'),
      coverage,
    };
    const receipt = await writeProductionAuditArtifact(
      task.meta,
      'hp-operation-coverage.json',
      payload,
    );
    const bytes = await readFile(
      resolve(process.env['FGO_TEST_ARTIFACT_DIR']!, 'hp-operation-coverage.json'),
    );
    expect([bytes.length, createHash('sha256').update(bytes).digest('hex')]).toEqual([
      receipt.expectedBytes,
      receipt.expectedSha256,
    ]);
    expect(isDeepStrictEqual(decodeProductionAuditArtifact(bytes), payload)).toBe(true);
    expect(coverage.gate.failures).toEqual([]);
    expect([
      coverage.gate.sources,
      coverage.gate.declarations,
      coverage.gate.expectedCells,
      coverage.gate.observedCells,
    ]).toEqual([486, 486, 7470, 7470]);
    expect(failures).toEqual([]);
    expect(cells).toBeGreaterThan(1000);
    const declarations = hpProofCoverageInventory(master);
    const proofCoverage = reconcileHpProofCoverage(declarations, [], []);
    const proofPayload = {
      master: master.version,
      writerPopulation: declarations.filter((d) => d.identity.kind === 'writer').length,
      declarationCounts: Object.fromEntries(
        HP_PROOF_DECLARATION_KINDS.map((kind) => [
          kind,
          declarations.filter((d) => d.identity.kind === kind).length,
        ]),
      ),
      declarations: declarations.map(({ identity, effect, operation, value }) => ({
        identity,
        operation,
        value,
        requirement: effect?.requirement ?? null,
      })),
      proofCoverage,
      qualification:
        'Complete canonical declaration inventory, including readers without HP writers. This producer retains primitive cells only; native/read/NP/recovery proof is not inferred from them or generic records.',
    };
    const proofReceipt = await writeProductionAuditArtifact(
      task.meta,
      'hp-proof-coverage.json',
      proofPayload,
    );
    const proofBytes = await readFile(
      resolve(process.env['FGO_TEST_ARTIFACT_DIR']!, 'hp-proof-coverage.json'),
    );
    expect([proofBytes.length, createHash('sha256').update(proofBytes).digest('hex')]).toEqual([
      proofReceipt.expectedBytes,
      proofReceipt.expectedSha256,
    ]);
    expect(isDeepStrictEqual(decodeProductionAuditArtifact(proofBytes), proofPayload)).toBe(true);
    expect(proofPayload.writerPopulation).toBe(486);
    expect(proofCoverage.gate.failures).toEqual([]);
  },
);
it('executes every HP-producing calculator actor across NP capacity, initial OC, level and portable boundaries', async () => {
  const master = await masterPromise;
  const versions = {
    ...currentCalculationVersionContext(master),
    schemaVersion: SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    appVersion: '0.1.0',
    gameRegion: 'JP' as const,
    masterDataLocale: 'ja-JP' as const,
  };
  const records: unknown[] = [];
  const failures: unknown[] = [];
  for (const actor of master.servants) {
    if (
      ![
        ...actor.skills.flatMap((s) => s.effects),
        ...actor.passives.flatMap((s) => s.effects),
        ...getNoblePhantasmVariants(actor).flatMap((n) => n.effects),
      ].some(hpEffect) &&
      !readsHp(actor)
    )
      continue;
    if (!createStaticAttackProfiles(actor).length) continue;
    const base = createDefaultResolvedScenario(master, undefined, actor);
    for (const level of [...new Set([base.attacker.level, 90])])
      for (const [npLevel, initialOvercharge] of [
        [1, 1],
        [2, 2],
        [5, 3],
      ] as const) {
        const scenario = {
          ...base,
          attacker: { ...base.attacker, level, npLevel },
          initialOvercharge,
          attackerHpPermille: 500,
        };
        const execution = calculateScenario(scenario, master, versions);
        const replay = executePortableCalculation(
          createCalculatorPortableRequest(scenario, currentCalculationVersionContext(master)),
          master,
        );
        if (execution.result.status === 'calculated') {
          expect(replay.status).toBe('executed');
          if (replay.status === 'executed')
            expect(replay.execution.result).toEqual(execution.result);
        }
        const record = {
          actor: actor.id,
          level,
          npLevel,
          initialOvercharge,
          status: execution.result.status,
          issues: execution.result.issues,
          rows: 'rows' in execution.result ? execution.result.rows : [],
          actions: execution.appliedPreparationActions,
        };
        records.push(record);
        if (
          execution.result.issues.some(
            (issue) => issue.code.includes('unsupportedHp') || issue.code.includes('invalidHp'),
          )
        )
          failures.push(record);
      }
  }
  await artifact('hp-calculator-paths.json', { records, failures });
  expect(failures).toEqual([]);
}, 60000);
it('preserves all HP reader profile ranking policies, level/OC and owned basis through the same application', async () => {
  const master = await masterPromise;
  const versions = {
    ...currentCalculationVersionContext(master),
    schemaVersion: SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    appVersion: '0.1.0',
    gameRegion: 'JP' as const,
    masterDataLocale: 'ja-JP' as const,
  };
  const records: unknown[] = [];
  const failures: unknown[] = [];
  for (const actor of master.servants.filter(readsHp))
    for (const profile of createStaticAttackProfiles(actor))
      for (const levelBasis of ['naturalLimit', 'uniformLevel90', 'ownedLevel'] as const)
        for (const selfBuffs of ['included', 'excluded'] as const)
          for (const conditionalEffects of ['baseline', 'satisfied'] as const) {
            const condition = {
              ...DEFAULT_RANKING_POLICY_CONDITIONS,
              population: levelBasis === 'ownedLevel' ? ('owned' as const) : ('all' as const),
              levelBasis,
              npLevelBasis:
                levelBasis === 'ownedLevel'
                  ? { kind: 'owned' as const }
                  : { kind: 'specified' as const, npLevel: 2 as const },
              initialOvercharge: 2 as const,
              selfBuffs,
              conditionalEffects,
            };
            const result = calculateRankingPolicyDetail(
              actor,
              master,
              {
                servantBuilds: {
                  [actor.id]: {
                    servantId: actor.id,
                    level: 90,
                    ascension: 4,
                    npLevel: 2,
                    fouAtk: 1000,
                    skills: { '1': 10, '2': 10, '3': 10 },
                    appends: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
                    updatedAt: '2026-09-13T00:00:00Z',
                  },
                },
              },
              condition,
              versions,
              profile,
            );
            const record = {
              actor: actor.id,
              profile: profile.id,
              condition,
              status: result.status,
              ...('reason' in result ? { reason: result.reason } : {}),
              ...(result.status === 'calculated'
                ? {
                    scenario: result.detail.scenario,
                    rows: result.detail.result.rows,
                    candidates: result.detail.executionMetrics.worldCandidateCount,
                  }
                : {}),
            };
            records.push(record);
            if (result.status !== 'calculated') {
              failures.push(record);
              continue;
            }
            const replay = calculateScenarioWithPolicy(
              result.detail.scenario,
              master,
              versions,
              result.detail.contributionPolicy,
              { initialNpGauge: result.detail.candidateEvidence.startNpGauge },
            );
            expect('rows' in replay.result ? replay.result.rows : []).toEqual(
              result.detail.result.rows,
            );
            const portable = executePortableCalculation(
              createRankingPortableRequest(result.detail, currentCalculationVersionContext(master)),
              master,
            );
            expect(portable.status).toBe('executed');
            if (portable.status === 'executed')
              expect(portable.execution.result).toEqual(replay.result);
          }
  await artifact('hp-ranking-paths.json', { records, failures });
  expect(failures).toEqual([]);
}, 60000);
it('executes every HP craft-essence normal/LB cell with the live HP reader population', async () => {
  const master = await masterPromise;
  const versions = {
    ...currentCalculationVersionContext(master),
    schemaVersion: SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    appVersion: '0.1.0',
    gameRegion: 'JP' as const,
    masterDataLocale: 'ja-JP' as const,
  };
  const records: unknown[] = [];
  const failures: unknown[] = [];
  for (const actor of master.servants.filter(
    (actor) => readsHp(actor) && createStaticAttackProfiles(actor).length > 0,
  ))
    for (const ce of master.craftEssences.filter((ce) => ce.effects.some(hpEffect)))
      for (const limitBreak of [0, 4] as const) {
        const base = createDefaultResolvedScenario(master, undefined, actor);
        const scenario = {
          ...base,
          attacker: { ...base.attacker, npLevel: 2 },
          initialOvercharge: 2 as const,
          attackerHpPermille: 500,
          craftEssence: {
            craftEssenceId: ce.id,
            level: ce.maxLevelByLimitBreak[limitBreak],
            limitBreak,
          },
        };
        const execution = calculateScenario(scenario, master, versions);
        const record = {
          actor: actor.id,
          ce: ce.id,
          limitBreak,
          status: execution.result.status,
          issues: execution.result.issues,
          hp: execution.appliedPreparationActions.at(-1)?.hpAfter,
        };
        records.push(record);
        if (execution.result.status !== 'calculated') {
          failures.push(record);
          continue;
        }
        const portable = executePortableCalculation(
          createCalculatorPortableRequest(scenario, currentCalculationVersionContext(master)),
          master,
        );
        expect(portable.status).toBe('executed');
        if (portable.status === 'executed')
          expect(portable.execution.result).toEqual(execution.result);
      }
  await artifact('hp-craft-essence-paths.json', { records, failures });
  expect(failures).toEqual([]);
}, 60000);
it('executes every selectable HP support skill before an HP-dependent damage reader, including repair and portable replay', async () => {
  const { applyCanonicalInputCommand } = await import('./canonicalInputs');
  const master = await masterPromise;
  const actor = master.servants.find((actor) =>
    getNoblePhantasmVariants(actor).some(
      (np) => np.kind === 'attack' && np.damage.some((damage) => damage.kind === 'hpRatioLow'),
    ),
  )!;
  const versions = {
    ...currentCalculationVersionContext(master),
    schemaVersion: SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    appVersion: '0.1.0',
    gameRegion: 'JP' as const,
    masterDataLocale: 'ja-JP' as const,
  };
  const base = createDefaultResolvedScenario(master, undefined, actor);
  const records: unknown[] = [];
  const failures: unknown[] = [];
  for (const support of master.servants)
    for (const skill of getSkillsForActorForm(
      support,
      getDefaultInitialActorForm(support)!.id,
    ).filter((skill) => skill.effects.some(hpEffect))) {
      const choices = [
        ...new Map(
          skill.effects
            .filter(hpEffect)
            .flatMap((effect) =>
              effect.selection?.kind === 'playerChoice'
                ? [[JSON.stringify(effect.selection.group), effect.selection.group] as const]
                : [],
            ),
        ).values(),
      ];
      for (const choice of [null, ...choices]) {
        let scenario = {
          ...base,
          activationFacts: choice
            ? [
                {
                  kind: 'choice' as const,
                  source: {
                    origin: 'support' as const,
                    sourceInstanceId: 'hp-support',
                    skillId: skill.id,
                  },
                  family: choice.key,
                  candidate: choice.candidate,
                },
              ]
            : base.activationFacts,
          attacker: { ...base.attacker, npLevel: 2 },
          initialOvercharge: 2 as const,
          attackerHpPermille: 500,
          preNoblePhantasmPlan: [{ kind: 'executeAttackNoblePhantasm' as const }],
          support: {
            sourceTemplateId: null,
            composition: {
              effectInclusions: [],
              sources: [
                {
                  sourceInstanceId: 'hp-support',
                  servantId: support.id,
                  skills: [{ skillId: skill.id, skillLevel: 10, enabled: true }],
                },
              ],
            },
          },
        };
        let execution = calculateScenario(scenario, master, versions);
        const missingSourceFactsOutcome = execution.result.status;
        const sourceQuantityFacts = choice
          ? skill.effects
              .filter(hpEffect)
              .filter(
                (effect) =>
                  effect.selection?.kind === 'playerChoice' &&
                  effect.selection.group.key === choice.key &&
                  effect.selection.group.candidate === choice.candidate,
              )
              .flatMap((effect) => canonicalRequirementLeaves(effect.requirement.expression))
              .filter((requirement) => requirement.kind === 'sourceQuantity')
              .map((requirement) => ({
                ...requirement,
                source: {
                  origin: 'support' as const,
                  sourceInstanceId: 'hp-support',
                  skillId: skill.id,
                },
              }))
          : [];
        if (sourceQuantityFacts.length && execution.result.status === 'unsupported') {
          scenario = {
            ...scenario,
            activationFacts: [
              ...scenario.activationFacts,
              ...new Map(sourceQuantityFacts.map((fact) => [JSON.stringify(fact), fact])).values(),
            ],
          };
          execution = calculateScenario(scenario, master, versions);
        }
        for (let repair = 0; repair < 12 && execution.result.status === 'inputRequired'; repair++) {
          const input = execution.inputDefinitions.find(
            (input) =>
              !Object.hasOwn(scenario.canonicalInputValues, input.key) &&
              ['sourceMaximumHp', 'sourceChoice', 'worldTraitPresence'].includes(input.kind),
          );
          if (!input) break;
          scenario = applyCanonicalInputCommand(scenario, {
            kind: 'setCanonicalIntegerInput',
            key: input.key,
            value:
              input.kind === 'sourceMaximumHp' ? Math.max(input.minimum, 10000) : input.minimum,
          }) as typeof scenario;
          execution = calculateScenario(scenario, master, versions);
        }
        const record = {
          source: support.id,
          skill: skill.id,
          status: execution.result.status,
          issues: execution.result.issues,
          inputs: scenario.canonicalInputValues,
          activationFacts: scenario.activationFacts,
          missingSourceFactsOutcome,
          sourceQuantityFacts,
          inputDefinitions: execution.inputDefinitions,
          rows: 'rows' in execution.result ? execution.result.rows : [],
          actions: execution.appliedPreparationActions,
        };
        records.push(record);
        if (execution.result.status === 'calculated') {
          const portable = executePortableCalculation(
            createCalculatorPortableRequest(scenario, currentCalculationVersionContext(master)),
            master,
          );
          expect(portable.status).toBe('executed');
          if (portable.status === 'executed')
            expect(portable.execution.result).toEqual(execution.result);
        } else failures.push(record);
      }
    }
  await artifact('hp-support-paths.json', { records, failures });
  expect(
    failures.map((record) => {
      const r = record as { source: string; skill: string; status: string; issues: unknown[] };
      return { source: r.source, skill: r.skill, status: r.status, issues: r.issues };
    }),
  ).toEqual([]);
}, 60000);

it(
  'reconciles all published give declarations with selected native preparation and distinct damage-reader boundaries',
  productionAuditTestOptions(['hp-give-coverage.json', 'hp-give-native-noncommit-coverage.json']),
  async ({ task }) => {
    const master = await masterPromise,
      declarations = giveInventory(master);
    const eligible = master.servants.flatMap((servant) =>
      servant.actorFormGraph.initialFormIds.flatMap((form) => {
        const skills = getSkillsForActorForm(servant, form);
        return skills
          .filter((skill) => skill.effects.some((e) => e.execution.some(isGiveSelf)))
          .map((writer) => ({
            servant,
            form,
            writer,
            gains: skills.filter((skill) =>
              skill.effects.some((e) => e.execution.some(isGiveFixedGain)),
            ),
          }));
      }),
    );
    const records = eligible.flatMap(({ servant, form, writer, gains }) => {
      const profiles = createStaticAttackProfiles(servant);
      const plans = Array.from(
        { length: 5 },
        (_, index) => (index + 1) as 1 | 2 | 3 | 4 | 5,
      ).flatMap((npLevel) =>
        Array.from({ length: 5 }, (_, index) => (index + 1) as 1 | 2 | 3 | 4 | 5).map(
          (overcharge) => {
            const original = planPreNoblePhantasmCandidates(
              servant,
              master.npResourceSemantics,
              npLevel,
              overcharge,
            );
            return {
              npLevel,
              overcharge,
              inventory: original.inventory,
              candidates: original.candidates,
            };
          },
        ),
      );
      // The real profile/planner owners exclude this published actor before request generation.
      // Do not replace its nonAttack NP with an attack NP or manufacture a request from another actor.
      return [
        {
          owner: servant.id,
          form,
          writer: writer.id,
          gains: gains.map((gain) => gain.id),
          profileCount: profiles.length,
          plans,
          disposition: 'excludedNoAttackCandidate' as const,
        },
      ];
    });
    const gate = auditGive({ requests: [], expected: [], observations: [] });
    const payload = {
      declarations,
      eligible: eligible.map((e) => ({
        owner: e.servant.id,
        form: e.form,
        writer: e.writer.id,
        gains: e.gains.map((g) => g.id),
      })),
      qualification:
        'Declaration/request/native write/gain consumption and damage-selected populations are separate. Constant CE declarations are outside this committed attacker-skill audit. Schema-legal fixture success is separate.',
      records,
      gate,
    };
    const receipt = await writeProductionAuditArtifact(
      task.meta,
      'hp-give-coverage.json',
      encodeProductionAuditDiagnostic(payload),
    );
    const bytes = await readFile(
      resolve(process.env['FGO_TEST_ARTIFACT_DIR']!, 'hp-give-coverage.json'),
    );
    expect(bytes.length).toBe(receipt.expectedBytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(receipt.expectedSha256);
    expect(
      isDeepStrictEqual(
        decodeProductionAuditDiagnostic(
          decodeProductionAuditArtifact(bytes) as ReturnType<
            typeof encodeProductionAuditDiagnostic
          >,
        ),
        payload,
      ),
    ).toBe(true);
    // Reuse this exact declared/profile/planner population; no alternative actor or request producer.
    const attemptGate = auditGiveAttemptIsolation({ requests: [], expected: [], observations: [] });
    const attemptPayload = {
      declarations,
      eligible: payload.eligible,
      records,
      gate: attemptGate,
      qualification:
        'Published owner excluded before request generation; zero selected/reached/native/actual-read/changed/isolation. This is a declaration boundary, not unsupported or a native refusal. Strict schema-legal nonempty evidence is separate.',
    };
    const attemptReceipt = await writeProductionAuditArtifact(
      task.meta,
      'hp-give-native-noncommit-coverage.json',
      encodeProductionAuditDiagnostic(attemptPayload),
    );
    const attemptBytes = await readFile(
      resolve(process.env['FGO_TEST_ARTIFACT_DIR']!, 'hp-give-native-noncommit-coverage.json'),
    );
    expect([attemptBytes.length, createHash('sha256').update(attemptBytes).digest('hex')]).toEqual([
      attemptReceipt.expectedBytes,
      attemptReceipt.expectedSha256,
    ]);
    expect(
      isDeepStrictEqual(
        decodeProductionAuditDiagnostic(
          decodeProductionAuditArtifact(attemptBytes) as ReturnType<
            typeof encodeProductionAuditDiagnostic
          >,
        ),
        attemptPayload,
      ),
    ).toBe(true);
    expect(attemptGate.failures).toEqual([]);
    expect([
      attemptGate.selected,
      attemptGate.appended,
      attemptGate.consumed,
      attemptGate.changed,
      attemptGate.isolated,
    ]).toEqual([0, 0, 0, 0, 0]);
    expect(
      declarations.map((d) => [d.origin, d.operation.lifetime, d.operation.route.target]),
    ).toEqual([
      ['skill', 'active', 'sourceSelf'],
      ...Array.from({ length: 4 }, () => ['craftEssence', 'constant', 'sourceSelf']),
    ]);
    expect(eligible.length).toBe(1);
    expect(records.length).toBe(1);
    expect(gate.failures).toEqual([]);
    expect(gate.readers).toBe(0);
    expect(gate.nps).toBe(0);
    expect(gate.connected).toBe(0);
    expect([
      gate.selected,
      gate.reached,
      gate.committed,
      gate.gainConsumed,
      gate.readers,
      gate.nps,
    ]).toEqual([0, 0, 0, 0, 0, 0]);
    for (const record of records) {
      expect(record.profileCount).toBe(0);
      expect(record.plans.every((plan) => plan.candidates.length === 0)).toBe(true);
    }
  },
);

it(
  'connects all published self transfer declarations to original native preparation and ordered donor appends',
  productionAuditTestOptions(['hp-transfer-evidence.json']),
  async ({ task }) => {
    const master = await masterPromise;
    const sources = hpCoverageSources(master);
    const declarations = sources.filter(
      (source) => source.origin === 'attacker' && source.effect.execution.some(isSelfHpTransfer),
    );
    const requests: HpTransferRequest[] = [];
    const cases: unknown[] = [];
    const versions = {
      ...currentCalculationVersionContext(master),
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP' as const,
      masterDataLocale: 'ja-JP' as const,
    };
    for (const declaration of declarations) {
      const actor = master.servants.find((actor) => actor.id === declaration.owner);
      if (!actor) throw new Error('transfer_declared_actor_missing');
      const base = createDefaultResolvedScenario(master, undefined, actor);
      for (const level of [...new Set([base.attacker.level, 90])])
        for (const [npLevel, initialOvercharge] of [
          [1, 1],
          [2, 2],
          [5, 3],
        ] as const)
          for (const inputMode of ['defaultZero', 'explicitNonempty'] as const) {
            const scenario = {
              ...base,
              attacker: { ...base.attacker, level, npLevel },
              initialOvercharge,
              attackerHpPermille: 500,
              canonicalInputValues: {
                ...base.canonicalInputValues,
                ...(inputMode === 'explicitNonempty'
                  ? Object.fromEntries(
                      declaration.effect.inputDefinitions
                        .filter((input) => input.kind === 'transferDonor')
                        .map((input) => [
                          input.key,
                          {
                            kind: 'integer' as const,
                            value:
                              input.actorIndex === 0 ? 4001 : input.actorIndex === 1 ? 1001 : 0,
                          },
                        ]),
                    )
                  : {}),
              },
            };
            const prepared = prepareCalculationScenarioWithPolicy(
              scenario,
              master,
              { kind: 'calculator' },
              {},
              true,
            );
            const calculation = evaluatePreparedCalculationScenario(prepared, versions);
            requests.push({ prepared, calculation });
            cases.push({
              owner: declaration.owner,
              skill: declaration.skill,
              occurrence: declaration.effect.occurrenceId,
              level,
              npLevel,
              initialOvercharge,
              inputMode,
              inputs: scenario.canonicalInputValues,
            });
            const ordinary = calculateScenario(scenario, master, versions);
            expect(calculation.result).toEqual(ordinary.result);
            expect(calculation.appliedPreparationActions).toEqual(
              ordinary.appliedPreparationActions,
            );
            const portable = executePortableCalculation(
              createCalculatorPortableRequest(scenario, currentCalculationVersionContext(master)),
              master,
            );
            expect(portable.status).toBe('executed');
            if (portable.status === 'executed')
              expect(portable.execution.result).toEqual(calculation.result);
          }
    }
    const observations = hpTransferObservations(requests);
    const evidence = reconcileHpTransferEvidence(sources, requests, observations);
    const payload = { master: master.version, cases, evidence };
    const receipt = await writeProductionAuditArtifact(
      task.meta,
      'hp-transfer-evidence.json',
      payload,
    );
    const bytes = await readFile(
      resolve(process.env['FGO_TEST_ARTIFACT_DIR']!, 'hp-transfer-evidence.json'),
    );
    expect([bytes.length, createHash('sha256').update(bytes).digest('hex')]).toEqual([
      receipt.expectedBytes,
      receipt.expectedSha256,
    ]);
    expect(isDeepStrictEqual(decodeProductionAuditArtifact(bytes), payload)).toBe(true);
    expect(evidence.gate.failures).toEqual([]);
    expect([declarations.length, requests.length, observations.length]).toEqual([2, 24, 24]);
    expect(
      evidence.rows.every(
        (row) => row.native?.status === 'committed' && row.result.status === 'applied',
      ),
    ).toBe(true);
    expect(
      evidence.rows.filter((row) => row.donorReceipts.some((receipt) => receipt.snapshot > 0)),
    ).toHaveLength(12);
  },
);
