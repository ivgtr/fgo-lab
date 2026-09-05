import {
  applyRankingSelectionCommand,
  type RankingSelectionCommand,
} from '@fgo-lab/calculation-application';
import type { RankingPolicyConditions } from '@fgo-lab/calculation-application';

export function RankingConditions({
  conditions,
  onChange,
}: {
  conditions: RankingPolicyConditions;
  onChange: (conditions: RankingPolicyConditions) => void;
}) {
  const dispatch = (command: RankingSelectionCommand) => {
    const result = applyRankingSelectionCommand(conditions, command);
    if (result.status === 'valid') onChange(result.selection);
  };
  return (
    <section className="ranking-condition-section" aria-label="ランキングの計算条件">
      <div className="ranking-condition-primary">
        <label>
          対象
          <select
            value={conditions.population}
            onChange={(event) =>
              dispatch({
                kind: 'setPopulation',
                value: event.target.value as RankingPolicyConditions['population'],
              })
            }
          >
            <option value="all">全サーヴァント</option>
            <option value="owned">保有サーヴァント</option>
          </select>
        </label>
        <label>
          レベル
          <select
            value={conditions.levelBasis}
            onChange={(event) =>
              dispatch({
                kind: 'setLevelBasis',
                value: event.target.value as RankingPolicyConditions['levelBasis'],
              })
            }
          >
            <option value="naturalLimit">自然上限</option>
            <option value="uniformLevel90">Lv.90統一</option>
            <option value="ownedLevel" disabled={conditions.population !== 'owned'}>
              保有レベル
            </option>
          </select>
        </label>
        <label>
          宝具Lv
          <select
            value={
              conditions.npLevelBasis.kind === 'owned' ? 'owned' : conditions.npLevelBasis.npLevel
            }
            onChange={(event) =>
              dispatch({
                kind: 'setNpLevelBasis',
                value:
                  event.target.value === 'owned'
                    ? { kind: 'owned' }
                    : {
                        kind: 'specified',
                        npLevel: Number(event.target.value) as 1 | 2 | 3 | 4 | 5,
                      },
              })
            }
          >
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                NP{value}
              </option>
            ))}
            <option value="owned" disabled={conditions.population !== 'owned'}>
              保有宝具レベル
            </option>
          </select>
        </label>
        <label>
          クラス相性
          <select
            value={conditions.classAffinity}
            onChange={(event) =>
              dispatch({
                kind: 'setClassAffinity',
                value: event.target.value as RankingPolicyConditions['classAffinity'],
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
              dispatch({
                kind: 'setSelfBuffs',
                value: event.target.value as RankingPolicyConditions['selfBuffs'],
              })
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
              dispatch({
                kind: 'setConditionalEffects',
                value: event.target.value as RankingPolicyConditions['conditionalEffects'],
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
            <dd>
              {conditions.levelBasis === 'naturalLimit'
                ? '自然上限'
                : conditions.levelBasis === 'uniformLevel90'
                  ? 'Lv.90統一'
                  : '保有レベル'}
              ・Fou1000
            </dd>
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
