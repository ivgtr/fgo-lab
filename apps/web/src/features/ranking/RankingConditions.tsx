import type { RankingConditions as RankingConditionsValue } from '@fgo-lab/calculation-application';

export function RankingConditions({
  conditions,
  onChange,
}: {
  conditions: RankingConditionsValue;
  onChange: (conditions: RankingConditionsValue) => void;
}) {
  const patch = (value: Partial<RankingConditionsValue>) => onChange({ ...conditions, ...value });
  return (
    <section className="ranking-condition-section" aria-label="ランキングの計算条件">
      <div className="ranking-condition-primary">
        <label>
          比較
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
          宝具Lv
          <select
            value={conditions.npLevel}
            disabled={conditions.comparisonMode === 'owned'}
            onChange={(event) =>
              patch({ npLevel: Number(event.target.value) as RankingConditionsValue['npLevel'] })
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
                classAffinity: event.target.value as RankingConditionsValue['classAffinity'],
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
              patch({ selfBuffs: event.target.value as RankingConditionsValue['selfBuffs'] })
            }
          >
            <option value="included">あり</option>
            <option value="excluded">なし</option>
          </select>
        </label>
        <label>
          特攻
          <select
            value={conditions.specialAttack}
            onChange={(event) =>
              patch({
                specialAttack: event.target.value as RankingConditionsValue['specialAttack'],
              })
            }
          >
            <option value="inactive">なし</option>
            <option value="active">成立</option>
          </select>
        </label>
        <label>
          フィールド
          <select
            value={conditions.field}
            onChange={(event) =>
              patch({ field: event.target.value as RankingConditionsValue['field'] })
            }
          >
            <option value="inactive">なし</option>
            <option value="active">成立</option>
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
