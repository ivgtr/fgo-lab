type QuickValueControl =
  | { kind: 'preset'; label: string; value: number; disabled?: boolean }
  | { kind: 'action'; label: string; value: number; disabled?: boolean };

export function QuickValuePresets({
  label,
  value,
  controls,
  resetValue,
  onChange,
  className = '',
}: {
  label: string;
  value: number;
  controls: readonly QuickValueControl[];
  resetValue: number;
  onChange: (value: number) => void;
  className?: string;
}) {
  return (
    <span className={`quick-value-presets ${className}`.trim()} aria-label={label}>
      {controls.map((control) => (
        <button
          key={`${control.kind}:${control.label}:${String(control.value)}`}
          type="button"
          aria-pressed={control.kind === 'preset' ? value === control.value : undefined}
          disabled={control.disabled}
          onClick={() => onChange(control.value)}
        >
          {control.label}
        </button>
      ))}
      <button type="button" disabled={value === resetValue} onClick={() => onChange(resetValue)}>
        リセット
      </button>
    </span>
  );
}
