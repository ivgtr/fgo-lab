import type { ServantMaster } from '@fgo-lab/master-data';
import type { ResolvedAttackerSkillUse } from '@fgo-lab/calculation-application';
import type { AttackerSkillUse, ServantBuild } from '@fgo-lab/schema';
import { MasterImage } from '../../ui/MasterImage';
import './attacker-skills.css';

export function AttackerSkills({
  attacker,
  attackerSource,
  selectedSkills,
  resolvedSkillUses,
  savedBuild,
  hidden,
  onChange,
}: {
  attacker: ServantMaster | undefined;
  attackerSource: 'owned' | 'master';
  selectedSkills: readonly AttackerSkillUse[];
  resolvedSkillUses: readonly ResolvedAttackerSkillUse[];
  savedBuild: ServantBuild | undefined;
  hidden: boolean;
  onChange: (slot: 1 | 2 | 3, patch: Partial<Pick<AttackerSkillUse, 'skillLevel'>>) => void;
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
          {selectedSkills.map((selectedSkill) => {
            const resolved = resolvedSkillUses.find(
              (candidate) => candidate.slot === selectedSkill.slot,
            );
            const skill = attacker?.skills.find((candidate) => candidate.id === resolved?.skillId);
            if (!skill) return null;
            const savedLevel =
              attackerSource === 'owned'
                ? (savedBuild?.skills[String(selectedSkill.slot)] ?? 1)
                : 10;
            const modified = selectedSkill.skillLevel !== savedLevel;
            const state = modified ? 'modified' : attackerSource === 'owned' ? 'saved' : 'added';
            const stateLabel =
              state === 'modified' ? '一時変更' : state === 'saved' ? '保存値' : '仮想値';
            return (
              <li key={selectedSkill.slot} className="attacker-skill-row" data-state={state}>
                <div className="skill-presentation">
                  <MasterImage
                    src={skill.imageKey}
                    alt=""
                    fallback={skill.name}
                    className="skill-icon"
                  />
                  <span className="attacker-skill-copy">
                    <span>
                      <strong>
                        スキル{selectedSkill.slot}：{skill.name}
                      </strong>
                      <small className={`skill-state skill-state-${state}`}>{stateLabel}</small>
                    </span>
                  </span>
                </div>
                <label className="skill-level-control">
                  <span>Lv</span>
                  <select
                    value={selectedSkill.skillLevel}
                    onChange={(event) =>
                      onChange(selectedSkill.slot, { skillLevel: Number(event.target.value) })
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
                {modified ? (
                  <button
                    type="button"
                    className="skill-reset"
                    onClick={() => onChange(selectedSkill.slot, { skillLevel: savedLevel })}
                  >
                    {attackerSource === 'owned'
                      ? `保存Lv${savedLevel}へ戻す`
                      : `既定Lv${savedLevel}へ戻す`}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
