import type { ServantMaster } from '@fgo-lab/master-data';
import type { EffectControlViewModel } from './effectControls';
import { conditionFactRequirements } from './conditionProvenance';
import type { ResolvedScenario } from './rankingPolicy';

interface AttackerTraitFact {
  scope: 'attacker' | 'attackerState';
  trait: string;
}

function conditionAttackerTraitFacts(
  controls: readonly EffectControlViewModel[],
): readonly AttackerTraitFact[] {
  const facts = new Map<string, AttackerTraitFact>();
  for (const control of controls)
    for (const { condition } of conditionFactRequirements(
      control.projection.explanation.condition,
    )) {
      if (
        (condition.kind !== 'trait' && condition.kind !== 'traitCount') ||
        (condition.scope !== 'attacker' && condition.scope !== 'attackerState')
      )
        continue;
      const traits = condition.kind === 'trait' ? [condition.trait] : condition.traits;
      for (const trait of traits) {
        const scopes =
          condition.scope === 'attacker'
            ? (['attacker', 'attackerState'] as const)
            : (['attackerState'] as const);
        for (const scope of scopes) facts.set(`${scope}:${trait}`, { scope, trait });
      }
    }
  return [...facts.values()].sort((left, right) =>
    `${left.scope}:${left.trait}`.localeCompare(`${right.scope}:${right.trait}`),
  );
}

export function materializeRankingAttackerFacts(
  scenario: ResolvedScenario,
  servant: ServantMaster,
  controls: readonly EffectControlViewModel[],
): ResolvedScenario {
  const intrinsicTraits = new Set(servant.traits);
  const assertions = conditionAttackerTraitFacts(controls).flatMap(({ scope, trait }) =>
    scope === 'attacker' && intrinsicTraits.has(trait)
      ? []
      : [
          {
            decisionKey: `ranking:attacker:${scope}:${trait}`,
            fact: { kind: 'trait' as const, scope, trait, present: false },
          },
        ],
  );
  return {
    ...scenario,
    worldFactAssertions: [
      ...scenario.worldFactAssertions.filter(
        ({ decisionKey }) => !decisionKey.startsWith('ranking:attacker:'),
      ),
      ...assertions,
    ],
  };
}
