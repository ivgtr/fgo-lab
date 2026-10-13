import type { EffectProjection } from '@fgo-lab/battle-execution';
import type { CombatRules } from '@fgo-lab/master-data';
import {
  defaultTargetClassRelation,
  type RelativeTargetAttributeRelation,
  type RelativeTargetClassRelation,
} from '@fgo-lab/calc-core';
import type {
  CanonicalTargetAttribute,
  CanonicalTargetClassId,
  CanonicalTargetFamilyId,
  TargetPredicate,
  TargetContext,
} from '@fgo-lab/schema';

export type TargetContextCommand =
  | { kind: 'setClassRelation'; relation: RelativeTargetClassRelation }
  | { kind: 'setConcreteClass'; classId: CanonicalTargetClassId }
  | { kind: 'setAttributeRelation'; relation: RelativeTargetAttributeRelation }
  | { kind: 'setConcreteAttribute'; attribute: CanonicalTargetAttribute }
  | { kind: 'setFamily'; familyId: CanonicalTargetFamilyId; enabled: boolean }
  | { kind: 'setFamilyAbsent'; familyId: CanonicalTargetFamilyId; absent: boolean };

export function createDefaultTargetContext(
  attackerClassId: string,
  rules?: CombatRules,
): TargetContext {
  return {
    class: { kind: 'relative', relation: defaultTargetClassRelation(attackerClassId, rules) },
    attribute: { kind: 'relative', relation: 'neutral' },
    families: [],
    absentFamilies: [],
  };
}

export function targetPredicateSelected(
  context: TargetContext,
  predicate: TargetPredicate,
): boolean {
  if (predicate.kind === 'classIdentity')
    return context.class.kind === 'concrete' && context.class.classId === predicate.classId;
  if (predicate.kind === 'attributeIdentity')
    return (
      context.attribute.kind === 'concrete' && context.attribute.attribute === predicate.attribute
    );
  return context.families.some(({ familyId }) => familyId === predicate.familyId);
}

export function applyTargetContextCommand(
  context: TargetContext,
  command: TargetContextCommand,
): TargetContext {
  switch (command.kind) {
    case 'setClassRelation':
      return { ...context, class: { kind: 'relative', relation: command.relation } };
    case 'setConcreteClass':
      return { ...context, class: { kind: 'concrete', classId: command.classId } };
    case 'setAttributeRelation':
      return { ...context, attribute: { kind: 'relative', relation: command.relation } };
    case 'setConcreteAttribute':
      return { ...context, attribute: { kind: 'concrete', attribute: command.attribute } };
    case 'setFamily': {
      const alreadyEnabled = context.families.some(({ familyId }) => familyId === command.familyId);
      let families = context.families;
      if (command.enabled && !alreadyEnabled)
        families = [...context.families, { familyId: command.familyId }];
      if (!command.enabled)
        families = context.families.filter(({ familyId }) => familyId !== command.familyId);
      return {
        ...context,
        families,
        absentFamilies: command.enabled
          ? context.absentFamilies.filter(({ familyId }) => familyId !== command.familyId)
          : context.absentFamilies,
      };
    }
    case 'setFamilyAbsent': {
      const absentFamilies = context.absentFamilies.filter(
        ({ familyId }) => familyId !== command.familyId,
      );
      return {
        ...context,
        families: command.absent
          ? context.families.filter(({ familyId }) => familyId !== command.familyId)
          : context.families,
        absentFamilies: command.absent
          ? [...absentFamilies, { familyId: command.familyId }]
          : absentFamilies,
      };
    }
  }
}

type TargetPredicateDecision = Extract<
  Exclude<EffectProjection['decision'], { state: 'none' }>,
  { kind: 'targetPredicate' }
>;

export function targetContextCommandForEffect(
  decision: TargetPredicateDecision,
  enabled: boolean,
): TargetContextCommand {
  const { target } = decision;
  if (target.kind === 'classIdentity') {
    if (enabled) return { kind: 'setConcreteClass', classId: target.classId };
    if (decision.fallbackClass?.kind !== 'relative')
      throw new TypeError(`target_effect_class_fallback_missing:${decision.decisionKey}`);
    return { kind: 'setClassRelation', relation: decision.fallbackClass.relation };
  }
  if (target.kind === 'attributeIdentity') {
    if (enabled) return { kind: 'setConcreteAttribute', attribute: target.attribute };
    if (decision.fallbackAttribute?.kind !== 'relative')
      throw new TypeError(`target_effect_attribute_fallback_missing:${decision.decisionKey}`);
    return { kind: 'setAttributeRelation', relation: decision.fallbackAttribute.relation };
  }
  return { kind: 'setFamily', familyId: target.familyId, enabled };
}
