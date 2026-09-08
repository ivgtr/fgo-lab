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
  const base = compileStaticRankingPreparationPrograms(original)[0]!;
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
  it('distinguishes activation order from the final damage projection after a form change', () => {
    const { servant, second } = formPath();
    const program = compileStaticRankingPreparationPrograms(servant).find(
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
    const program = compileStaticRankingPreparationPrograms(servant).find(
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
    const program = compileStaticRankingPreparationPrograms(servant)[0]!;
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
