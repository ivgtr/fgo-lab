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
  hpRatio?: number;
  battlePointPhase?: number;
}

export interface HandlerResult {
  precision: 'exact' | 'approximate' | 'unsupported';
  warning?: string;
}

type Handler = (context: SpecialFunctionContext) => HandlerResult;
const exactBase: Handler = () => ({ precision: 'exact' });
const pendingDifferential =
  (warning: string): Handler =>
  () => ({
    precision: 'approximate',
    warning,
  });

export const attackNpHandlers: Readonly<Record<AttackNpFunctionType, Handler>> = {
  damageNp: exactBase,
  damageNpIndividual: exactBase,
  damageNpPierce: exactBase,
  damageNpIndividualSum: () => ({
    precision: 'approximate',
    warning: 'individual_sum_parameters_require_differential_validation',
  }),
  damageNpStateIndividualFix: exactBase,
  damageNpHpratioLow: ({ hpRatio }) =>
    hpRatio === undefined
      ? { precision: 'unsupported', warning: 'missing_hp_ratio' }
      : {
          precision: 'approximate',
          warning: 'hp_ratio_curve_requires_master_parameters',
        },
  damageNpBattlePointPhase: ({ battlePointPhase }) =>
    battlePointPhase === undefined
      ? {
          precision: 'unsupported',
          warning: 'missing_battle_point_phase',
        }
      : {
          precision: 'approximate',
          warning: 'battle_point_parameters_required',
        },
  damageNpRare: pendingDifferential('rarity_condition_parameters_not_resolved'),
  damageNpAndOrCheckIndividuality: pendingDifferential('and_or_parameters_not_resolved'),
};

export function resolveAttackNpFunction(
  type: string,
  context: SpecialFunctionContext,
): HandlerResult {
  if (!ATTACK_NP_FUNCTION_TYPES.includes(type as AttackNpFunctionType)) {
    return {
      precision: 'unsupported',
      warning: `unknown_function:${type}`,
    };
  }
  return attackNpHandlers[type as AttackNpFunctionType](context);
}
