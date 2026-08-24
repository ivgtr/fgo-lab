export const ATTACK_NP_FUNCTION_TYPES = [
  'damageNp',
  'damageNpIndividual',
  'damageNpPierce',
  'damageNpIndividualSum',
  'damageNpStateIndividualFix',
  'damageNpHpratioLow',
  'damageNpBattlePointPhase',
  'damageNpRare',
  'damageNpAndOrCheckIndividuality',
] as const;
export type AttackNpFunctionType = (typeof ATTACK_NP_FUNCTION_TYPES)[number];

export interface SpecialFunctionContext {
  baseMultiplier: number;
  matchedTraitCount: number;
  hpRatio?: number;
  battlePointPhase?: number;
}

export interface HandlerResult {
  multiplier: number;
  precision: 'exact' | 'approximate' | 'unsupported';
  warning?: string;
}

type Handler = (context: SpecialFunctionContext) => HandlerResult;
const exactBase: Handler = ({ baseMultiplier }) => ({
  multiplier: baseMultiplier,
  precision: 'exact',
});

export const attackNpHandlers: Readonly<Record<AttackNpFunctionType, Handler>> = {
  damageNp: exactBase,
  damageNpIndividual: exactBase,
  damageNpPierce: exactBase,
  damageNpIndividualSum: ({ baseMultiplier, matchedTraitCount }) => ({
    multiplier: baseMultiplier * Math.max(1, matchedTraitCount),
    precision: 'exact',
  }),
  damageNpStateIndividualFix: exactBase,
  damageNpHpratioLow: ({ baseMultiplier, hpRatio }) =>
    hpRatio === undefined
      ? { multiplier: baseMultiplier, precision: 'unsupported', warning: 'missing_hp_ratio' }
      : {
          multiplier: baseMultiplier * (1 + (1 - hpRatio)),
          precision: 'approximate',
          warning: 'hp_ratio_curve_requires_master_parameters',
        },
  damageNpBattlePointPhase: ({ baseMultiplier, battlePointPhase }) =>
    battlePointPhase === undefined
      ? {
          multiplier: baseMultiplier,
          precision: 'unsupported',
          warning: 'missing_battle_point_phase',
        }
      : {
          multiplier: baseMultiplier,
          precision: 'approximate',
          warning: 'battle_point_parameters_required',
        },
  damageNpRare: exactBase,
  damageNpAndOrCheckIndividuality: exactBase,
};

export function resolveAttackNpFunction(
  type: string,
  context: SpecialFunctionContext,
): HandlerResult {
  if (!ATTACK_NP_FUNCTION_TYPES.includes(type as AttackNpFunctionType)) {
    return {
      multiplier: context.baseMultiplier,
      precision: 'unsupported',
      warning: `unknown_function:${type}`,
    };
  }
  return attackNpHandlers[type as AttackNpFunctionType](context);
}
