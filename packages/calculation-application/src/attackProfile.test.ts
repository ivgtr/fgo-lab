import { describe, expect, it } from 'vitest';
import fixture from '../../test-fixtures/master/fixture.json';
import { masterSnapshotSchema, type ActorFormId, type ServantMaster } from '@fgo-lab/master-data';
import type { PreNoblePhantasmState } from '@fgo-lab/battle-execution';
import {
  actorFormProfileIdKey,
  attackProfileForTerminalState,
  attackProfileKey,
  createActorFormProfiles,
} from './attackProfile';
import { planPreNoblePhantasmCandidates } from './preNoblePhantasmPlanner';

const master = masterSnapshotSchema.parse(fixture);

function duplicatedFormFixture(): {
  servant: ServantMaster;
  original: PreNoblePhantasmState;
  duplicate: PreNoblePhantasmState;
  duplicateFormId: ActorFormId;
} {
  const source = master.servants[0]!;
  const original = planPreNoblePhantasmCandidates(source).candidates[0]!.terminalState;
  const sourceForm = source.actorFormGraph.forms.find(
    ({ id }) =>
      id.actorId === original.currentFormId.actorId &&
      id.limitCount === original.currentFormId.limitCount,
  )!;
  const duplicateFormId = {
    actorId: `${sourceForm.id.actorId}-semantic-duplicate`,
    limitCount: sourceForm.id.limitCount,
  };
  const servant: ServantMaster = {
    ...source,
    actorFormGraph: {
      ...source.actorFormGraph,
      forms: [...source.actorFormGraph.forms, { ...sourceForm, id: duplicateFormId }],
      initialFormIds: [...source.actorFormGraph.initialFormIds, duplicateFormId],
    },
  };
  return {
    servant,
    original,
    duplicate: {
      ...original,
      initialFormId: duplicateFormId,
      currentFormId: duplicateFormId,
    },
    duplicateFormId,
  };
}

describe('ActorFormProfile canonical equivalence', () => {
  it('merges presentation-only form duplicates', () => {
    const { servant, original, duplicate } = duplicatedFormFixture();
    const profiles = createActorFormProfiles(servant, [original, duplicate]);
    expect(profiles).toHaveLength(servant.actorFormGraph.forms.length - 1);
    expect(profiles.find(({ formIds }) => formIds.length === 2)?.formIds).toEqual(
      expect.arrayContaining([original.currentFormId, duplicate.currentFormId]),
    );
  });

  it('keeps canonical identity independent from the representative form ordering', () => {
    const source = master.servants[0]!;
    const original = planPreNoblePhantasmCandidates(source).candidates[0]!.terminalState;
    const originalProfile = createActorFormProfiles(source, [original]).find(({ formIds }) =>
      formIds.some(
        ({ actorId, limitCount }) =>
          actorId === original.currentFormId.actorId &&
          limitCount === original.currentFormId.limitCount,
      ),
    )!;
    const { servant, duplicate } = duplicatedFormFixture();
    const reordered = {
      ...servant,
      actorFormGraph: {
        ...servant.actorFormGraph,
        forms: [...servant.actorFormGraph.forms].reverse(),
      },
    };
    const mergedProfile = createActorFormProfiles(reordered, [original, duplicate]).find(
      ({ formIds }) => formIds.length === 2,
    )!;

    expect(actorFormProfileIdKey(mergedProfile.id)).toBe(actorFormProfileIdKey(originalProfile.id));
    expect(
      attackProfileKey(attackProfileForTerminalState(reordered, [mergedProfile], original)),
    ).toBe(attackProfileKey(attackProfileForTerminalState(source, [originalProfile], original)));
  });

  it('does not merge forms with a different skill set', () => {
    const { servant, original, duplicate, duplicateFormId } = duplicatedFormFixture();
    const skillVariant = {
      id: 'profile-test-skill',
      slot: 1,
      priority: 0,
      name: 'profile test skill',
      detail: '',
      imageKey: null,
      effects: [],
    };
    const changed: ServantMaster = {
      ...servant,
      skills: [...servant.skills, skillVariant],
      actorFormGraph: {
        ...servant.actorFormGraph,
        forms: servant.actorFormGraph.forms.map((form) =>
          form.id.actorId === duplicateFormId.actorId
            ? { ...form, skillIds: [...form.skillIds, skillVariant.id] }
            : form,
        ),
      },
    };
    expect(createActorFormProfiles(changed, [original, duplicate])).toHaveLength(
      changed.actorFormGraph.forms.length,
    );
  });

  it.each([
    [
      'trait',
      (form: ServantMaster['actorFormGraph']['forms'][number]) => ({
        ...form,
        traits: [...form.traits, 'profile-test-trait'],
      }),
    ],
    [
      'base NP variant',
      (form: ServantMaster['actorFormGraph']['forms'][number]) => ({
        ...form,
        baseNoblePhantasmVariant: form.baseNoblePhantasmVariant
          ? {
              ...form.baseNoblePhantasmVariant,
              noblePhantasmId: `${form.baseNoblePhantasmVariant.noblePhantasmId}-profile-test`,
            }
          : null,
      }),
    ],
  ])('does not merge forms with a different %s', (_, change) => {
    const { servant, original, duplicate, duplicateFormId } = duplicatedFormFixture();
    const changed: ServantMaster = {
      ...servant,
      actorFormGraph: {
        ...servant.actorFormGraph,
        forms: servant.actorFormGraph.forms.map((form) =>
          form.id.actorId === duplicateFormId.actorId ? change(form) : form,
        ),
      },
    };
    const profiles = createActorFormProfiles(changed, [original, duplicate]);
    expect(profiles).toHaveLength(changed.actorFormGraph.forms.length);
  });

  it('fails closed when the terminal form maps to ambiguous profiles', () => {
    const source = master.servants[0]!;
    const terminal = planPreNoblePhantasmCandidates(source).candidates[0]!.terminalState;
    const profile = createActorFormProfiles(source, [terminal]).find(({ formIds }) =>
      formIds.some(
        ({ actorId, limitCount }) =>
          actorId === terminal.currentFormId.actorId &&
          limitCount === terminal.currentFormId.limitCount,
      ),
    )!;

    expect(() => attackProfileForTerminalState(source, [profile, profile], terminal)).toThrow(
      `terminal_actor_form_profile_ambiguous`,
    );
  });

  it('fails closed when an AttackProfile carries contradictory identity fields', () => {
    const source = master.servants[0]!;
    const terminal = planPreNoblePhantasmCandidates(source).candidates[0]!.terminalState;
    const profiles = createActorFormProfiles(source, [terminal]);
    const attackProfile = attackProfileForTerminalState(source, profiles, terminal);

    expect(() =>
      attackProfileKey({
        ...attackProfile,
        id: { ...attackProfile.id, servantLineageId: 'contradictory-lineage' },
      }),
    ).toThrow('attack_profile_lineage_mismatch');
    expect(() =>
      attackProfileKey({
        ...attackProfile,
        id: { ...attackProfile.id, attackNoblePhantasmVariantId: 'contradictory-variant' },
      }),
    ).toThrow('attack_profile_variant_mismatch');
  });
});
