import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../..');

async function source(path: string) {
  return readFile(resolve(root, path), 'utf8');
}

describe('battle execution architecture', () => {
  it('keeps engine as orchestration instead of a semantic owner', async () => {
    const engine = await source('packages/battle-execution/src/engine.ts');
    expect(engine.split('\n').length).toBeLessThanOrEqual(80);
    expect(engine).not.toContain('validateConstraintSet');
    expect(engine).not.toContain('resolveOperationActivation');
    expect(engine).not.toContain('TargetPredicate');
  });

  it('keeps ordered execution stages within explicit responsibility boundaries', async () => {
    const limits = {
      'executionPlan.ts': 280,
      'candidatePreparation.ts': 300,
      'candidateExecution.ts': 400,
      'candidateResult.ts': 200,
      'candidateComparison.ts': 80,
      'scenarioResult.ts': 100,
      'targetContext.ts': 230,
    } as const;
    for (const [file, maximumLines] of Object.entries(limits)) {
      const content = await source(`packages/battle-execution/src/${file}`);
      expect(content.split('\n').length, file).toBeLessThanOrEqual(maximumLines);
    }
  });

  it('does not duplicate target resolution or candidate comparison in the executor stages', async () => {
    const candidate = await source('packages/battle-execution/src/candidateExecution.ts');
    const result = await source('packages/battle-execution/src/candidateResult.ts');
    expect(candidate).not.toContain('resolveTargetCandidates');
    expect(candidate).not.toContain('damageFingerprint');
    expect(result).not.toContain('validateConstraintSet');
    expect(result).not.toContain('resolveOperationActivation');
  });

  it('keeps Atlas vocabulary outside runtime target semantics', async () => {
    for (const path of [
      'packages/battle-execution/src/targetContext.ts',
      'packages/calculation-application/src/targetContext.ts',
      'apps/web/src/features/calculator/Calculator.tsx',
    ]) {
      const content = await source(path);
      expect(content).not.toMatch(/classSaber|classBeast|attributeSky|predicateTrait/);
    }
  });
});
