import type { BattleState, ExecutionIssue, TraitScope, WorldFactAssertion } from './index';
import { canonicalExclusiveGroup } from './conditionSemantics';

export function validateAndApplyWorldFacts(
  state: BattleState,
  assertions: readonly WorldFactAssertion[],
): ExecutionIssue[] {
  const issues: ExecutionIssue[] = [];
  const invalid = new Set<string>();
  const facts = new Map<string, { value: string; keys: Set<string> }>();
  const groups = new Map<
    string,
    {
      scope: TraitScope;
      group: NonNullable<ReturnType<typeof canonicalExclusiveGroup>>;
      traits: Map<string, Set<string>>;
    }
  >();
  for (const assertion of assertions) {
    const fact = assertion.fact;
    const key =
      fact.kind === 'trait' ? `trait:${fact.scope}:${fact.trait}` : `quantity:${fact.quantity}`;
    const value = fact.kind === 'trait' ? String(fact.present) : String(fact.value);
    const prior = facts.get(key);
    if (prior && prior.value !== value) {
      const decisionKeys = [...prior.keys, assertion.decisionKey];
      issues.push({ kind: 'contradictoryWorldFacts', decisionKeys });
      decisionKeys.forEach((item) => invalid.add(item));
    }
    facts.set(key, { value, keys: new Set([...(prior?.keys ?? []), assertion.decisionKey]) });
    if (fact.kind !== 'trait' || !fact.present) continue;
    const group = canonicalExclusiveGroup(fact.scope, fact.trait);
    if (!group) continue;
    const groupKey = `${fact.scope}:${group}`;
    const entry = groups.get(groupKey) ?? { scope: fact.scope, group, traits: new Map() };
    entry.traits.set(
      fact.trait,
      new Set([...(entry.traits.get(fact.trait) ?? []), assertion.decisionKey]),
    );
    groups.set(groupKey, entry);
  }
  for (const entry of groups.values()) {
    if (entry.traits.size < 2) continue;
    const decisionKeys = [...new Set([...entry.traits.values()].flatMap((keys) => [...keys]))];
    issues.push({
      kind: 'exclusiveWorldFactConflict',
      scope: entry.scope,
      group: entry.group,
      traits: [...entry.traits.keys()],
      decisionKeys,
    });
    decisionKeys.forEach((item) => invalid.add(item));
  }
  for (const assertion of assertions) {
    if (invalid.has(assertion.decisionKey)) continue;
    const fact = assertion.fact;
    if (fact.kind === 'quantity') state.quantities[fact.quantity] = fact.value;
    else if (fact.present) {
      (state.traits[fact.scope] as Set<string>).add(fact.trait);
      state.traitCounts[fact.scope] = {
        ...state.traitCounts[fact.scope],
        [fact.trait]: Math.max(1, state.traitCounts[fact.scope][fact.trait] ?? 0),
      };
    } else {
      (state.traits[fact.scope] as Set<string>).delete(fact.trait);
      state.traitCounts[fact.scope] = Object.fromEntries(
        Object.entries(state.traitCounts[fact.scope]).filter(([trait]) => trait !== fact.trait),
      );
    }
  }
  return issues;
}

export function validateCanonicalWorldState(
  state: BattleState,
  decisionKeys: readonly string[] = ['initial-world-state'],
): ExecutionIssue[] {
  const grouped = new Map<
    string,
    {
      scope: TraitScope;
      group: NonNullable<ReturnType<typeof canonicalExclusiveGroup>>;
      traits: string[];
    }
  >();
  for (const scope of ['attacker', 'attackerState', 'target', 'targetState', 'field'] as const) {
    for (const trait of state.traits[scope]) {
      const group = canonicalExclusiveGroup(scope, trait);
      if (!group) continue;
      const key = `${scope}:${group}`;
      const entry = grouped.get(key) ?? { scope, group, traits: [] };
      entry.traits.push(trait);
      grouped.set(key, entry);
    }
  }
  return [...grouped.values()].flatMap((entry) =>
    new Set(entry.traits).size > 1
      ? [
          {
            kind: 'exclusiveWorldFactConflict' as const,
            scope: entry.scope,
            group: entry.group,
            traits: [...new Set(entry.traits)],
            decisionKeys,
          },
        ]
      : [],
  );
}
