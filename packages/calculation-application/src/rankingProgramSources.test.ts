import { describe, expect, it } from 'vitest';
import {
  masterEffectSchema,
  servantMasterSchema,
  masterSnapshotSchema,
  findNoblePhantasmVariant,
  type MasterEffect,
  type ServantMaster,
  type ActorFormId,
} from '@fgo-lab/master-data';
import fixture from '../../test-fixtures/master/fixture.json';
import { rankingProgramSourceGroups } from './rankingProgramSources';
import { compileStaticRankingPreparationPrograms } from './rankingStaticPreparation';
import { compileStaticRankingSemantics } from './rankingStaticSemantics';
import { observeResourceProgram } from './resourceProgramAudit';
import { calculateRankingPolicy } from './rankingPolicyCalculation';
import { DEFAULT_RANKING_POLICY_CONDITIONS } from './rankingContracts';
import {
  createCalculatorPortableRequest,
  currentCalculationVersionContext,
  executePortableCalculation,
} from './portableCalculation';
import { createRankingBaseScenario } from './rankingPolicy';
import { APP_VERSION } from '@fgo-lab/schema';

const master = masterSnapshotSchema.parse(fixture);
const route = {
  target: 'sourceSelf' as const,
  contributionScope: 'personal' as const,
  eligibility: { kind: 'anyRecipient' as const, onMissing: 'unsupported' as const },
};
const values = [[100], [], [], [], []] as [number[], number[], number[], number[], number[]];
function effect(id: string, execution: MasterEffect['execution']): MasterEffect {
  return masterEffectSchema.parse({
    id,
    occurrenceId: id,
    label: id,
    availability: 'allLimitBreakStates',
    inclusionPolicy: { default: 'include' },
    gameActivation: 'skillUse',
    proc: { kind: 'guaranteed' },
    selection: null,
    interaction: null,
    triggerScope: null,
    operationTrigger: null,
    operationReference: null,
    stateIdentity: null,
    inputDefinitions: [],
    requirement: { recipient: 'sourceSelf', expression: { kind: 'always' } },
    execution,
    atlasEvidence: {
      functionType: 'fixture',
      target: 'self',
      parameterSets: [[], [], [], [], []],
      parameterSemantics: {
        value: [],
        lifecycle: [],
        presentation: [],
        condition: [],
        contextMutation: [],
        choice: [],
        valueExpression: [],
        buffIdentity: [],
        unresolved: [],
      },
      unresolvedSemanticKeys: [],
      buffTypes: [],
      buffRateTargets: [],
      buffConditionKeys: [],
    },
  });
}
function formPath() {
  const original = master.servants[0]!;
  const base = compileStaticRankingPreparationPrograms(
    original,
    rankingBasisFixture(original).skillLevels,
  )[0]!;
  const first = original.actorFormGraph.forms.find(
    ({ id }) =>
      id.actorId === base.initialFormId.actorId && id.limitCount === base.initialFormId.limitCount,
  )!;
  const second: ActorFormId = { ...first.id, actorId: 'later-form' };
  const np = findNoblePhantasmVariant(original, base.attackProfile.noblePhantasmVariant)!;
  if (np.kind !== 'attack') throw new Error('attack fixture');
  const changedNp = {
    ...np,
    canonicalId: 'a'.repeat(64),
    ref: { actorFormId: second, noblePhantasmId: 'later-np' },
  };
  const damage = effect('old-damage', [
    {
      kind: 'damageModifier',
      modifier: 'attackBuff',
      sign: 1,
      card: null,
      route,
      values,
      semanticSupport: 'supported',
      valueExpressions: [[], [], [], [], []],
    },
  ]);
  const hpReader = effect('new-hp-reader', [
    {
      kind: 'damageModifier',
      modifier: 'attackBuff',
      sign: 1,
      card: null,
      route,
      values,
      semanticSupport: 'supported',
      valueExpressions: [
        [{ kind: 'inverseHpLinear', basePermille: 0, bonusAtZeroHpPermille: 1000 }],
        [],
        [],
        [],
        [],
      ],
    },
  ]);
  const loss = effect('hp-loss', [
    {
      kind: 'resourceMutation',
      resource: 'hp',
      direction: 'loss',
      unit: 'fixed',
      lossFloor: 'zero',
      recipient: 'sourceSelf',
      amount: { kind: 'fixed', values },
      subjectId: null,
    },
  ]);
  const toSecond = effect('change', [
    { kind: 'transformActorForm', route, targetFormId: second },
    { kind: 'selectNoblePhantasmVariant', route, variant: changedNp.ref },
  ]);
  const toFirst = effect('return', [
    { kind: 'transformActorForm', route, targetFormId: first.id },
    { kind: 'selectNoblePhantasmVariant', route, variant: np.ref },
  ]);
  const skill = (
    id: string,
    slot: 1 | 2 | 3,
    effects: MasterEffect[],
  ): ServantMaster['skills'][number] => ({
    id,
    name: id,
    slot,
    priority: 0,
    detail: '',
    imageKey: null,
    resourceRequirement: null,
    effects,
  });
  const skills = [
    skill('change-skill', 1, [loss, toSecond]),
    skill('return-skill', 2, [toFirst]),
    skill('stay-skill', 3, []),
  ];
  const passive = (id: string, e: MasterEffect): ServantMaster['passives'][number] => ({
    id,
    name: id,
    detail: '',
    imageKey: null,
    effects: [{ ...e, gameActivation: 'constant' }],
    priority: 0,
    resourceRequirement: null,
  });
  const servant: ServantMaster = {
    ...original,
    skills,
    passives: [passive('old-passive', damage), passive('new-passive', hpReader)],
    actorFormGraph: {
      ...original.actorFormGraph,
      initialFormIds: [first.id],
      defaultInitialFormId: first.id,
      forms: [
        { ...first, skillIds: ['change-skill'], passiveIds: ['old-passive'] },
        {
          ...first,
          id: second,
          skillIds: ['return-skill', 'stay-skill'],
          passiveIds: ['new-passive'],
          baseNoblePhantasmVariant: changedNp.ref,
        },
      ],
      transitions: [
        {
          id: 'change',
          from: first.id,
          to: second,
          direction: 'forward',
          activation: {
            sourceKind: 'skill',
            sourceId: 'change-skill',
            effectOccurrenceIds: ['change'],
          },
          operations: toSecond.execution,
        },
        {
          id: 'return',
          from: second,
          to: first.id,
          direction: 'forward',
          activation: {
            sourceKind: 'skill',
            sourceId: 'return-skill',
            effectOccurrenceIds: ['return'],
          },
          operations: toFirst.execution,
        },
      ],
    },
    noblePhantasmVariantGroups: [
      { ...original.noblePhantasmVariantGroups[0]!, variants: [np, changedNp] },
    ],
  };
  return { servant: servantMasterSchema.parse(servant), first: first.id, second };
}

