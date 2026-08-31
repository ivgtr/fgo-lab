import type { EffectProjection, ResolvedCanonicalInputSet } from '@fgo-lab/battle-execution';
import type { CanonicalInputDefinition } from '@fgo-lab/master-data';
import type { CalculationResult, CalculationScenario } from '@fgo-lab/schema';

type ResolvedScenario = Extract<CalculationScenario, { mode: 'resolved' }>;

export interface EffectInputViewModel {
  key: string;
  kind: CanonicalInputDefinition['kind'];
  owner: CanonicalInputDefinition['owner'];
  label: string;
  description: string;
  control: 'segmented' | 'stepper' | 'percentage';
  minimum: number;
  maximum: number;
  step: number;
  value: number | null;
  defaultValue: number | null;
  defaultReason: string | null;
  explicit: boolean;
  invalid: boolean;
  section: 'own' | 'support';
  relatedProjectionKeys: readonly string[];
  relatedEffectLabels: readonly string[];
}

export type CanonicalInputCommand = {
  kind: 'setCanonicalIntegerInput';
  key: string;
  value: number | null;
};

export function resolveCanonicalInputValues(
  definitions: readonly CanonicalInputDefinition[],
  explicitValues: ResolvedScenario['canonicalInputValues'],
): ResolvedCanonicalInputSet {
  const values: Record<string, number> = {};
  const missingDefinitions: CanonicalInputDefinition[] = [];
  const definitionKeys = new Set(definitions.map((definition) => definition.key));
  const invalidInputKeys = Object.keys(explicitValues).filter((key) => !definitionKeys.has(key));
  for (const definition of definitions) {
    const explicit = explicitValues[definition.key];
    const value = explicit?.value ?? definition.defaultValue;
    if (
      value === null ||
      value < definition.minimum ||
      value > definition.maximum ||
      (value - definition.minimum) % definition.step !== 0
    ) {
      missingDefinitions.push(
        value === null ? definition : { ...definition, defaultValue: null, defaultReason: null },
      );
      continue;
    }
    values[definition.key] = value;
  }
  return { values, missingDefinitions, invalidInputKeys };
}

function inputControl(definition: CanonicalInputDefinition): EffectInputViewModel['control'] {
  if (definition.kind === 'sourceHpPermille') return 'percentage';
  const optionCount = (definition.maximum - definition.minimum) / definition.step + 1;
  return optionCount <= 4 ? 'segmented' : 'stepper';
}

function relatedDamageEffects(
  definition: CanonicalInputDefinition,
  effects: readonly EffectProjection[],
) {
  return effects.filter(
    (effect) =>
      effect.modifier !== null &&
      effect.executionSupport === 'supported' &&
      effect.explanation.code !== 'cardMismatch' &&
      effect.requiredInputs.some((input) => input.key === definition.key),
  );
}

export function createEffectInputViewModels(input: {
  definitions: readonly CanonicalInputDefinition[];
  effects: readonly EffectProjection[];
  requiredInputs: Extract<CalculationResult, { status: 'inputRequired' }>['requiredInputs'];
  explicitValues: ResolvedScenario['canonicalInputValues'];
}): EffectInputViewModel[] {
  const invalidKeys = new Set(input.requiredInputs.map((definition) => definition.key));
  return input.definitions.flatMap((definition) => {
    const related = relatedDamageEffects(definition, input.effects);
    if (related.length === 0 && !invalidKeys.has(definition.key)) return [];
    const explicit = input.explicitValues[definition.key];
    return [
      {
        key: definition.key,
        kind: definition.kind,
        owner: definition.owner,
        label: definition.label,
        description: definition.description,
        control: inputControl(definition),
        minimum: definition.minimum,
        maximum: definition.maximum,
        step: definition.step,
        value: explicit?.value ?? definition.defaultValue,
        defaultValue: definition.defaultValue,
        defaultReason: definition.defaultReason,
        explicit: explicit !== undefined,
        invalid: invalidKeys.has(definition.key),
        section:
          related.length === 0 || related.some((effect) => effect.source.origin !== 'support')
            ? 'own'
            : 'support',
        relatedProjectionKeys: [...new Set(related.map((effect) => effect.projectionKey))],
        relatedEffectLabels: [...new Set(related.map((effect) => effect.label).filter(Boolean))],
      },
    ];
  });
}

export function applyCanonicalInputCommand(
  scenario: ResolvedScenario,
  command: CanonicalInputCommand,
): ResolvedScenario {
  const values = Object.fromEntries(
    Object.entries(scenario.canonicalInputValues).filter(([key]) => key !== command.key),
  );
  return {
    ...scenario,
    canonicalInputValues:
      command.value === null
        ? values
        : {
            ...values,
            [command.key]: { kind: 'integer', value: command.value },
          },
  };
}
