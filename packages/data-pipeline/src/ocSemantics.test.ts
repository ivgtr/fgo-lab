import { describe, expect, it } from 'vitest';
import { ocExecutionOperationSchema } from '@fgo-lab/master-data';
import { normalizeOcSemantics } from './ocSemantics';
import { normalizeFunctions } from './effectNormalization';
import type { AtlasFunction } from './atlasContract';
import { normalizeCraftEssenceLimitBreakEffects } from './craftEssenceNormalization';

const positive = { id: 3004, name: 'buffPositiveEffect' };
const fn = (values: Record<string, number> = {}): AtlasFunction => ({
  funcId: 1,
  funcType: 'addState',
  funcTargetType: 'self',
  buffs: [
    {
      type: 'upChagetd',
      buffGroup: 0,
      maxRate: 5,
      vals: [positive],
      tvals: [],
      ckSelfIndv: [],
      ckOpIndv: [],
    },
  ],
  svals: [{ Rate: 1000, Value: 2, Turn: 3, Count: 1, ...values }],
});
function normalize(value = fn(), traitNameById: ReadonlyMap<number, string> = new Map()) {
  return normalizeOcSemantics({
    fn: value,
    parameterSets: [value.svals ?? [], [], [], [], []],
    expressions: [[], [], [], [], []],
    source: 'skill',
    traitNameById,
    route: {
      target: 'sourceSelf',
      contributionScope: 'personal',
      eligibility: { kind: 'anyRecipient', onMissing: 'unsupported' },
    },
  });
}
describe('lossless OC IR', () => {
  it('preserves a damage-readable negative state alongside the OC rate operation', () => {
    const value = fn({ Value: 200 });
    value.funcTargetType = 'enemy';
    value.buffs![0]!.type = 'upTolerance';
    value.buffs![0]!.tvals = [positive];
    value.buffs![0]!.maxRate = 5000;
    value.buffs![0]!.vals = [{ id: 3005, name: 'buffNegativeEffect' }];
    const effects = normalizeFunctions(
      [value],
      new Map([[3005, 'buffNegativeEffect']]),
      'skill',
      1,
      new Map(),
      undefined,
      undefined,
      undefined,
      { stateOnlyTraits: new Set(['buffNegativeEffect']) },
    );
    expect(effects[0]!.execution).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'contextMutation',
          mutation: 'addTrait',
          trait: 'buffNegativeEffect',
        }),
        expect.objectContaining({ kind: 'grantOcApplicationRate', role: 'recipientResistance' }),
      ]),
    );
  });
  it('retains the removal-resistance boundary with its rate and lifetime', () => {
    const value = fn({ Value: 1000, Count: 1 });
    value.buffs![0]!.type = 'upToleranceSubstate';
    const result = normalize(value);
    expect(result).toMatchObject([
      {
        kind: 'ocRemovalResistance',
        cells: [
          [
            {
              applicationRatePermille: 1000,
              amount: { kind: 'fixed', value: 1000 },
              uses: { kind: 'finite', remaining: 1 },
            },
          ],
          [],
          [],
          [],
          [],
        ],
      },
    ]);
    expect(ocExecutionOperationSchema.safeParse(result?.[0]).success).toBe(true);
  });

  it.each([-1, 0, 1, 3, 4])('retains count %i without treating unlimited as empty', (count) => {
    const operation = ocExecutionOperationSchema.parse(normalize(fn({ Count: count }))![0]);
    expect(operation).toMatchObject({
      kind: 'grantOcBoost',
      cells: [
        [
          {
            stages: 2,
            applicationRatePermille: 1000,
            uses: count === -1 ? { kind: 'unlimited' } : { kind: 'finite', remaining: count },
          },
        ],
        [],
        [],
        [],
        [],
      ],
    });
  });
  it('keeps unclamped application rates distinct', () => {
    expect(normalize(fn({ Rate: 5000 }))).not.toEqual(normalize(fn({ Rate: 1000 })));
  });
  it.each(['Count', 'Turn', 'Rate', 'Value'])('rejects a missing %s', (key) => {
    const value = fn();
    value.svals![0] = Object.fromEntries(
      Object.entries(value.svals![0]!).filter(([field]) => field !== key),
    );
    expect(() => normalize(value)).toThrow();
  });
  it('fails closed for unknown stacking', () => {
    const value = fn();
    value.buffs![0]!.buffGroup = 1;
    expect(normalize(value)).toMatchObject([{ kind: 'unsupported' }]);
  });
  it('does not replace an unrecognized HP expression with its fixed base', () => {
    const value = fn({ Value: 100, RatioHPHigh: 400 });
    value.buffs![0]!.type = 'upGrantstate';
    value.buffs![0]!.maxRate = 5000;
    value.buffs![0]!.tvals = [positive];
    expect(normalizeFunctions([value], new Map())[0]!.execution).toMatchObject([
      { kind: 'unsupported', damageRelevant: true },
    ]);
  });
  it('does not drop a mixed rate selector', () => {
    const value = fn();
    value.buffs![0]!.type = 'upGrantstate';
    value.buffs![0]!.maxRate = 5000;
    value.buffs![0]!.tvals = [positive, { name: 'unknown' }];
    expect(normalize(value)).toMatchObject([{ kind: 'unsupported' }]);
  });
  it('does not interpret a dynamic OC stage as a fixed stage', () => {
    expect(normalize(fn({ RatioHPLow: 2 }))).toMatchObject([{ kind: 'unsupported' }]);
  });
  it('fails closed for a future parameter instead of bypassing the shared semantic gate', () => {
    expect(
      normalizeFunctions([fn({ UnknownOcModifier: 1 })], new Map())[0]!.execution,
    ).toMatchObject([{ kind: 'unsupported', damageRelevant: true }]);
  });
  it('retains the HP rate expression and removes buff selectors from actor conditions', () => {
    const value = fn({ Value: 0, RatioHPLow: 400 });
    value.buffs = [
      {
        type: 'upGrantstate',
        buffGroup: 0,
        maxRate: 5000,
        vals: [positive],
        tvals: [positive],
        ckSelfIndv: [positive],
      },
    ];
    const [effect] = normalizeFunctions([value], new Map([[3004, 'buffPositiveEffect']]));
    expect(effect).toMatchObject({
      requirement: { expression: { kind: 'always' } },
      execution: [
        {
          kind: 'grantOcApplicationRate',
          role: 'casterGrant',
          cells: [
            [
              {
                amount: {
                  kind: 'inverseHpLinear',
                  basePermille: 0,
                  bonusAtZeroHpPermille: 400,
                },
              },
            ],
            [],
            [],
            [],
            [],
          ],
        },
      ],
    });
  });
  it('keeps normal count3 and LB count4 on one constant source', () => {
    const effects = normalizeCraftEssenceLimitBreakEffects({
      equipId: 1,
      normalEffects: normalizeFunctions([fn({ Count: 3 })], new Map(), 'craftEssence'),
      limitBreakEffects: normalizeFunctions([fn({ Count: 4 })], new Map(), 'craftEssence'),
    });
    expect(effects).toHaveLength(1);
    expect(effects[0]!.execution).toMatchObject([
      {
        kind: 'grantOcBoost',
        lifetime: 'constant',
        cells: [[{ uses: { kind: 'finite', remaining: 3 } }], [], [], [], []],
        limitBreakCells: [[{ uses: { kind: 'finite', remaining: 4 } }], [], [], [], []],
      },
    ]);
  });
  it('does not certify an unknown lifecycle writer as disjoint', () => {
    expect(
      normalize({
        funcId: 2,
        funcType: 'moveState',
        funcTargetType: 'self',
        svals: [{ Rate: 1000 }],
      }),
    ).toMatchObject([{ kind: 'unsupported' }]);
  });
  it('proves unnamed selector nonintersection only with complete family identities', () => {
    const value: AtlasFunction = {
      funcId: 4,
      funcType: 'subState',
      funcTargetType: 'self',
      traitVals: [{ id: 10026, name: 'unknown' }],
      svals: [{ Rate: 1000 }],
    };
    expect(normalize(value)).toMatchObject([{ kind: 'unsupported' }]);
    const identities = new Map([
      [3004, 'buffPositiveEffect'],
      [3005, 'buffNegativeEffect'],
      [3090, 'buffBuffSuccessRateUp'],
    ]);
    expect(normalize(value, identities)).toMatchObject([
      { kind: 'ocStateNonIntersection', proof: 'stateSelector' },
    ]);
    value.traitVals = [{ id: 3004, name: 'unknown' }];
    expect(normalize(value, identities)).toMatchObject([{ kind: 'unsupported' }]);
  });
  it('certifies the empty recipient-check flag but does not erase a nonempty check', () => {
    const value: AtlasFunction = {
      funcId: 3,
      funcType: 'subState',
      funcTargetType: 'ptOne',
      traitVals: [positive],
      svals: [{ Rate: 5000, NoCheckIndividualityIfNotUnit: 1 }],
    };
    expect(normalizeFunctions([value], new Map())[0]!.execution).toMatchObject([
      { kind: 'removeOcState' },
    ]);
    value.functvals = [{ name: 'dragon' }];
    expect(normalizeFunctions([value], new Map())[0]!.execution).toMatchObject([
      { kind: 'unsupported' },
    ]);
  });
});
