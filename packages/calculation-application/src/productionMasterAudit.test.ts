import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  findNoblePhantasmVariant,
  getNoblePhantasmVariants,
  masterSnapshotSchema,
  noblePhantasmVariantKey,
} from '@fgo-lab/master-data';
import { describe, expect, it } from 'vitest';
import { createActorFormProfiles } from './attackProfile';
import { planPreNoblePhantasmCandidates } from './preNoblePhantasmPlanner';
import { calculateRankingPolicyDetail } from './rankingPolicyCalculation';
import { DEFAULT_RANKING_POLICY_CONDITIONS } from './rankingContracts';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';

const root = resolve(import.meta.dirname, '../../..');
const productionMaster = readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8').then(
  (value) => masterSnapshotSchema.parse(JSON.parse(value)),
);

describe('production preparation semantics audit', () => {
  it('admits intrinsic card buffs and fails closed for unrepresented HP costs', async () => {
    const master = await productionMaster;
    const versions = {
      schemaVersion: SCHEMA_VERSION,
      masterDataVersion: master.version,
      engineVersion: ENGINE_VERSION,
      appVersion: APP_VERSION,
      gameRegion: 'JP' as const,
      masterDataLocale: 'ja-JP' as const,
    };
    const profile = { servantBuilds: {} };
    const lily = master.servants.find(({ id }) => id === '100300')!;
    const manaBurst = lily.skills.find(({ name }) => name === '魔力放出 A')!;
    const lilyResult = calculateRankingPolicyDetail(
      lily,
      master,
      profile,
      DEFAULT_RANKING_POLICY_CONDITIONS,
      versions,
    );
    expect(lilyResult.status).toBe('calculated');
    if (lilyResult.status !== 'calculated') throw new Error(lilyResult.status);
    expect(lilyResult.detail.appliedPreparationActions).toEqual(
      expect.arrayContaining([expect.objectContaining({ sourceId: manaBurst.id })]),
    );

    const douman = master.servants.find(({ id }) => id === '1001000')!;
    const doumanSkill = douman.skills.find(({ id }) => id === '818552')!;
    const doumanResult = calculateRankingPolicyDetail(
      douman,
      master,
      profile,
      DEFAULT_RANKING_POLICY_CONDITIONS,
      versions,
    );
    expect(doumanResult.status).toBe('calculated');
    if (doumanResult.status !== 'calculated') throw new Error(doumanResult.status);
    expect(doumanResult.detail.appliedPreparationActions).toEqual(
      expect.arrayContaining([expect.objectContaining({ sourceId: doumanSkill.id })]),
    );
    expect(
      doumanResult.detail.effectiveContributions.contributions.filter(
        ({ source, effective }) => source.skillId === doumanSkill.id && effective,
      ),
    ).toHaveLength(2);

    const hijikata = master.servants.find(({ id }) => id === '702500')!;
    const hijikataResult = calculateRankingPolicyDetail(
      hijikata,
      master,
      profile,
      { ...DEFAULT_RANKING_POLICY_CONDITIONS, conditionalEffects: 'satisfied' },
      versions,
    );
    expect(hijikataResult.status).toBe('unsupported');
    if (hijikataResult.status !== 'unsupported') throw new Error(hijikataResult.status);
    expect(hijikataResult.reason).toMatch(/unsupported/i);
  }, 120_000);

  it('ratchets the finite preparation-state inventory and every legal terminal', async () => {
    const master = await productionMaster;
    const inventory = {
      servants: 0,
      generated: 0,
      deduplicated: 0,
      terminal: 0,
      exactDuplicates: 0,
      rejectedActions: 0,
      rejectedActionCounts: {} as Record<string, number>,
      maximumPreparationActions: 0,
      maximumSemanticStates: 0,
      actorFormNodes: 0,
      actorFormProfiles: 0,
      attackVariants: 0,
      nonAttackVariants: 0,
      transformNoblePhantasmServants: 0,
      nonAttackWithoutAttack: 0,
      maximumActorFormNodes: 0,
      maximumActorFormProfiles: 0,
      maximumInitialForms: 0,
      maximumTransitionEdges: 0,
    };
    const terminalKeys = new Set<string>();
    for (const servant of master.servants) {
      const planned = planPreNoblePhantasmCandidates(servant, master.npResourceSemantics, 1, 1);
      const actorFormProfiles = createActorFormProfiles(
        servant,
        planned.candidates.map(({ terminalState }) => terminalState),
      );
      const variants = getNoblePhantasmVariants(servant);
      if (planned.candidates.length > 0) inventory.servants += 1;
      inventory.generated += planned.inventory.generatedStateCount;
      inventory.deduplicated += planned.inventory.deduplicatedStateCount;
      inventory.terminal += planned.inventory.terminalPlanCount;
      inventory.exactDuplicates += planned.inventory.exactDuplicateCount;
      inventory.rejectedActions += planned.inventory.rejectedActionCount;
      for (const [code, count] of Object.entries(planned.inventory.rejectedActionCounts))
        inventory.rejectedActionCounts[code] = (inventory.rejectedActionCounts[code] ?? 0) + count;
      inventory.maximumPreparationActions = Math.max(
        inventory.maximumPreparationActions,
        planned.inventory.maximumPreparationActionCount,
      );
      inventory.maximumSemanticStates = Math.max(
        inventory.maximumSemanticStates,
        planned.inventory.deduplicatedStateCount,
      );
      inventory.actorFormNodes += servant.actorFormGraph.forms.length;
      inventory.actorFormProfiles += actorFormProfiles.length;
      inventory.attackVariants += variants.filter(({ kind }) => kind === 'attack').length;
      inventory.nonAttackVariants += variants.filter(({ kind }) => kind === 'nonAttack').length;
      if (
        planned.candidates.some(({ commands }) =>
          commands.some(({ kind }) => kind === 'useTransformNoblePhantasm'),
        )
      )
        inventory.transformNoblePhantasmServants += 1;
      if (planned.candidates.length === 0 && variants.some(({ kind }) => kind === 'nonAttack'))
        inventory.nonAttackWithoutAttack += 1;
      inventory.maximumActorFormNodes = Math.max(
        inventory.maximumActorFormNodes,
        servant.actorFormGraph.forms.length,
      );
      inventory.maximumActorFormProfiles = Math.max(
        inventory.maximumActorFormProfiles,
        actorFormProfiles.length,
      );
      inventory.maximumInitialForms = Math.max(
        inventory.maximumInitialForms,
        servant.actorFormGraph.initialFormIds.length,
      );
      inventory.maximumTransitionEdges = Math.max(
        inventory.maximumTransitionEdges,
        servant.actorFormGraph.transitions.length,
      );
      for (const candidate of planned.candidates) {
        expect(candidate.terminalState.terminated, servant.id).toBe(true);
        expect(candidate.commands.at(-1), servant.id).toEqual({
          kind: 'executeAttackNoblePhantasm',
        });
        expect(candidate.terminalState.appliedActions).toHaveLength(candidate.commands.length);
        const ref = candidate.terminalState.selectedNoblePhantasmVariant;
        expect(ref, servant.id).not.toBeNull();
        const variant = ref ? findNoblePhantasmVariant(servant, ref) : undefined;
        expect(variant?.kind, servant.id).toBe('attack');
        terminalKeys.add(`${servant.id}:${candidate.semanticStateKey}`);
      }
    }

    expect(inventory).toEqual({
      servants: 422,
      generated: 6_364,
      deduplicated: 3_958,
      terminal: 3_445,
      exactDuplicates: 2_406,
      rejectedActions: 79,
      rejectedActionCounts: {
        insufficientNpGauge: 6,
        unsupportedResourceMutation: 73,
      },
      maximumPreparationActions: 4,
      maximumSemanticStates: 56,
      actorFormNodes: 484,
      actorFormProfiles: 484,
      attackVariants: 626,
      nonAttackVariants: 101,
      transformNoblePhantasmServants: 1,
      nonAttackWithoutAttack: 47,
      maximumActorFormNodes: 7,
      maximumActorFormProfiles: 7,
      maximumInitialForms: 7,
      maximumTransitionEdges: 2,
    });
    expect(terminalKeys).toHaveLength(3_445);
  }, 30_000);

  it('keeps applied choice and transition evidence local to its source action', async () => {
    const master = await productionMaster;
    let actionCount = 0;
    let choiceFactCount = 0;
    let transitionCount = 0;
    for (const servant of master.servants)
      for (const candidate of planPreNoblePhantasmCandidates(
        servant,
        master.npResourceSemantics,
        1,
        1,
      ).candidates)
        for (const action of candidate.terminalState.appliedActions) {
          actionCount += 1;
          choiceFactCount += action.activationFacts.filter(({ kind }) => kind === 'choice').length;
          if (action.transition) transitionCount += 1;
          for (const fact of action.activationFacts)
            expect(fact.source.skillId).toBe(
              action.sourceKind === 'noblePhantasm'
                ? `np:${noblePhantasmVariantKey({
                    actorFormId: action.actorFormId,
                    noblePhantasmId: action.sourceId,
                  })}`
                : action.sourceId,
            );
        }

    expect(actionCount).toBeGreaterThan(3_559);
    expect(choiceFactCount).toBeGreaterThan(0);
    expect(transitionCount).toBeGreaterThan(0);
  });
});
