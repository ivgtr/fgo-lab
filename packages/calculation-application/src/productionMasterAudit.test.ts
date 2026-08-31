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

const root = resolve(import.meta.dirname, '../../..');
const productionMaster = readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8').then(
  (value) => masterSnapshotSchema.parse(JSON.parse(value)),
);

describe('production preparation semantics audit', () => {
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
      generated: 6_376,
      deduplicated: 3_957,
      terminal: 3_446,
      exactDuplicates: 2_419,
      rejectedActions: 70,
      rejectedActionCounts: {
        insufficientNpGauge: 6,
        unsupportedResourceMutation: 64,
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
    expect(terminalKeys).toHaveLength(3_446);
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
