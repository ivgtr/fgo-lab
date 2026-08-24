import type { ServantMaster } from '@fgo-lab/master-data';
import type { SupportEffect } from '@fgo-lab/schema';
import { MasterImage } from '../../ui/MasterImage';
import type { SupportSourceGroup } from './supportTemplatePresentation';
import { supportSkillSummary } from './supportTemplatePresentation';
import './support.css';

function SupportSkillRow({
  sourceInstanceId,
  servant,
  effect,
  onUpdate,
}: {
  sourceInstanceId: string;
  servant: ServantMaster | undefined;
  effect: SupportEffect;
  onUpdate: (
    sourceInstanceId: string,
    effectId: string,
    patch: Partial<Pick<SupportEffect, 'enabled' | 'skillLevel'>>,
  ) => void;
}) {
  const skill = servant?.skills.find((candidate) => candidate.id === effect.effectId);
  const name = skill?.name ?? effect.effectId;
  return (
    <li>
      <MasterImage src={skill?.imageKey ?? null} alt="" fallback={name} className="skill-icon" />
      <span className="support-skill-copy">
        <strong>{name}</strong>
        <small>{supportSkillSummary(servant, effect.effectId) || '宝具ダメージへの効果なし'}</small>
        {skill?.detail ? (
          <details className="support-skill-detail">
            <summary>効果詳細</summary>
            <small>{skill.detail}</small>
          </details>
        ) : null}
      </span>
      <span className="support-skill-controls">
        <label className="support-skill-toggle">
          <input
            type="checkbox"
            aria-label={`${name}を使用`}
            checked={effect.enabled}
            onChange={(event) =>
              onUpdate(sourceInstanceId, effect.effectId, { enabled: event.target.checked })
            }
          />
          使用
        </label>
        <label className="support-skill-level">
          <span>Lv</span>
          <select
            aria-label={`${name}のスキルレベル`}
            value={effect.skillLevel}
            onChange={(event) =>
              onUpdate(sourceInstanceId, effect.effectId, {
                skillLevel: Number(event.target.value),
              })
            }
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </span>
    </li>
  );
}

export function SupportSourceCard({
  group,
  servant,
  displayName,
  onOwnershipChange,
  onRemove,
  onEffectChange,
}: {
  group: SupportSourceGroup;
  servant: ServantMaster | undefined;
  displayName: string;
  onOwnershipChange: (ownership: SupportEffect['ownership']) => void;
  onRemove: () => void;
  onEffectChange: (
    sourceInstanceId: string,
    effectId: string,
    patch: Partial<Pick<SupportEffect, 'enabled' | 'skillLevel'>>,
  ) => void;
}) {
  return (
    <section className="support-source">
      <header className="support-source-head">
        <MasterImage
          src={servant?.imageKey ?? null}
          alt=""
          fallback={displayName}
          className="large"
        />
        <span className="list-row-main">
          <strong>{displayName}</strong>
          <small>使用中{group.effects.filter((effect) => effect.enabled).length}スキル</small>
        </span>
        <span className="support-source-actions">
          <label>
            <span className="visually-hidden">{displayName}の区分</span>
            <select
              aria-label={`${displayName}の区分`}
              value={group.ownership}
              onChange={(event) =>
                onOwnershipChange(event.target.value as SupportEffect['ownership'])
              }
            >
              <option value="owned">自前</option>
              <option value="friend">フレンド</option>
              <option value="virtual">仮想</option>
            </select>
          </label>
          <button
            type="button"
            className="quiet support-source-remove"
            aria-label={`${displayName}を支援元から削除`}
            onClick={onRemove}
          >
            削除
          </button>
        </span>
      </header>
      <ul className="support-skill-list">
        {group.effects.map((effect) => (
          <SupportSkillRow
            key={`${group.sourceInstanceId}:${effect.effectId}`}
            sourceInstanceId={group.sourceInstanceId}
            servant={servant}
            effect={effect}
            onUpdate={onEffectChange}
          />
        ))}
      </ul>
    </section>
  );
}
