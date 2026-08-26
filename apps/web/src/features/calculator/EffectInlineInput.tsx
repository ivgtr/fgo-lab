import type { EffectInputViewModel } from '@fgo-lab/calculation-application';

function displayedValue(input: EffectInputViewModel, value: number): number {
  return input.control === 'percentage' ? value / 10 : value;
}

function canonicalValue(input: EffectInputViewModel, value: number): number {
  return input.control === 'percentage' ? value * 10 : value;
}

export function EffectInlineInput({
  input,
  onChange,
}: {
  input: EffectInputViewModel;
  onChange: (key: string, value: number | null) => void;
}) {
  const unit = input.control === 'percentage' ? '（%）' : '';
  const current = input.value === null ? null : displayedValue(input, input.value);
  const minimum = displayedValue(input, input.minimum);
  const maximum = displayedValue(input, input.maximum);
  const step = displayedValue(input, input.step);

  return (
    <fieldset className="effect-inline-input" data-invalid={input.invalid || undefined}>
      <legend>
        {input.label}
        {unit}
      </legend>
      {input.control === 'segmented' ? (
        <div className="effect-input-segments">
          {Array.from(
            { length: Math.floor((input.maximum - input.minimum) / input.step) + 1 },
            (_, index) => input.minimum + index * input.step,
          ).map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={input.value === value}
              onClick={() => onChange(input.key, value)}
            >
              {displayedValue(input, value)}
            </button>
          ))}
        </div>
      ) : (
        <div className="effect-input-stepper">
          <button
            type="button"
            aria-label={`${input.label}を減らす`}
            disabled={input.value === null || input.value - input.step < input.minimum}
            onClick={() => input.value !== null && onChange(input.key, input.value - input.step)}
          >
            −
          </button>
          <input
            type="number"
            aria-label={input.label}
            aria-invalid={input.invalid || undefined}
            min={minimum}
            max={maximum}
            step={step}
            required={input.defaultValue === null}
            value={current ?? ''}
            onChange={(event) =>
              onChange(
                input.key,
                event.target.value === ''
                  ? null
                  : canonicalValue(input, Number(event.target.value)),
              )
            }
          />
          <button
            type="button"
            aria-label={`${input.label}を増やす`}
            disabled={input.value === null || input.value + input.step > input.maximum}
            onClick={() => input.value !== null && onChange(input.key, input.value + input.step)}
          >
            ＋
          </button>
        </div>
      )}
      <small>{input.invalid ? '入力範囲を確認してください。' : input.description}</small>
      {input.explicit && input.defaultValue !== null ? (
        <button
          type="button"
          className="effect-input-reset"
          onClick={() => onChange(input.key, null)}
        >
          自動値へ戻す
        </button>
      ) : input.defaultReason ? (
        <small className="effect-input-default">自動: {input.defaultReason}</small>
      ) : null}
    </fieldset>
  );
}
