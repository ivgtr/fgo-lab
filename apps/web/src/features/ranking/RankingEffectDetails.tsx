import {
  resolveRankingEffectContribution,
  type RankingDetail,
} from '@fgo-lab/calculation-application';
import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import {
  collectDamageEffectStacks,
  damageEffectStateLabel,
} from '../../presentation/damageEffectStacks';
import { numberFormatter } from '../../ui/i18n';
import { servantClassLabels } from '../../ui/servantFilterOptions';
import { ModifierChip } from '../calculator/ModifierChip';
import { traitLabel } from '../calculator/traitPresentation';

function AreaContributionSummary({ detail }: { detail: RankingDetail }) {
  const area = detail.areaContribution;
  if (detail.result.status !== 'calculated' || area?.withoutAreaResult.status !== 'calculated')
    return null;
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

export function RankingEffectDetails({
  detail,
  master,
  onOpenCalculator,
}: {
  detail: RankingDetail;
  master: MasterDataSnapshot;
  onOpenCalculator: (detail: RankingDetail) => void;
}) {
  const craftEssenceId = detail.scenario.craftEssence?.craftEssenceId;
  const craftEssence = master.craftEssences.find((candidate) => candidate.id === craftEssenceId);
  const stacks = collectDamageEffectStacks({
    effects: detail.effects,
    servants: master.servants,
    craftEssence,
    contributionState: (effect) =>
      resolveRankingEffectContribution(effect, detail.contributionProjection),
  });
  const visibleProcEffects = [
    ...new Map(
      detail.effects
        .filter((effect) => effect.visibility === 'visible' && effect.proc.kind !== 'guaranteed')
        .map((effect) => [effect.projectionKey, effect]),
    ).values(),
  ];
  return (
    <div className="ranking-row-detail">
      {detail.result.status === 'calculated' ? (
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
                    active={source.applied}
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
          {detail.effectInputs.length > 0 ||
          detail.scenario.worldFactAssertions.length > 0 ||
          visibleProcEffects.length > 0 ||
          detail.scenario.targetContext.class.kind === 'concrete' ||
          detail.scenario.targetContext.attribute.kind === 'concrete' ||
          detail.scenario.targetContext.families.length > 0 ? (
            <section className="ranking-context-evidence" aria-label="成立条件と確率結果">
              <h4>成立条件・確率結果</h4>
              <ul>
                {detail.effectInputs.map((input) => (
                  <li key={input.key}>
                    <span>{input.label}</span>
                    <strong>{input.value === null ? '未入力' : input.value}</strong>
                  </li>
                ))}
                {detail.scenario.worldFactAssertions
                  .filter(({ fact }) => fact.kind !== 'trait' || fact.present)
                  .map((assertion) => (
                    <li key={assertion.decisionKey}>
                      <span>
                        {assertion.fact.kind === 'trait' && assertion.fact.scope === 'field'
                          ? 'フィールド条件'
                          : '共通条件'}
                      </span>
                      <strong>
                        {assertion.fact.kind === 'trait'
                          ? `${traitLabel(assertion.fact.trait)}${assertion.fact.present ? '' : 'ではない'}`
                          : `${assertion.fact.quantity}=${String(assertion.fact.value)}`}
                      </strong>
                    </li>
                  ))}
                {detail.scenario.targetContext.class.kind === 'concrete' ? (
                  <li>
                    <span>対象クラス</span>
                    <strong>
                      {servantClassLabels.get(detail.scenario.targetContext.class.classId) ??
                        detail.scenario.targetContext.class.classId}
                    </strong>
                  </li>
                ) : null}
                {detail.scenario.targetContext.attribute.kind === 'concrete' ? (
                  <li>
                    <span>対象属性</span>
                    <strong>{detail.scenario.targetContext.attribute.attribute}</strong>
                  </li>
                ) : null}
                {detail.scenario.targetContext.families.map(({ familyId }) => (
                  <li key={`family:${familyId}`}>
                    <span>対象family</span>
                    <strong>{familyId}</strong>
                  </li>
                ))}
                {visibleProcEffects.map((effect) => {
                  const procInput = detail.effectInputs.find((input) =>
                    input.relatedProjectionKeys.includes(effect.projectionKey),
                  );
                  return (
                    <li key={`proc:${effect.projectionKey}`}>
                      <span>{effect.label}</span>
                      <strong>
                        {effect.proc.kind === 'chainedRolls'
                          ? `連続成功 ${String(procInput?.value ?? 0)}/${String(procInput?.maximum ?? effect.proc.maximumSuccesses)}`
                          : effect.outcome === 'applied'
                            ? '成功'
                            : '失敗'}
                        {effect.procRatePermille === null
                          ? ''
                          : `・${String(effect.procRatePermille / 10)}%`}
                      </strong>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </>
      ) : (
        <p role="alert">
          {detail.result.status === 'inputRequired'
            ? `入力が必要: ${detail.result.requiredInputs.map((input) => input.label).join('、')}`
            : `計算対象外: ${detail.result.issues.map((issue) => issue.code).join('、')}`}
        </p>
      )}
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
