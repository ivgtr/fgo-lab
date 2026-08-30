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
      'activationCondition.ts': 210,
      'activationContext.ts': 190,
      'candidateDecisions.ts': 110,
      'stochasticOutcomes.ts': 115,
      'candidatePreparation.ts': 300,
      'candidateSelection.ts': 180,
      'variantSelection.ts': 180,
      'candidateExecution.ts': 400,
      'candidateResult.ts': 200,
      'candidateFailure.ts': 100,
      'candidateProjection.ts': 100,
      'candidateComparison.ts': 80,
      'scenarioResult.ts': 100,
      'targetContext.ts': 230,
      'targetCandidateConstraint.ts': 100,
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

  it('keeps activation semantics behind one analyzer and one fact-set implementation', async () => {
    const condition = await source('packages/battle-execution/src/activationCondition.ts');
    const context = await source('packages/battle-execution/src/activationContext.ts');
    const application = await source('packages/calculation-application/src/activationContext.ts');
    const factSet = await source('packages/schema/src/activationFactSet.ts');
    expect(condition).toContain('analyzeActivationCondition');
    expect(context).toContain('analyzeActivationCondition');
    expect(context).toContain('analyzeActivationFactSet');
    expect(context).not.toContain('JSON.stringify');
    expect(application).toContain('analyzeActivationCondition');
    expect(application).not.toMatch(/condition\.kind\s*===\s*['"](?:all|any|not)['"]/);
    expect(factSet.split('\n').length).toBeLessThanOrEqual(150);
  });

  it('does not use an empty activation context as invalid preparation fallback', async () => {
    const context = await source('packages/battle-execution/src/activationContext.ts');
    const preparation = await source('packages/battle-execution/src/candidatePreparation.ts');
    const execution = await source('packages/battle-execution/src/candidateExecution.ts');
    expect(context).not.toContain('emptyActivationContext');
    expect(preparation).toContain("status: 'invalidActivationContext'");
    expect(preparation).not.toContain('emptyActivationContext');
    expect(execution).toContain("candidate.status === 'invalidActivationContext'");
  });

  it('keeps rejected activation state outside executable evaluators', async () => {
    const contracts = await source('packages/battle-execution/src/contracts.ts');
    const condition = await source('packages/battle-execution/src/condition.ts');
    const constraints = await source('packages/battle-execution/src/constraints.ts');
    const failure = await source('packages/battle-execution/src/candidateFailure.ts');
    expect(contracts).not.toMatch(/activationContext:\s*ActivationContext\s*\|\s*null/);
    expect(contracts).toContain('type BattleExecutionState =');
    expect(condition).not.toContain('activation_context_unavailable');
    expect(constraints).not.toContain('activation_context_unavailable');
    expect(failure).toContain('createRejectedBattleState');
    expect(failure).not.toContain('createInitialBattleState');
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
