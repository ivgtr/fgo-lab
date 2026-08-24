import type { ServantMaster } from '@fgo-lab/master-data';
import type { ResolvedSupportEffect } from '@fgo-lab/effect-resolver';
import type { AttackerSkillSelection, CalculationSelection, ServantBuild } from '@fgo-lab/schema';
import { MasterImage } from '../../ui/MasterImage';
import './attacker-skills.css';

export function AttackerSkills({
  attacker,
  attackerSource,
  selectedSkills,
  savedBuild,
  resolvedEffects,
  warnings,
  hidden,
  onChange,
}: {
  attacker: ServantMaster | undefined;
  attackerSource: CalculationSelection['attackerSource'];
  selectedSkills: readonly AttackerSkillSelection[];
  savedBuild: ServantBuild | undefined;
  resolvedEffects: readonly ResolvedSupportEffect[];
  warnings: readonly string[];
  hidden: boolean;
  onChange: (
    skillId: string,
    patch: Partial<Pick<AttackerSkillSelection, 'enabled' | 'skillLevel'>>,
  ) => void;
}) {
  return (
    <section className="attacker-skills" aria-label="攻撃役の自身スキル" hidden={hidden}>
      <div className="section-heading compact-heading">
        <div>
          <p className="eyebrow">SELF SKILLS</p>
          <h3>攻撃役の自身スキル</h3>
        </div>
        <small>変更はこの計算だけ</small>
      </div>
      {selectedSkills.length === 0 ? (
        <p className="notice">展開できる自身スキルがありません。</p>
      ) : (
        <ul className="attacker-skill-list">
          {selectedSkills.map((selectedSkill, index) => {
            const skill = attacker?.skills.find(
              (candidate) => candidate.id === selectedSkill.skillId,
            );
            if (!skill) return null;
            const savedLevel =
              attackerSource === 'owned' ? (savedBuild?.skills[String(index + 1)] ?? 1) : 10;
            const modified = selectedSkill.skillLevel !== savedLevel;
            const effects = resolvedEffects.filter((effect) => effect.skillId === skill.id);
            const state = modified ? 'modified' : attackerSource === 'owned' ? 'saved' : 'added';
            const stateLabel =
              state === 'modified' ? '一時変更' : state === 'saved' ? '保存値' : '仮想値';
            const effectSummary = skill.effects.map((effect) => {
              const resolved = effects.find((candidate) => candidate.effectId === effect.id);
              if (!selectedSkill.enabled) return effect.label;
              if (resolved?.applied && resolved.value !== null)
                return `${effect.label} ${resolved.value.toLocaleString('ja-JP', {
                  style: 'percent',
                  signDisplay: 'always',
                  maximumFractionDigits: 1,
                })}`;
              if (resolved?.reason === 'not_np_damage_relevant')
                return `${effect.label}（宝具火力外）`;
              if (resolved?.reason === 'card_type_mismatch')
                return `${effect.label}（カード不一致）`;
              if (resolved?.reason === 'attacker_trait_mismatch')
                return `${effect.label}（攻撃役の特性不一致）`;
              if (resolved?.reason === 'target_trait_mismatch')
                return `${effect.label}（対象特性なし）`;
              return `${effect.label}（未対応）`;
            });
            return (
              <li key={skill.id} className="attacker-skill-row" data-state={state}>
                <MasterImage
                  src={skill.imageKey}
                  alt=""
                  fallback={skill.name}
                  className="skill-icon"
                />
                <div className="attacker-skill-copy">
                  <div>
                    <strong>
                      スキル{index + 1}：{skill.name}
                    </strong>
                    <small className={`skill-state skill-state-${state}`}>{stateLabel}</small>
                  </div>
                  <p>{effectSummary.join('・')}</p>
                  {modified ? (
                    <button
                      type="button"
                      className="skill-reset"
                      onClick={() => onChange(skill.id, { skillLevel: savedLevel })}
                    >
                      {attackerSource === 'owned'
                        ? `保存Lv${savedLevel}へ戻す`
                        : `既定Lv${savedLevel}へ戻す`}
                    </button>
                  ) : null}
                </div>
                <label className="skill-level-control">
                  <span>Lv</span>
                  <select
                    value={selectedSkill.skillLevel}
                    onChange={(event) =>
                      onChange(skill.id, { skillLevel: Number(event.target.value) })
                    }
                    aria-label={`${skill.name}のスキルレベル`}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="skill-toggle">
                  <input
                    type="checkbox"
                    checked={selectedSkill.enabled}
                    onChange={(event) => onChange(skill.id, { enabled: event.target.checked })}
                    aria-label={`${skill.name}を使用`}
                  />
                  適用
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {warnings
        .filter((warning) => warning.startsWith('attacker_'))
        .map((warning) => (
          <p className="notice" key={warning}>
            未解決: {warning}
          </p>
        ))}
    </section>
  );
}
