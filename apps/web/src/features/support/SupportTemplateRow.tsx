import type { ServantMaster } from '@fgo-lab/master-data';
import type { SupportTemplate } from '@fgo-lab/schema';
import { MasterImage } from '../../ui/MasterImage';
import { groupSupportSources, relativeSupportUsage } from './supportTemplatePresentation';
import './support.css';

export function SupportTemplateRow({
  template,
  servantById,
  selected = false,
  trailingLabel,
  onSelect,
}: {
  template: SupportTemplate;
  servantById: ReadonlyMap<string, ServantMaster>;
  selected?: boolean;
  trailingLabel?: string;
  onSelect: () => void;
}) {
  const sources = groupSupportSources(template);
  const selectedCount = template.composition.selectedEffects.length;
  return (
    <button
      type="button"
      className="list-row support-template-row"
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
    >
      <span className="support-face-stack" aria-hidden="true">
        {(sources.length ? sources.slice(0, 3) : [null]).map((source, index) => {
          const servant = source ? servantById.get(source.servantId) : undefined;
          return (
            <MasterImage
              key={source?.sourceInstanceId ?? `empty:${String(index)}`}
              src={servant?.imageKey ?? null}
              alt=""
              fallback={servant?.name ?? '+'}
            />
          );
        })}
      </span>
      <span className="list-row-main">
        <strong>{template.name}</strong>
        <small>
          {sources.length}騎・選択中{selectedCount}効果
        </small>
      </span>
      <span className="support-template-row-trailing">
        {trailingLabel ?? relativeSupportUsage(template.lastUsedAt)}
      </span>
    </button>
  );
}
