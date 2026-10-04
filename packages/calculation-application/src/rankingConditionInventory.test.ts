import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { describe, expect, it } from 'vitest';
import {
  conditionAllowsEffectLocalDecision,
  conditionIsActivationLocal,
  type ConditionExpression,
} from '@fgo-lab/battle-execution';
import { conditionFactRequirements } from './conditionProvenance';
import { isAttackerDamageContribution } from './contributionPolicy';
import { compileStaticRankingPreparationPrograms } from './rankingStaticPreparation';
import { compileStaticRankingSemantics } from './rankingStaticSemantics';

const root = resolve(import.meta.dirname, '../../..');

function hasNegativeFieldRequirement(
  condition: ConditionExpression,
  negated: boolean = false,
): boolean {
  if (condition.kind === 'trait' && condition.scope === 'field')
    return condition.present === negated;
  if (condition.kind === 'traitCount' && condition.scope === 'field')
    return negated || condition.comparison !== 'atLeast';
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.expressions.some((expression) =>
      hasNegativeFieldRequirement(expression, negated),
    );
  if (condition.kind === 'not') return hasNegativeFieldRequirement(condition.expression, !negated);
  return false;
}

describe('production ranking condition provenance', () => {
  it('ratchets selectable conditions by canonical provenance and activation ownership', async () => {
    const master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
    const inventory = master.servants.flatMap((servant) => {
      const operations = new Map(
        compileStaticRankingPreparationPrograms(
          servant,
          rankingBasisFixture(servant).skillLevels,
        ).flatMap((program) =>
          compileStaticRankingSemantics(servant, program, 1).operations.map(
            (operation) => [operation.operationId, operation] as const,
          ),
        ),
      );
      return [...operations.values()].flatMap((operation) => {
        if (
          operation.decisionKey === null ||
          operation.decisionPlan.condition !== 'userMayAssume' ||
          !conditionAllowsEffectLocalDecision(operation.condition) ||
          !isAttackerDamageContribution(operation) ||
          (operation.kind === 'addModifier' && operation.modifier === 'powerMod')
        )
          return [];
        const requirements = conditionFactRequirements(operation.condition);
        return [
          {
            servantId: servant.id,
            name: servant.name,
            projectionKey: operation.operationId,
            occurrenceId: operation.source.effectOccurrenceId,
            activationLocal: conditionIsActivationLocal(operation.condition),
            kinds: [...new Set(requirements.map(({ kind }) => kind))].sort(),
            fields: requirements.flatMap(({ kind, condition }) =>
              kind === 'derivedOrExternalField' &&
              condition.kind === 'trait' &&
              condition.scope === 'field'
                ? [condition.trait]
                : [],
            ),
            negativeField: hasNegativeFieldRequirement(operation.condition),
          },
        ];
      });
    });
    const byKind = Object.fromEntries(
      (
        [
          'intrinsic',
          'derivedOrExternalField',
          'externalScenarioFact',
          'target',
          'procOrQuantity',
        ] as const
      ).map((kind) => [kind, inventory.filter(({ kinds }) => kinds.includes(kind)).length]),
    );
    const field = inventory.filter(({ fields }) => fields.length > 0);
    const fieldOccurrences = [
      ...new Set(field.map(({ servantId, occurrenceId }) => `${servantId}:${occurrenceId}`)),
    ].sort();
    expect(inventory).toHaveLength(129);
    expect(inventory.filter(({ activationLocal }) => activationLocal)).toHaveLength(34);
    expect(byKind).toEqual({
      intrinsic: 72,
      derivedOrExternalField: 37,
      externalScenarioFact: 36,
      target: 5,
      procOrQuantity: 20,
    });
    expect(field).toHaveLength(37);
    expect(fieldOccurrences).toHaveLength(37);
    expect(inventory.filter(({ negativeField }) => negativeField)).toHaveLength(0);
    expect(new Set(field.map(({ servantId }) => servantId)).size).toBe(27);
    expect(fieldOccurrences).toMatchInlineSnapshot(`
      [
        "100500:3370:0",
        "100700:959:0",
        "105000:959:0",
        "105400:9148:0",
        "1100700:7905:0",
        "1102300:23580:0",
        "204600:8875:0",
        "2300500:8986:0",
        "2300500:8987:0",
        "2300500:8988:0",
        "2501300:21182:0",
        "2800900:22424:0",
        "2800900:22427:0",
        "2800900:22430:0",
        "2801000:22548:0",
        "2801000:22551:0",
        "2801000:22552:0",
        "305500:7616:0",
        "305600:22299:0",
        "3300200:21814:0",
        "402400:9158:0",
        "403700:6010:0",
        "403700:6013:0",
        "403700:6022:0",
        "404500:7616:0",
        "405900:23569:0",
        "505100:8692:0",
        "505100:8693:0",
        "505100:8694:0",
        "505500:21680:0",
        "506000:23542:0",
        "601300:22390:0",
        "605000:21381:0",
        "702900:1622:0",
        "900400:984:0",
        "901400:9158:0",
        "901700:21145:0",
      ]
    `);
  }, 120_000);
});
import { rankingBasisFixture } from './rankingBasisFixture';
