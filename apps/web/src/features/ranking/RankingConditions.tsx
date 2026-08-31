import type { RankingPolicyConditions } from '@fgo-lab/calculation-application';

export function RankingConditions({
  conditions,
  onChange,
}: {
  conditions: RankingPolicyConditions;
  onChange: (conditions: RankingPolicyConditions) => void;
}) {
  const patch = (value: Partial<RankingPolicyConditions>) => onChange({ ...conditions, ...value });
  return (
    <section className="ranking-condition-section" aria-label="ランキングの計算条件">
      <div className="ranking-condition-primary">
        <label>
          比較
          <select
            value={conditions.comparisonMode}
            onChange={(event) =>
              patch({
                comparisonMode: event.target.value as RankingPolicyConditions['comparisonMode'],
              })
            }
          >
            <option value="standard">標準比較</option>
            <option value="owned">所持戦力</option>
          </select>
        </label>
        <label>
          宝具Lv
          <select
            value={conditions.npLevel}
            disabled={conditions.comparisonMode === 'owned'}
            onChange={(event) =>
              patch({ npLevel: Number(event.target.value) as RankingPolicyConditions['npLevel'] })
            }
          >
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                NP{value}
              </option>
            ))}
          </select>
        </label>
        <label>
          クラス相性
          <select
            value={conditions.classAffinity}
            onChange={(event) =>
              patch({
                classAffinity: event.target.value as RankingPolicyConditions['classAffinity'],
              })
            }
          >
            <option value="neutral">等倍</option>
            <option value="favorable">相性有利</option>
          </select>
        </label>
        <label>
          自己バフ
          <select
            value={conditions.selfBuffs}
            onChange={(event) =>
              patch({ selfBuffs: event.target.value as RankingPolicyConditions['selfBuffs'] })
            }
          >
            <option value="included">あり</option>
            <option value="excluded">なし</option>
          </select>
        </label>
        <label>
          条件効果
          <select
            value={conditions.conditionalEffects}
            onChange={(event) =>
              patch({
                conditionalEffects: event.target
                  .value as RankingPolicyConditions['conditionalEffects'],
              })
            }
          >
            <option value="baseline">通常のみ</option>
            <option value="satisfied">成立込み</option>
          </select>
        </label>
      </div>
      <details className="ranking-calculation-details">
        <summary>計算基準</summary>
        <dl className="ranking-calculation-basis">
          <div>
            <dt>育成</dt>
            <dd>自然上限・Fou1000</dd>
          </div>
          <div>
            <dt>宝具・スキル</dt>
            <dd>OC1・スキルLv10</dd>
          </div>
          <div>
            <dt>外部条件</dt>
            <dd>属性等倍・礼装なし・支援なし</dd>
          </div>
        </dl>
      </details>
    </section>
  );
}
