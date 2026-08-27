import { useMemo, useState } from 'react';
import {
  collectRankingTraitInventory,
  type RankingConditions as RankingConditionsValue,
} from '@fgo-lab/calculation-application';
import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import type { CraftEssenceCopy, SupportTemplate } from '@fgo-lab/schema';
import { CraftEssencePicker, SupportTemplatePicker } from '../calculator/CalculatorPickers';
import { allServantClasses } from '../../ui/servantFilterOptions';
import { countChangedRankingConditions, rankingConditionSummary } from './rankingPresentation';
import { NullableNumber, TraitSelector, withCanonicalInput } from './RankingConditionInputs';

export function RankingConditions({
  conditions,
  master,
  craftEssenceCopies,
  supportTemplates,
  onChange,
}: {
  conditions: RankingConditionsValue;
  master: MasterDataSnapshot;
  craftEssenceCopies: readonly CraftEssenceCopy[];
  supportTemplates: readonly SupportTemplate[];
  onChange: (conditions: RankingConditionsValue) => void;
}) {
  const [supportPickerOpen, setSupportPickerOpen] = useState(false);
  const [craftEssencePickerOpen, setCraftEssencePickerOpen] = useState(false);
  const inventory = useMemo(() => collectRankingTraitInventory(master), [master]);
  const support = supportTemplates.find(
    (candidate) => candidate.templateId === conditions.supportTemplateId,
  );
  const craftEssence = master.craftEssences.find(
    (candidate) => candidate.id === conditions.craftEssence?.craftEssenceId,
  );
  const mysticCode = master.mysticCodes.find(
    (candidate) => candidate.id === conditions.mysticCode?.mysticCodeId,
  );
  const summary = rankingConditionSummary(conditions, support?.name);
  const changedConditionCount = countChangedRankingConditions(conditions);
  const targetClasses = [...new Set(master.servants.map((servant) => servant.classId))].sort();
  const patch = (value: Partial<RankingConditionsValue>) => onChange({ ...conditions, ...value });
  return (
    <section className="ranking-condition-section" aria-label="ランキングの計算条件">
      <div className="ranking-condition-primary">
        <label>
          比較モード
          <select
            value={conditions.comparisonMode}
            onChange={(event) =>
              patch({
                comparisonMode: event.target.value as RankingConditionsValue['comparisonMode'],
              })
            }
          >
            <option value="standard">標準比較</option>
            <option value="owned">所持戦力</option>
          </select>
        </label>
        <label>
          育成基準
          <select
            value={conditions.levelRule}
            disabled={conditions.comparisonMode === 'owned'}
            onChange={(event) =>
              patch({ levelRule: event.target.value as RankingConditionsValue['levelRule'] })
            }
          >
            <option value="natural">自然上限</option>
            <option value="level90">Lv90</option>
            <option value="level100">Lv100</option>
            <option value="level120">Lv120</option>
          </select>
        </label>
        <label>
          宝具Lv
          <select
            value={conditions.npLevel}
            disabled={conditions.comparisonMode === 'owned'}
            onChange={(event) => patch({ npLevel: Number(event.target.value) })}
          >
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                NP{value}
              </option>
            ))}
          </select>
        </label>
        <label>
          自己バフ
          <select
            value={conditions.includeSelfEffects ? 'include' : 'exclude'}
            onChange={(event) => patch({ includeSelfEffects: event.target.value === 'include' })}
          >
            <option value="include">あり</option>
            <option value="exclude">なし</option>
          </select>
        </label>
        <button type="button" onClick={() => setSupportPickerOpen(true)}>
          {support ? `支援: ${support.name}` : '支援: なし'}
        </button>
        {support ? (
          <button type="button" onClick={() => patch({ supportTemplateId: null })}>
            支援解除
          </button>
        ) : null}
      </div>
      <details className="ranking-calculation-details">
        <summary>
          <strong>
            計算条件{changedConditionCount > 0 ? `・${String(changedConditionCount)}件変更` : ''}
          </strong>
          <span>{summary[0]}</span>
          <span>{summary[1]}</span>
        </summary>
        <div className="ranking-condition-grid">
          <label>
            ATKフォウ
            <select
              value={conditions.fouAtk}
              disabled={conditions.comparisonMode === 'owned'}
              onChange={(event) => patch({ fouAtk: Number(event.target.value) })}
            >
              <option value={0}>なし</option>
              <option value={1000}>+1000</option>
              <option value={2000}>+2000</option>
            </select>
          </label>
          <label>
            OC
            <select
              value={conditions.overcharge}
              onChange={(event) => patch({ overcharge: Number(event.target.value) })}
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  OC{value}
                </option>
              ))}
            </select>
          </label>
          <label>
            クラス相性
            <select
              value={conditions.classAffinityRule}
              onChange={(event) =>
                patch({
                  classAffinityRule: event.target
                    .value as RankingConditionsValue['classAffinityRule'],
                })
              }
            >
              <option value="favorable">有利</option>
              <option value="attackAdvantage">攻撃有利</option>
              <option value="neutral">等倍</option>
              <option value="unfavorable">不利</option>
              <option value="auto">敵クラスから自動</option>
            </select>
          </label>
          <label>
            敵クラス
            <select
              value={conditions.targetClassId}
              onChange={(event) => patch({ targetClassId: event.target.value })}
            >
              {targetClasses.map((value) => (
                <option key={value} value={value}>
                  {allServantClasses.find((option) => option.values.includes(value))?.label ??
                    value}
                </option>
              ))}
            </select>
          </label>
          <label>
            属性相性
            <select
              value={conditions.attributeAffinityRule}
              onChange={(event) =>
                patch({
                  attributeAffinityRule: event.target
                    .value as RankingConditionsValue['attributeAffinityRule'],
                })
              }
            >
              <option value="neutral">等倍</option>
              <option value="favorable">有利</option>
              <option value="unfavorable">不利</option>
              <option value="auto">敵属性から自動</option>
            </select>
          </label>
          <label>
            敵属性
            <select
              value={conditions.targetAttribute}
              onChange={(event) =>
                patch({
                  targetAttribute: event.target.value as RankingConditionsValue['targetAttribute'],
                })
              }
            >
              <option value="unknown">指定なし</option>
              <option value="man">人</option>
              <option value="earth">地</option>
              <option value="sky">天</option>
              <option value="star">星</option>
              <option value="beast">獣</option>
            </select>
          </label>
          <NullableNumber
            label="攻撃役HP（‰）"
            value={conditions.attackerHpPermille}
            minimum={0}
            maximum={1_000}
            onChange={(value) => patch({ attackerHpPermille: value })}
          />
          <NullableNumber
            label="Battle Point段階"
            value={conditions.battlePointPhase}
            minimum={0}
            maximum={10}
            onChange={(value) => patch({ battlePointPhase: value })}
          />
          <NullableNumber
            label="スター数"
            value={conditions.canonicalInputs.criticalStars}
            minimum={0}
            maximum={99}
            onChange={(value) => onChange(withCanonicalInput(conditions, 'criticalStars', value))}
          />
          <NullableNumber
            label="ターン"
            value={conditions.canonicalInputs.currentTurn}
            minimum={1}
            maximum={99}
            onChange={(value) => onChange(withCanonicalInput(conditions, 'currentTurn', value))}
          />
          <NullableNumber
            label="スタック数"
            value={conditions.canonicalInputs.effectStackCount}
            minimum={0}
            maximum={99}
            onChange={(value) =>
              onChange(withCanonicalInput(conditions, 'effectStackCount', value))
            }
          />
          <NullableNumber
            label="フィールド対象数"
            value={conditions.canonicalInputs.fieldActorCount}
            minimum={0}
            maximum={99}
            onChange={(value) => onChange(withCanonicalInput(conditions, 'fieldActorCount', value))}
          />
          <NullableNumber
            label="使用可能スキル数"
            value={conditions.canonicalInputs.availableSkillCount}
            minimum={0}
            maximum={99}
            onChange={(value) =>
              onChange(withCanonicalInput(conditions, 'availableSkillCount', value))
            }
          />
          <NullableNumber
            label="絆レベル"
            value={conditions.canonicalInputs.friendshipLevel}
            minimum={0}
            maximum={15}
            onChange={(value) => onChange(withCanonicalInput(conditions, 'friendshipLevel', value))}
          />
          <NullableNumber
            label="効果元HP（‰）"
            value={conditions.canonicalInputs.sourceHpPermille}
            minimum={0}
            maximum={1_000}
            onChange={(value) =>
              onChange(withCanonicalInput(conditions, 'sourceHpPermille', value))
            }
          />
          <NullableNumber
            label="敵人数"
            value={conditions.canonicalInputs.enemyCount}
            minimum={1}
            maximum={6}
            onChange={(value) => onChange(withCanonicalInput(conditions, 'enemyCount', value))}
          />
          <NullableNumber
            label="味方人数"
            value={conditions.canonicalInputs.allyCount}
            minimum={1}
            maximum={6}
            onChange={(value) => onChange(withCanonicalInput(conditions, 'allyCount', value))}
          />
          <NullableNumber
            label="全actor人数"
            value={conditions.canonicalInputs.allActorCount}
            minimum={1}
            maximum={12}
            onChange={(value) => onChange(withCanonicalInput(conditions, 'allActorCount', value))}
          />
          <label>
            確率効果
            <select
              value={conditions.procPolicy}
              onChange={(event) =>
                patch({ procPolicy: event.target.value as RankingConditionsValue['procPolicy'] })
              }
            >
              <option value="success">成功</option>
              <option value="failure">失敗</option>
            </select>
          </label>
          <label>
            連鎖判定
            <select
              value={conditions.chainedProcPolicy}
              onChange={(event) =>
                patch({
                  chainedProcPolicy: event.target
                    .value as RankingConditionsValue['chainedProcPolicy'],
                })
              }
            >
              <option value="maximum">最大成功</option>
              <option value="minimum">0回成功</option>
            </select>
          </label>
          <label>
            魔術礼装
            <select
              value={conditions.mysticCode?.mysticCodeId ?? ''}
              onChange={(event) =>
                patch({
                  mysticCode: event.target.value
                    ? { mysticCodeId: event.target.value, skillLevel: 10 }
                    : null,
                })
              }
            >
              <option value="">なし</option>
              {master.mysticCodes.map((code) => (
                <option key={code.id} value={code.id}>
                  {code.name}
                </option>
              ))}
            </select>
          </label>
          {mysticCode ? (
            <label>
              魔術礼装Lv
              <select
                value={conditions.mysticCode?.skillLevel ?? 10}
                onChange={(event) =>
                  patch({
                    mysticCode: {
                      mysticCodeId: mysticCode.id,
                      skillLevel: Number(event.target.value),
                    },
                  })
                }
              >
                {Array.from({ length: mysticCode.maxLevel }, (_, index) => index + 1).map(
                  (value) => (
                    <option key={value} value={value}>
                      Lv{value}
                    </option>
                  ),
                )}
              </select>
            </label>
          ) : null}
        </div>
        <div className="ranking-common-equipment">
          <button type="button" onClick={() => setCraftEssencePickerOpen(true)}>
            {craftEssence ? `共通礼装: ${craftEssence.name}` : '共通礼装: なし'}
          </button>
          {conditions.craftEssence && craftEssence ? (
            <>
              <label>
                礼装Lv
                <input
                  type="number"
                  min={1}
                  max={craftEssence.maxLevelByLimitBreak[conditions.craftEssence.limitBreak]}
                  value={conditions.craftEssence.level}
                  onChange={(event) =>
                    patch({
                      craftEssence: {
                        ...conditions.craftEssence!,
                        level: Number(event.target.value),
                      },
                    })
                  }
                />
              </label>
              <label>
                限界突破
                <select
                  value={conditions.craftEssence.limitBreak}
                  onChange={(event) => {
                    const limitBreak = Number(event.target.value);
                    patch({
                      craftEssence: {
                        ...conditions.craftEssence!,
                        limitBreak,
                        level: Math.min(
                          conditions.craftEssence!.level,
                          craftEssence.maxLevelByLimitBreak[limitBreak]!,
                        ),
                      },
                    });
                  }}
                >
                  {[0, 1, 2, 3, 4].map((value) => (
                    <option key={value} value={value}>
                      {value === 4 ? '最大解放' : `${String(value)}回`}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={() => patch({ craftEssence: null })}>
                礼装解除
              </button>
            </>
          ) : null}
        </div>
        <div className="ranking-trait-grid">
          <TraitSelector
            label="敵特性"
            options={inventory.target}
            selected={conditions.targetTraits}
            onChange={(targetTraits) => patch({ targetTraits })}
          />
          <TraitSelector
            label="フィールド"
            options={inventory.field}
            selected={conditions.fieldTraits}
            onChange={(fieldTraits) => patch({ fieldTraits })}
          />
        </div>
      </details>
      {supportPickerOpen ? (
        <SupportTemplatePicker
          templates={[...supportTemplates]}
          servants={master.servants}
          onSelect={(template) => {
            patch({ supportTemplateId: template.templateId });
            setSupportPickerOpen(false);
          }}
          onClose={() => setSupportPickerOpen(false)}
        />
      ) : null}
      {craftEssencePickerOpen ? (
        <CraftEssencePicker
          copies={[...craftEssenceCopies]}
          masters={master.craftEssences}
          initialSource={craftEssenceCopies.length ? 'registered' : 'master'}
          onSelect={(selected, _source, copy) => {
            patch({
              craftEssence: {
                craftEssenceId: selected.id,
                level: copy?.level ?? 1,
                limitBreak: copy?.limitBreak ?? 0,
              },
            });
            setCraftEssencePickerOpen(false);
          }}
          onClose={() => setCraftEssencePickerOpen(false)}
        />
      ) : null}
    </section>
  );
}
