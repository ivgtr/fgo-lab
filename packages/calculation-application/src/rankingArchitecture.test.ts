import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_RANKING_CONDITIONS } from './rankingContracts';

const root = resolve(import.meta.dirname, '../../..');

describe('ranking architecture', () => {
  it('exposes only the compact comparison policies', () => {
    expect(Object.keys(DEFAULT_RANKING_CONDITIONS).sort()).toEqual([
      'classAffinity',
      'comparisonMode',
      'field',
      'npLevel',
      'selfBuffs',
      'specialAttack',
    ]);
  });

  it('keeps policy construction separate from ranking result assembly', async () => {
    const facade = await readFile(
      resolve(root, 'packages/calculation-application/src/ranking.ts'),
      'utf8',
    );
    const factory = await readFile(
      resolve(root, 'packages/calculation-application/src/rankingScenario.ts'),
      'utf8',
    );
    expect(facade.split('\n').length).toBeLessThanOrEqual(180);
    expect(factory.split('\n').length).toBeLessThanOrEqual(250);
    expect(facade).not.toMatch(/targetContext\s*:/);
    expect(factory).not.toMatch(/servant\.id\s*===|servant\.name\s*===/);
    const world = await readFile(
      resolve(root, 'packages/calculation-application/src/rankingWorld.ts'),
      'utf8',
    );
    expect(world).not.toMatch(/function targetCompatibility|switch \(condition\.kind\)/);
    expect(world).toContain('validateTargetCandidateConstraint');
    expect(factory).not.toMatch(/for \(const .*effectControls[\s\S]*calculateScenario/);
    expect(factory).not.toContain('MAX_SPECIAL_ATTACK_SCENARIOS');
    expect(factory).not.toContain("from './effectDecision'");
    const choiceWorld = await readFile(
      resolve(root, 'packages/calculation-application/src/rankingChoiceWorld.ts'),
      'utf8',
    );
    expect(choiceWorld.split('\n').length).toBeLessThanOrEqual(100);
    expect(choiceWorld).not.toMatch(/servant\.id\s*===|servant\.name\s*===/);
    const policy = await readFile(
      resolve(root, 'packages/calculation-application/src/rankingExecutionPolicy.ts'),
      'utf8',
    );
    expect(policy).not.toContain("from './effectDecision'");
    expect(policy).not.toContain('applyTargetContextCommand');
    expect(policy.split('\n').length).toBeLessThanOrEqual(180);
  });

  it('reuses one standard matrix when only NP level changes', async () => {
    const worker = await readFile(
      resolve(root, 'apps/web/src/features/ranking/ranking.worker.ts'),
      'utf8',
    );
    expect(worker).toContain('standardMatrixCache');
    expect(worker).toContain('rankingMatrixPolicyKey');
    expect(worker).not.toMatch(/matrixKey.*npLevel/);
  });

  it('does not retain removed ranking conditions or raw Atlas vocabulary', async () => {
    const paths = [
      'packages/calculation-application/src/rankingContracts.ts',
      'packages/calculation-application/src/rankingScenario.ts',
      'apps/web/src/features/ranking/RankingConditions.tsx',
      'apps/web/src/features/ranking/rankingState.ts',
    ];
    const removed =
      /levelRule|supportTemplateId|attributeAffinityRule|targetTraits|fieldTraits|procPolicy|chainedProcPolicy|canonicalInputs\s*:|\bRate\b/;
    for (const path of paths) {
      const content = await readFile(resolve(root, path), 'utf8');
      expect(content, path).not.toMatch(removed);
    }
  });
});
