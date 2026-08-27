import { useState } from 'react';
import type { RankingConditions } from '@fgo-lab/calculation-application';
import { traitLabel } from '../calculator/traitPresentation';

export function withCanonicalInput(
  conditions: RankingConditions,
  key: keyof RankingConditions['canonicalInputs'],
  value: number | null,
): RankingConditions {
  return {
    ...conditions,
    canonicalInputs: { ...conditions.canonicalInputs, [key]: value },
  };
}

export function NullableNumber({
  label,
  value,
  minimum,
  maximum,
  onChange,
}: {
  label: string;
  value: number | null;
  minimum: number;
  maximum: number;
  onChange: (value: number | null) => void;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        value={value ?? ''}
        min={minimum}
        max={maximum}
        placeholder="自動"
        onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
      />
    </label>
  );
}

export function TraitSelector({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: readonly string[];
  selected: readonly string[];
  onChange: (traits: string[]) => void;
}) {
  const [candidate, setCandidate] = useState('');
  const available = options.filter((trait) => !selected.includes(trait));
  return (
    <fieldset className="ranking-trait-selector">
      <legend>{label}</legend>
      <div>
        <select value={candidate} onChange={(event) => setCandidate(event.target.value)}>
          <option value="">選択なし</option>
          {available.map((trait) => (
            <option key={trait} value={trait}>
              {traitLabel(trait)}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!candidate}
          onClick={() => {
            if (!candidate) return;
            onChange([...selected, candidate].sort());
            setCandidate('');
          }}
        >
          追加
        </button>
      </div>
      {selected.length > 0 ? (
        <ul>
          {selected.map((trait) => (
            <li key={trait}>
              <button
                type="button"
                onClick={() => onChange(selected.filter((item) => item !== trait))}
              >
                {traitLabel(trait)} <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </fieldset>
  );
}
