import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_RANKING_POLICY_CONDITIONS } from './rankingContracts';

const root = resolve(import.meta.dirname, '../../..');

describe('ranking architecture', () => {
  it('exposes only the compact comparison policies', () => {
    expect(Object.keys(DEFAULT_RANKING_POLICY_CONDITIONS).sort()).toEqual([
      'classAffinity',
      'conditionalEffects',
      'initialOvercharge',
      'levelBasis',
      'npLevelBasis',
      'population',
      'selfBuffs',
    ]);
  });

  it('keeps policy construction separate from ranking result assembly', async () => {
    const facade = await readFile(
      resolve(root, 'packages/calculation-application/src/rankingPolicyCalculation.ts'),
      'utf8',
    );
    const factory = await readFile(
      resolve(root, 'packages/calculation-application/src/rankingPolicyScenario.ts'),
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
    expect(world).toContain('materializeRankingWorld');
    expect(world).not.toContain('targetConditionWitnessSpace');
    const domain = await readFile(
      resolve(root, 'packages/calculation-application/src/rankingWorldDomain.ts'),
      'utf8',
    );
    const observation = await readFile(
      resolve(root, 'packages/calculation-application/src/rankingWorldObservation.ts'),
      'utf8',
    );
    const quotient = await readFile(
      resolve(root, 'packages/calculation-application/src/rankingWorldQuotient.ts'),
      'utf8',
    );
    const certificate = await readFile(
      resolve(root, 'packages/calculation-application/src/rankingCandidateCertificate.ts'),
      'utf8',
    );
    expect(domain).toContain('targetConditionWitnessSpace');
    expect(domain).not.toContain('observeRankingWorld');
    expect(observation).toContain('RankingWorldObservationStep');
    expect(observation).not.toContain('selectRankingWorldRepresentative');
    expect(quotient).toContain('selectRankingWorldRepresentative');
    expect(certificate).toContain('finiteSemanticProductBound');
    expect(factory).not.toMatch(/for \(const .*effectControls[\s\S]*calculateScenario/);
    expect(factory).not.toContain('MAX_SPECIAL_ATTACK_SCENARIOS');
    expect(factory).not.toContain("from './effectDecision'");
    const execution = await readFile(
      resolve(root, 'packages/calculation-application/src/rankingExecution.ts'),
      'utf8',
    );
    expect(execution.split('\n').length).toBeLessThanOrEqual(140);
    expect(execution).not.toContain("from './effectDecision'");
    expect(execution).not.toContain('applyTargetContextCommand');
    expect(execution).not.toMatch(/activationFacts\.(push|splice)|effectDecisions\.(push|splice)/);
    await expect(
      readFile(resolve(root, 'packages/calculation-application/src/rankingChoiceWorld.ts')),
    ).rejects.toThrow();
    await expect(
      readFile(resolve(root, 'packages/calculation-application/src/rankingExecutionPolicy.ts')),
    ).rejects.toThrow();
  });

  it('uses only canonical policy calculations and does not retain the legacy matrix', async () => {
    const worker = await readFile(
      resolve(root, 'apps/web/src/features/ranking/ranking.worker.ts'),
      'utf8',
    );
    const runtime = await readFile(
      resolve(root, 'apps/web/src/features/ranking/rankingWorkerRuntime.ts'),
      'utf8',
    );
    expect(worker).toContain('createRankingWorkerRuntime');
    expect(runtime).toContain('calculateRankingPolicy');
    expect(runtime).toContain('rankingConditionsFingerprint');
    expect(runtime).not.toMatch(/calculateStandardRankingMatrix|rankingMatrixPolicyKey/);
  });

  it('does not retain removed ranking conditions or raw Atlas vocabulary', async () => {
    const paths = [
      'packages/calculation-application/src/rankingContracts.ts',
      'packages/calculation-application/src/rankingPolicyScenario.ts',
      'apps/web/src/features/ranking/RankingConditions.tsx',
      'apps/web/src/features/ranking/rankingState.ts',
    ];
    const removed =
      /levelRule|supportTemplateId|attributeAffinityRule|targetTraits|fieldTraits|procPolicy|chainedProcPolicy|canonicalInputs\s*:|\bRate\b|rSpecial|rField|specialAttack\s*:|field\s*:/;
    for (const path of paths) {
      const content = await readFile(resolve(root, path), 'utf8');
      expect(content, path).not.toMatch(removed);
    }
    for (const path of [
      'packages/calculation-application/src/ranking.ts',
      'packages/calculation-application/src/rankingMatrix.ts',
      'packages/calculation-application/src/legacyRankingSelection.ts',
    ])
      await expect(readFile(resolve(root, path))).rejects.toThrow();
  });
});
