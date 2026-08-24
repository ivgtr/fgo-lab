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

export interface AttackNpFunctionSupport {
  precision: 'exact' | 'approximate' | 'unsupported';
  warning?: string;
}

const EXACT_FUNCTIONS = new Set<AttackNpFunctionType>([
  'damageNp',
  'damageNpIndividual',
  'damageNpPierce',
  'damageNpStateIndividualFix',
]);

const INCOMPLETE_FUNCTIONS: Readonly<
  Partial<Record<AttackNpFunctionType, AttackNpFunctionSupport>>
> = {
  damageNpIndividualSum: {
    precision: 'approximate',
    warning: 'individual_sum_parameters_require_differential_validation',
  },
  damageNpHpratioLow: { precision: 'unsupported', warning: 'missing_hp_ratio' },
  damageNpBattlePointPhase: {
    precision: 'unsupported',
    warning: 'missing_battle_point_phase',
  },
  damageNpRare: {
    precision: 'approximate',
    warning: 'rarity_condition_parameters_not_resolved',
  },
  damageNpAndOrCheckIndividuality: {
    precision: 'approximate',
    warning: 'and_or_parameters_not_resolved',
  },
};

export function classifyAttackNpFunction(type: string): AttackNpFunctionSupport {
  if (EXACT_FUNCTIONS.has(type as AttackNpFunctionType)) return { precision: 'exact' };
  return (
    INCOMPLETE_FUNCTIONS[type as AttackNpFunctionType] ?? {
      precision: 'unsupported',
      warning: `unknown_function:${type}`,
    }
  );
}
