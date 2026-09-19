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
it('joins all production HP cells to source, recipient and observation time, and executes both actor bindings', async () => {
  const master = await masterPromise;
  const sources: {
    owner: string;
    skill: string;
    origin: SourceEffect['origin'];
    effect: MasterEffect;
  }[] = [
    ...master.servants.flatMap((a) => [
      ...a.skills.flatMap((s) =>
        s.effects
          .filter(hpEffect)
          .map((effect) => ({ owner: a.id, skill: s.id, origin: 'attacker' as const, effect })),
      ),
      ...a.passives.flatMap((s) =>
        s.effects
          .filter(hpEffect)
          .map((effect) => ({ owner: a.id, skill: s.id, origin: 'passive' as const, effect })),
      ),
      ...getNoblePhantasmVariants(a).flatMap((n) =>
        n.effects.filter(hpEffect).map((effect) => ({
          owner: a.id,
          skill: n.ref.noblePhantasmId,
          origin: 'np' as const,
          effect,
        })),
      ),
    ]),
    ...master.craftEssences.flatMap((ce) =>
      ce.effects
        .filter(hpEffect)
        .map((effect) => ({ owner: ce.id, skill: ce.id, origin: 'craftEssence' as const, effect })),
    ),
    ...master.mysticCodes.flatMap((mc) =>
      mc.skills.flatMap((s) =>
        s.effects
          .filter(hpEffect)
          .map((effect) => ({ owner: mc.id, skill: s.id, origin: 'mysticCode' as const, effect })),
      ),
    ),
  ];
  const records: unknown[] = [];
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
              expect(
                result.status,
                `${record.owner}/${record.skill}/${record.effect.occurrenceId}/${valueSetIndex}/${valueIndex}/${limitBreak}/${origin}`,
              ).toBe('applied');
              if (result.status !== 'applied') continue;
              for (const actor of Object.values(result.state.actors))
                if (actor.kind === 'absolute')
                  expect(actor.current >= 0 && actor.current <= actor.maximum).toBe(true);
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
  expect(cells).toBeGreaterThan(1000);
});
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
        if (sourceQuantityFacts.length) {
          expect(execution.result.status).toBe('unsupported');
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
