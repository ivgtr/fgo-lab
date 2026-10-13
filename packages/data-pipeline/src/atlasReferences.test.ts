import { describe, expect, it } from 'vitest';
import {
  atlasDocumentReferenceIds,
  atlasDocumentPotentialCallbackInventory,
  atlasFunctionReferenceCandidates,
  resolveAtlasSkillReferenceClosure,
} from './atlasReferences';

const fn = (id: number, referenceId: number) => ({
  funcId: id,
  buffs: [{ type: 'attackBeforeFunction' }],
  svals: [{ Rate: 1000, Value: referenceId, Value2: 1 }],
});

describe('Atlas skill reference closure', () => {
  it('uses the same reference interpretation in discovery and effect normalization', () => {
    expect(atlasFunctionReferenceCandidates(fn(1, 10))).toEqual([{ id: 10, level: 1 }]);
    expect(atlasDocumentReferenceIds({ skills: [{ functions: [fn(1, 10), fn(2, 10)] }] })).toEqual([
      10,
    ]);
    expect(
      atlasDocumentPotentialCallbackInventory({
        functions: [
          fn(1, 10),
          { funcId: 2, buffs: [{ type: 'selfturnendFunction' }], svals: [{ Value: 11 }] },
        ],
      }),
    ).toEqual({ buffTypes: ['attackBeforeFunction', 'selfturnendFunction'], skillIds: [10, 11] });
  });

  it('finds nested references once and rejects a cycle', async () => {
    const documents = [{ functions: [fn(1, 10)] }];
    const skills = new Map([
      [10, { id: 10, functions: [fn(2, 11)] }],
      [11, { id: 11, functions: [] }],
    ]);
    const calls: number[] = [];
    const closure = await resolveAtlasSkillReferenceClosure({
      documents,
      fetchSkill: (id) => {
        calls.push(id);
        return Promise.resolve(skills.get(id));
      },
    });
    expect([...closure.keys()]).toEqual([10, 11]);
    expect(calls).toEqual([10, 11]);

    skills.set(11, { id: 11, functions: [fn(3, 10)] });
    await expect(
      resolveAtlasSkillReferenceClosure({
        documents,
        fetchSkill: (id) => Promise.resolve(skills.get(id)),
      }),
    ).rejects.toThrow('atlas_reference:cycle:10');
  });

  it('rejects missing referenced skills without substituting a fixed list', async () => {
    await expect(
      resolveAtlasSkillReferenceClosure({
        documents: [{ functions: [fn(1, 10)] }],
        fetchSkill: () => Promise.resolve(undefined),
      }),
    ).rejects.toThrow('atlas_reference:invalid_skill:10');
  });
});
