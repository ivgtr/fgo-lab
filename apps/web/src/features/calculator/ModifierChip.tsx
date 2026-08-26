import { MasterImage } from '../../ui/MasterImage';

export interface ModifierChipSource {
  key: string;
  label: string;
  imageKey: string | null;
}

function ModifierChipContent({
  label,
  detail,
  sources,
}: {
  label: string;
  detail: string;
  sources: readonly ModifierChipSource[];
}) {
  return (
    <>
      <span className="modifier-chip-copy">
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      {sources.length ? (
        <span className="modifier-chip-sources">
          {sources.map((source) => (
            <span
              className="modifier-chip-source"
              key={source.key}
              title={source.label}
              role="img"
              aria-label={source.label}
            >
              <MasterImage
                src={source.imageKey}
                alt=""
                fallback={source.label}
                className="modifier-chip-icon"
              />
            </span>
          ))}
        </span>
      ) : null}
    </>
  );
}

export function ModifierChip({
  active,
  label,
  detail,
  sources = [],
  onToggle,
  bare = false,
  selection = 'toggle',
  disabled = false,
}: {
  active: boolean;
  label: string;
  detail: string;
  sources?: readonly ModifierChipSource[];
  onToggle?: (active: boolean) => void;
  bare?: boolean;
  selection?: 'toggle' | 'singleChoice';
  disabled?: boolean;
}) {
  const content = <ModifierChipContent label={label} detail={detail} sources={sources} />;
  const control = onToggle ? (
    <button
      type="button"
      className="modifier-chip"
      disabled={disabled}
      {...(selection === 'singleChoice'
        ? { role: 'radio', 'aria-checked': active }
        : { 'aria-pressed': active })}
      onClick={() => onToggle(!active)}
    >
      {content}
    </button>
  ) : (
    <div className="modifier-chip">{content}</div>
  );
  if (bare) return control;
  return <li data-active={active}>{control}</li>;
}