describe('ranking selected program source timeline', () => {
  it.each([true, false])(
    'reads a guaranteed self skill at its current form, not the terminal form (initial trait: %s)',
    (initialTrait) => {
      const path = formPath();
      const conditional = effect('current-form-buff', [
        {
          kind: 'damageModifier',
          modifier: 'attackBuff',
          sign: 1,
          card: null,
          route,
          values: [Array.from({ length: 10 }, () => 500), [], [], [], []],
          valueExpressions: [Array.from({ length: 10 }, () => null), [], [], [], []],
          semanticSupport: 'supported',
        },
      ]);
      conditional.requirement = {
        recipient: 'sourceSelf',
        expression: {
          kind: 'trait',
          scope: 'recipient',
          trait: 'form-clock-trait',
          present: true,
          provenance: {
            stateSources: 'activeOnly',
            ignoredStateTraits: 'exclude',
            unremovableStateTraits: 'include',
          },
        },
      };
      const actor = servantMasterSchema.parse({
        ...path.servant,
        skills: path.servant.skills.map((skill) => ({
          ...skill,
          effects:
            skill.slot === 1
              ? skill.effects.filter(({ id }) => id !== 'hp-loss')
              : skill.slot === 3
                ? [conditional]
                : skill.effects,
        })),
        passives: [],
        actorFormGraph: {
          ...path.servant.actorFormGraph,
          forms: path.servant.actorFormGraph.forms.map((form) => ({
            ...form,
            passiveIds: [],
            skillIds: [...new Set([...form.skillIds, 'stay-skill'])],
            traits:
              (form.id.actorId === path.first.actorId) === initialTrait ? ['form-clock-trait'] : [],
          })),
        },
      });
      const snapshot = masterSnapshotSchema.parse({ ...master, servants: [actor] });
      const scenario = createRankingBaseScenario(
        actor,
        snapshot,
        rankingBasisFixture(actor),
        DEFAULT_RANKING_POLICY_CONDITIONS,
        path.first,
      );
      const calculator = executePortableCalculation(
        createCalculatorPortableRequest(
          {
            ...scenario,
            preNoblePhantasmPlan: [
              { kind: 'useSkillSlot', slot: 3, skillLevel: 10, choice: null },
              { kind: 'useSkillSlot', slot: 1, skillLevel: 10, choice: null },
              { kind: 'executeAttackNoblePhantasm' },
            ],
          },
          currentCalculationVersionContext(snapshot),
        ),
        snapshot,
      );
      expect(calculator.status).toBe('executed');
      if (calculator.status !== 'executed') throw new Error('executed calculator required');
      expect(calculator.execution.status).toBe('executable');
      if (calculator.execution.status !== 'executable')
        throw new Error('executable calculator required');
      // The selected commands fix the skill read before the form transition. A later
      // intrinsic truth must neither grant an earlier false buff nor erase a true one.
      expect.soft(calculator.execution.input.attackBuff).toBe(initialTrait ? 0.5 : 0);
      expect(calculator.execution.appliedPreparationActions[0]?.actorFormId).toEqual(path.first);
      const ranking = calculateRankingPolicy(
        snapshot,
        { servantBuilds: {} },
        DEFAULT_RANKING_POLICY_CONDITIONS,
        {
          ...currentCalculationVersionContext(snapshot),
          appVersion: APP_VERSION,
          gameRegion: 'JP',
          masterDataLocale: 'ja-JP',
        },
      );
      const entry = Object.values(ranking.profileResults).find(
        (entry) =>
          entry.status === 'calculated' &&
          entry.detail.attackProfile.id.terminalActorFormProfileId.semantics.intrinsicTraits.includes(
            'form-clock-trait',
          ) === !initialTrait,
      );
      if (entry?.status !== 'calculated')
        throw new Error(
          JSON.stringify({
            status: ranking.status,
            reason: 'reason' in ranking ? ranking.reason : null,
            detail: 'detail' in ranking ? ranking.detail : null,
            profiles: Object.values(ranking.profileResults).map((result) => ({
              status: result.status,
              profile:
                result.status === 'calculated'
                  ? result.detail.attackProfile.id.terminalActorFormProfileId.semantics
                      .intrinsicTraits
                  : null,
              reason: 'reason' in result ? result.reason : null,
            })),
            exclusions: ranking.exclusions,
          }),
        );
      expect(entry.detail.input.attackBuff).toBe(0.5);
      const use = entry.detail.appliedPreparationActions.find(
        ({ command }) => command.kind === 'useSkillSlot' && command.slot === 3,
      );
      expect(use?.actorFormId).toEqual(initialTrait ? path.first : path.second);
    },
  );

  it('binds the supplied canonical slot levels across every initial form, transition and player choice', () => {
    const path = formPath();
    const selectable = path.servant.skills.find(({ slot }) => slot === 3)!;
    const branched = servantMasterSchema.parse({
      ...path.servant,
      skills: path.servant.skills.map((skill) =>
        skill.slot !== 3
          ? skill
          : {
              ...selectable,
              effects: ['first', 'second'].map((candidate) => ({
                ...effect(`choice-${candidate}`, [
                  { kind: 'boundedPhaseIrrelevant', proof: 'noBattleStateChange' },
                ]),
                selection: { kind: 'playerChoice', group: { key: 'saved-choice', candidate } },
              })),
            },
      ),
      actorFormGraph: { ...path.servant.actorFormGraph, initialFormIds: [path.first, path.second] },
    });
    const levels = { '1': 1, '2': 5, '3': 9 } as const;
    const programs = compileStaticRankingPreparationPrograms(branched, levels);
    for (const initial of [path.first, path.second])
      expect(
        programs.some(
          ({ initialFormId }) => JSON.stringify(initialFormId) === JSON.stringify(initial),
        ),
      ).toBe(true);
    const uses = programs
      .flatMap(({ sourceUses }) => sourceUses)
      .filter((use) => use.kind === 'skill');
    expect(new Set(uses.map(({ skill }) => skill.slot))).toEqual(new Set([1, 2, 3]));
    for (const use of uses)
      expect(use.skillLevel).toBe(levels[String(use.skill.slot) as keyof typeof levels]);
    const commands = programs
      .flatMap(({ commands }) => commands)
      .filter((command) => command.kind === 'useSkillSlot');
    for (const command of commands)
      expect(command.skillLevel).toBe(levels[String(command.slot) as keyof typeof levels]);
    expect(
      new Set(commands.filter(({ slot }) => slot === 3).map(({ choice }) => choice?.candidateKey)),
    ).toEqual(new Set(['first', 'second']));
    expect(
      programs.some(
        ({ commands }) => commands.filter(({ kind }) => kind === 'useSkillSlot').length === 3,
      ),
    ).toBe(true);
  });

  it('distinguishes activation order from the final damage projection after a form change', () => {
    const { servant, second } = formPath();
    const program = compileStaticRankingPreparationPrograms(
      servant,
      rankingBasisFixture(servant).skillLevels,
    ).find(
      (item) =>
        item.sourceUses.length === 1 && item.expectedTerminalFormId.actorId === second.actorId,
    )!;
    const groups = rankingProgramSourceGroups(servant, program, 1);
    expect(groups.map(({ kind }) => kind)).toEqual([
      'automatic',
      'action',
      'automatic',
      'terminal',
    ]);
    const semantics = compileStaticRankingSemantics(servant, program, 1);
    expect(
      semantics.operations.some(({ source }) => source.effectOccurrenceId === 'old-damage'),
    ).toBe(false);
    const writer = semantics.operations.findIndex(
      ({ source }) => source.effectOccurrenceId === 'hp-loss',
    );
    const reader = semantics.operations.findIndex(
      ({ source }) => source.effectOccurrenceId === 'new-hp-reader',
    );
    expect(writer).toBeGreaterThanOrEqual(0);
    // The ordinary projection reads the final passive before replayed skill contributions.
    // It must not be used as preparation activation order.
    expect(reader).toBeLessThan(writer);
    expect(
      observeResourceProgram(servant, program).mutations.find(({ resource }) => resource === 'hp'),
    ).toMatchObject({
      deferredReader: { effect: 'new-hp-reader', phase: 'ordinaryDependency' },
      firstRequiredHpGuard: { phase: 'npUse' },
    });
  });
  it('expires the earlier activation on reentry and does not reactivate an unchanged form per skill', () => {
    const { servant, first } = formPath();
    const program = compileStaticRankingPreparationPrograms(
      servant,
      rankingBasisFixture(servant).skillLevels,
    ).find(
      (item) =>
        item.sourceUses.map((use) => (use.kind === 'skill' ? use.skill.slot : 0)).join(',') ===
          '1,3,2' && item.expectedTerminalFormId.actorId === first.actorId,
    )!;
    const groups = rankingProgramSourceGroups(servant, program, 1);
    expect(groups.map(({ kind }) => kind)).toEqual([
      'automatic',
      'action',
      'automatic',
      'action',
      'action',
      'automatic',
      'terminal',
    ]);
    expect(
      groups.filter(({ kind }) => kind === 'automatic').map(({ damageActive }) => damageActive),
    ).toEqual([false, false, true]);
    expect(
      compileStaticRankingSemantics(servant, program, 1).operations.filter(
        ({ source }) => source.effectOccurrenceId === 'old-damage',
      ),
    ).toHaveLength(1);
  });
  it('rejects a missing terminal identity without producing a truncated source program', () => {
    const { servant } = formPath();
    const program = compileStaticRankingPreparationPrograms(
      servant,
      rankingBasisFixture(servant).skillLevels,
    )[0]!;
    expect(() =>
      rankingProgramSourceGroups(
        servant,
        {
          ...program,
          attackProfile: {
            ...program.attackProfile,
            noblePhantasmVariant: {
              ...program.attackProfile.noblePhantasmVariant,
              noblePhantasmId: 'absent',
            },
          },
        },
        1,
      ),
    ).toThrow('ranking_program_attack_variant_missing');
  });
});
import { rankingBasisFixture } from './rankingBasisFixture';
