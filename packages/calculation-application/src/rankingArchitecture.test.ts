import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_RANKING_CONDITIONS } from './rankingContracts';

const root = resolve(import.meta.dirname, '../../..');

describe('ranking architecture', () => {
  it('exposes only the five comparison policies', () => {
    expect(Object.keys(DEFAULT_RANKING_CONDITIONS).sort()).toEqual([
      'classAffinity',
      'comparisonMode',
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
