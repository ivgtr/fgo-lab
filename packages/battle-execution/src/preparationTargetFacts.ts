import { servantAttribute } from '@fgo-lab/calc-core';
import type { CanonicalTargetDomain, CombatRules, ServantMaster } from '@fgo-lab/master-data';
import type { TargetContext } from '@fgo-lab/schema';
import type { TargetPredicateAssertion } from './contracts';
import { resolveTargetCandidates } from './targetContext';
import { targetPredicateKey } from './targetPredicate';

const cache = new WeakMap<
  CanonicalTargetDomain,
  Map<string, readonly TargetPredicateAssertion[]>
>();
/** Only facts shared by every admitted target can be used before selecting a damage candidate. */
export function preparationTargetFacts(
  servant: ServantMaster,
  context: TargetContext,
  domain: CanonicalTargetDomain,
  combatRules?: CombatRules,
): readonly TargetPredicateAssertion[] {
  const attribute = servantAttribute(servant.traits);
  const key = JSON.stringify([servant.classId, attribute, context, combatRules]);
  const entries = cache.get(domain) ?? new Map<string, readonly TargetPredicateAssertion[]>();
  const existing = entries.get(key);
  if (existing) return existing;
  const resolution = resolveTargetCandidates({
    context,
    attackerClass: servant.classId,
    attackerAttribute: attribute,
    domain,
    combatRules,
    constraints: [],
    readExpressions: [],
  });
  const candidates = resolution.kind === 'candidates' ? resolution.candidates : [];
  const first = candidates[0]?.facts ?? [];
  const maps = candidates
    .slice(1)
    .map(
      (candidate) =>
        new Map(candidate.facts.map((fact) => [targetPredicateKey(fact.predicate), fact.present])),
    );
  const common = first.filter((fact) =>
    maps.every((map) => map.get(targetPredicateKey(fact.predicate)) === fact.present),
  );
  entries.set(key, common);
  cache.set(domain, entries);
  return common;
}
