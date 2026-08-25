import { supportDamageSkillViews } from '@fgo-lab/calculation-application';
import type { ServantMaster } from '@fgo-lab/master-data';
import type { SupportSource } from '@fgo-lab/schema';
import { MasterImage } from '../../ui/MasterImage';
import './support.css';

export function SupportSourceCard({
  source,
  servant,
  displayName,
  onRemove,
  onSkillLevelChange,
}: {
  source: SupportSource;
  servant: ServantMaster | undefined;
  displayName: string;
  onRemove: () => void;
  onSkillLevelChange: (skillId: string, skillLevel: number) => void;
}) {
  const damageSkills = supportDamageSkillViews(source, servant);

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
          <small>火力スキル {damageSkills.length}件</small>
        </span>
        <button
          type="button"
          className="quiet support-source-remove"
          aria-label={`${displayName}を支援元から削除`}
          onClick={onRemove}
        >
          削除
        </button>
      </header>
      {damageSkills.length ? (
        <ul className="support-skill-list">
          {damageSkills.map((skill) => {
            const name = skill.name;
            return (
              <li key={`${source.sourceInstanceId}:${skill.skillId}`}>
                <MasterImage src={skill.imageKey} alt="" fallback={name} className="skill-icon" />
                <span className="support-skill-copy">
                  <strong>{name}</strong>
                  <small>{skill.effectLabels.join('・') || '宝具火力への効果なし'}</small>
                </span>
                <label className="support-skill-level">
                  <span>Lv</span>
                  <select
                    aria-label={`${name}のスキルレベル`}
                    value={skill.skillLevel}
                    onChange={(event) =>
                      onSkillLevelChange(skill.skillId, Number(event.target.value))
                    }
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="notice">宝具火力に反映できるスキルはありません。</p>
      )}
    </section>
  );
}
