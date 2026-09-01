import { describe, expect, it } from 'vitest';
import fixture from '../../test-fixtures/master/fixture.json';
import { masterSnapshotSchema, type ActorFormId, type ServantMaster } from '@fgo-lab/master-data';
import type { PreNoblePhantasmState } from '@fgo-lab/battle-execution';
import {
  actorFormProfileIdKey,
  attackProfileForTerminalState,
  attackProfileKey,
  createActorFormProfiles,
  createStaticAttackProfiles,
} from './attackProfile';
import { planPreNoblePhantasmCandidates } from './preNoblePhantasmPlanner';
import { compileStaticRankingPreparationPrograms } from './rankingStaticPreparation';

const master = masterSnapshotSchema.parse(fixture);

function duplicatedFormFixture(): {
  servant: ServantMaster;
  original: PreNoblePhantasmState;
  duplicate: PreNoblePhantasmState;
  duplicateFormId: ActorFormId;
} {
  const source = master.servants[0]!;
  const original = planPreNoblePhantasmCandidates(source, master.npResourceSemantics, 1, 1)
    .candidates[0]!.terminalState;
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
  it('builds policy-independent attack profiles and static preparation programs', () => {
    const servant = master.servants[0]!;
    const profiles = createStaticAttackProfiles(servant);
    const programs = compileStaticRankingPreparationPrograms(servant);
    expect(profiles).toHaveLength(1);
    expect(programs.map(({ attackProfile }) => attackProfileKey(attackProfile))).toEqual([
      attackProfileKey(profiles[0]!),
    ]);
    expect(programs[0]?.commands).toEqual([{ kind: 'executeAttackNoblePhantasm' }]);
  });
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
    const original = planPreNoblePhantasmCandidates(source, master.npResourceSemantics, 1, 1)
      .candidates[0]!.terminalState;
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

  it('keeps form-qualified variants with one raw NP ID separate by canonical semantics', () => {
    const { servant, original, duplicate, duplicateFormId } = duplicatedFormFixture();
    const sourceVariant = servant.noblePhantasmVariantGroups[0]!.variants[0]!;
    if (sourceVariant.kind !== 'attack') throw new TypeError('attack fixture required');
    const duplicateRef = {
      actorFormId: duplicateFormId,
      noblePhantasmId: sourceVariant.ref.noblePhantasmId,
    };
    const conflictingVariant = {
      ...sourceVariant,
      ref: duplicateRef,
      canonicalId: 'form-qualified-quick-variant',
      card: 'quick' as const,
    };
    const conflictingServant: ServantMaster = {
      ...servant,
      noblePhantasmVariantGroups: servant.noblePhantasmVariantGroups.map((group, index) =>
        index === 0 ? { ...group, variants: [...group.variants, conflictingVariant] } : group,
      ),
    };
    const conflictingDuplicate = {
      ...duplicate,
      selectedNoblePhantasmVariant: duplicateRef,
    };
    const profiles = createActorFormProfiles(conflictingServant, [original, conflictingDuplicate]);
    const originalAttack = attackProfileForTerminalState(conflictingServant, profiles, original);
    const duplicateAttack = attackProfileForTerminalState(
      conflictingServant,
      profiles,
      conflictingDuplicate,
    );

    // E2E-A037-SAME-CARD
    expect(originalAttack.cardType).toBe('buster');
    expect(duplicateAttack.cardType).toBe('quick');
    expect(attackProfileKey(originalAttack)).not.toBe(attackProfileKey(duplicateAttack));
  });

  it('uses canonical semantics for form-qualified non-attack base variants', () => {
    const build = (duplicatePriority: number, duplicateCanonicalId: string) => {
      const { servant, original, duplicate, duplicateFormId } = duplicatedFormFixture();
      const baseRef = {
        actorFormId: original.currentFormId,
        noblePhantasmId: 'shared-non-attack-base',
      };
      const duplicateRef = {
        actorFormId: duplicateFormId,
        noblePhantasmId: baseRef.noblePhantasmId,
      };
      const canonicalId = 'shared-non-attack-canonical';
      const changed: ServantMaster = {
        ...servant,
        actorFormGraph: {
          ...servant.actorFormGraph,
          forms: servant.actorFormGraph.forms.map((form) => {
            if (form.id.actorId === original.currentFormId.actorId)
              return { ...form, baseNoblePhantasmVariant: baseRef };
            if (form.id.actorId === duplicateFormId.actorId)
              return { ...form, baseNoblePhantasmVariant: duplicateRef };
            return form;
          }),
        },
        noblePhantasmVariantGroups: [
          ...servant.noblePhantasmVariantGroups,
          {
            id: 'shared-non-attack-base-group',
            baseVariant: baseRef,
            variants: [
              {
                kind: 'nonAttack' as const,
                canonicalId,
                ref: baseRef,
                name: 'base presentation',
                priority: 1,
                effects: [],
              },
              {
                kind: 'nonAttack' as const,
                canonicalId: duplicateCanonicalId,
                ref: duplicateRef,
                name: 'duplicate presentation',
                priority: duplicatePriority,
                effects: [],
              },
            ],
          },
        ],
      };
      return { changed, original, duplicate, canonicalId };
    };

    const equivalent = build(1, 'shared-non-attack-canonical');
    const equivalentProfiles = createActorFormProfiles(equivalent.changed, [
      equivalent.original,
      equivalent.duplicate,
    ]);
    expect(
      equivalentProfiles.find(({ formIds }) =>
        formIds.some(({ actorId }) => actorId === equivalent.original.currentFormId.actorId),
      )?.formIds,
    ).toHaveLength(2);

    const distinct = build(2, 'different-non-attack-canonical');
    const distinctProfiles = createActorFormProfiles(distinct.changed, [
      distinct.original,
      distinct.duplicate,
    ]);
    expect(
      distinctProfiles.filter(({ formIds }) =>
        formIds.some(
          ({ actorId }) =>
            actorId === distinct.original.currentFormId.actorId ||
            actorId === distinct.duplicate.currentFormId.actorId,
        ),
      ),
    ).toHaveLength(2);
  });

  it('fails closed when a base NP ref is unresolved or ambiguous', () => {
    const { servant, original, duplicate, duplicateFormId } = duplicatedFormFixture();
    const missingRef = { actorFormId: duplicateFormId, noblePhantasmId: 'missing-base-variant' };
    const missing: ServantMaster = {
      ...servant,
      actorFormGraph: {
        ...servant.actorFormGraph,
        forms: servant.actorFormGraph.forms.map((form) =>
          form.id.actorId === duplicateFormId.actorId
            ? { ...form, baseNoblePhantasmVariant: missingRef }
            : form,
        ),
      },
    };
    expect(() => createActorFormProfiles(missing, [original, duplicate])).toThrow(
      'base_noble_phantasm_variant_missing',
    );

    const sourceVariant = servant.noblePhantasmVariantGroups[0]!.variants[0]!;
    const ambiguous: ServantMaster = {
      ...servant,
      noblePhantasmVariantGroups: servant.noblePhantasmVariantGroups.map((group, index) =>
        index === 0 ? { ...group, variants: [...group.variants, sourceVariant] } : group,
      ),
    };
    expect(() => createActorFormProfiles(ambiguous, [original, duplicate])).toThrow(
      'noble_phantasm_variant_ambiguous',
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
      resourceRequirement: null,
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

  it('does not merge forms with a different trait', () => {
    const { servant, original, duplicate, duplicateFormId } = duplicatedFormFixture();
    const changed: ServantMaster = {
      ...servant,
      actorFormGraph: {
        ...servant.actorFormGraph,
        forms: servant.actorFormGraph.forms.map((form) =>
          form.id.actorId === duplicateFormId.actorId
            ? { ...form, traits: [...form.traits, 'profile-test-trait'] }
            : form,
        ),
      },
    };
    const profiles = createActorFormProfiles(changed, [original, duplicate]);
    expect(profiles).toHaveLength(changed.actorFormGraph.forms.length);
  });

  it('fails closed when the terminal form maps to ambiguous profiles', () => {
    const source = master.servants[0]!;
    const terminal = planPreNoblePhantasmCandidates(source, master.npResourceSemantics, 1, 1)
      .candidates[0]!.terminalState;
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
    const terminal = planPreNoblePhantasmCandidates(source, master.npResourceSemantics, 1, 1)
      .candidates[0]!.terminalState;
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
        id: {
          ...attackProfile.id,
          attackNoblePhantasmVariantCanonicalId: 'contradictory-variant',
        },
      }),
    ).toThrow('attack_profile_variant_mismatch');
  });
});
