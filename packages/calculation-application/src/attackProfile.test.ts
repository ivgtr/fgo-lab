import { describe, expect, it } from 'vitest';
import fixture from '../../test-fixtures/master/fixture.json';
import { masterSnapshotSchema, type ActorFormId, type ServantMaster } from '@fgo-lab/master-data';
import type { PreNoblePhantasmState } from '@fgo-lab/battle-execution';
import { createActorFormProfiles } from './attackProfile';
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
});
