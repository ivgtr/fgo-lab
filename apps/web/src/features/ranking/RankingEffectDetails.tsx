import {
  rankingEffectContributes,
  type RankingPolicyDetail,
} from '@fgo-lab/calculation-application';
import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import {
  collectDamageEffectStacks,
  damageEffectContributes,
  damageEffectStateLabel,
} from '../../presentation/damageEffectStacks';
import { numberFormatter } from '../../ui/i18n';
import { ModifierChip } from '../calculator/ModifierChip';
import { presentRankingDetailEvidence } from './rankingPresentation';

function AreaContributionSummary({ detail }: { detail: RankingPolicyDetail }) {
  const area = detail.areaContribution;
  if (area?.withoutAreaResult.status !== 'calculated') return null;
  const npIndex = detail.scenario.attacker.npLevel - 1;
  const rankingRow = detail.result.rows[npIndex];
  const withoutAreaRow = area.withoutAreaResult.rows[npIndex];
  if (!rankingRow || !withoutAreaRow || rankingRow.average === withoutAreaRow.average) return null;
  return (
    <div className="ranking-area-contribution" role="region" aria-label="エリア貢献">
      <strong>
        エリア効果 +{numberFormatter.format(rankingRow.average - withoutAreaRow.average)}
      </strong>
      <small>
        {numberFormatter.format(withoutAreaRow.average)} →{' '}
        {numberFormatter.format(rankingRow.average)}
      </small>
    </div>
  );
}

function decisionLabel(decision: { kind: 'included' } | { kind: 'excluded'; reason: string }) {
  return decision.kind === 'included' ? '適用' : `除外 (${decision.reason})`;
}

export function RankingEffectDetails({
  detail,
  master,
  onOpenCalculator,
}: {
  detail: RankingPolicyDetail;
  master: MasterDataSnapshot;
  onOpenCalculator: (detail: RankingPolicyDetail) => void;
}) {
  const craftEssenceId = detail.scenario.craftEssence?.craftEssenceId;
  const craftEssence = master.craftEssences.find((candidate) => candidate.id === craftEssenceId);
  const stacks = collectDamageEffectStacks({
    effects: detail.effects,
    servants: master.servants,
    craftEssence,
    contributionState: (effect) =>
      rankingEffectContributes(effect, detail.effectiveContributions)
        ? 'included'
        : 'excludedByRankingPolicy',
  });
  const evidence = presentRankingDetailEvidence(detail, master);
  return (
    <div className="ranking-row-detail">
      <>
        <div className="ranking-detail-summary">
          <div className="ranking-damage-summary" aria-label="ダメージ範囲">
            <span>
              <small>最低</small>
              <strong>
                {numberFormatter.format(detail.result.rows[detail.input.npLevel - 1]!.minimum)}
              </strong>
            </span>
            <span>
              <small>平均</small>
              <strong>
                {numberFormatter.format(detail.result.rows[detail.input.npLevel - 1]!.average)}
              </strong>
            </span>
            <span>
              <small>最大</small>
              <strong>
                {numberFormatter.format(detail.result.rows[detail.input.npLevel - 1]!.maximum)}
              </strong>
            </span>
          </div>
          <p className="ranking-input-summary">
            <span>
              最終ATK{' '}
              <strong>
                {numberFormatter.format(
                  detail.input.attackerAtk + detail.input.fouAtk + detail.input.craftEssenceAtk,
                )}
              </strong>
            </span>
            <span>
              相性 クラス{detail.input.classAffinity.toFixed(2)}倍・属性
              {detail.input.attributeAffinity.toFixed(2)}倍
            </span>
            <span>
              HP{' '}
              {detail.input.attackerHpPermille === null
                ? '未入力'
                : `${String(detail.input.attackerHpPermille / 10)}%`}
            </span>
          </p>
        </div>
        <AreaContributionSummary detail={detail} />
        <section className="ranking-effect-stacks" aria-label="適用効果と計算外効果">
          <h4>適用内容</h4>
          <ul className="modifier-chip-list ranking-effect-list">
            {stacks.flatMap((stack) =>
              stack.sources.map((source) => (
                <ModifierChip
                  key={`${stack.kind}:${source.key}`}
                  active={damageEffectContributes(source)}
                  label={source.effectLabel}
                  detail={`${damageEffectStateLabel(source)}・${source.effectName || source.sourceName}`}
                  sources={[
                    {
                      key: source.key,
                      label: source.sourceName,
                      imageKey: source.imageKey,
                    },
                  ]}
                />
              )),
            )}
          </ul>
        </section>
        <section className="ranking-contribution-decisions" aria-label="寄与ごとのpolicy判定">
          <h4>寄与ごとの判定</h4>
          <ul>
            {detail.effectiveContributions.contributions.map((contribution) => (
              <li key={contribution.contributionId}>
                <code>{contribution.contributionId}</code>
                <span>自己: {decisionLabel(contribution.selfDecision)}</span>
                <span>条件: {decisionLabel(contribution.conditionDecision)}</span>
                <span>エリア: {decisionLabel(contribution.areaViewDecision)}</span>
                <strong>{contribution.effective ? 'damageへ適用' : 'damage対象外'}</strong>
              </li>
            ))}
          </ul>
        </section>
        {evidence.conditions.length > 0 ? (
          <section className="ranking-context-evidence" aria-label="成立条件と確率結果">
            <h4>成立条件・確率結果</h4>
            <ul>
              {evidence.conditions.map((item) => (
                <li key={item.key}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <section className="ranking-execution-evidence" aria-label="採用した実行経路">
          <h4>実行経路</h4>
          <dl>
            {evidence.profile.map((item) => (
              <div key={item.key}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
          <ol>
            {evidence.actions.map((item) => (
              <li key={item.key}>
                {item.label}
                <small>{item.value}</small>
              </li>
            ))}
          </ol>
        </section>
      </>
      {detail.result.issues.length > 0 ? (
        <ul className="ranking-issues">
          {detail.result.issues.map((issue) => (
            <li key={`${issue.code}:${issue.detail}`}>{issue.code}</li>
          ))}
        </ul>
      ) : null}
      {detail.warnings.length > 0 ? (
        <ul className="ranking-issues" aria-label="計算上の警告">
          {detail.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      <button
        className="ranking-open-calculator"
        type="button"
        onClick={() => onOpenCalculator(detail)}
      >
        同じ条件で計算機を開く
      </button>
    </div>
  );
}
