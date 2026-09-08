import type { MasterEffect } from '@fgo-lab/master-data';

/** This bounded program contains skill/form activation and NPs, but no command-card attack. */
export function effectExecutesInNpProgram(effect: Pick<MasterEffect, 'triggerScope'>): boolean {
  const scope = effect.triggerScope;
  switch (scope) {
    case null:
      return true;
    case 'commandCard':
    case 'commandCardAttack':
      return false;
    default: {
      const unknownScope: never = scope;
      throw new TypeError(`unknown_np_program_trigger_scope:${String(unknownScope)}`);
    }
  }
}

export function npProgramEffects<T extends Pick<MasterEffect, 'triggerScope'>>(
  effects: readonly T[],
): readonly T[] {
  return effects.every(effectExecutesInNpProgram)
    ? effects
    : effects.filter(effectExecutesInNpProgram);
}
