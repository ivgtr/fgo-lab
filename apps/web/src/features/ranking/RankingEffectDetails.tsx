import type { RankingDetail } from '@fgo-lab/calculation-application';
import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import type { CalculationScenario } from '@fgo-lab/schema';
import {
  collectDamageEffectStacks,
  damageEffectStateLabel,
} from '../../presentation/damageEffectStacks';
import { MasterImage } from '../../ui/MasterImage';
import { numberFormatter } from '../../ui/i18n';
import { servantClassLabels } from '../../ui/servantFilterOptions';
import { traitLabel } from '../calculator/traitPresentation';

function AreaSupportSummary({ detail }: { detail: RankingDetail }) {
  const area = detail.areaSupport;
  if (detail.result.status !== 'calculated' || area?.result.status !== 'calculated') return null;
  const npIndex = detail.scenario.attacker.npLevel - 1;
  const personalRow = detail.result.rows[npIndex];
  const areaRow = area.result.rows[npIndex];
  if (!personalRow || !areaRow || areaRow.average === personalRow.average) return null;
  return (
    <section className="ranking-area-support" aria-label="エリア支援込みダメージ">
      <h4>エリア支援込み</h4>
      <dl className="ranking-damage-range">
        <div>
          <dt>最低</dt>
          <dd>{numberFormatter.format(areaRow.minimum)}</dd>
        </div>
        <div>
          <dt>平均</dt>
          <dd>{numberFormatter.format(areaRow.average)}</dd>
        </div>
        <div>
          <dt>最大</dt>
          <dd>{numberFormatter.format(areaRow.maximum)}</dd>
        </div>
        <div>
          <dt>平均増加</dt>
          <dd>+{numberFormatter.format(areaRow.average - personalRow.average)}</dd>
        </div>
      </dl>
    </section>
  );
}

export function RankingEffectDetails({
  detail,
  master,
  onOpenCalculator,
}: {
  detail: RankingDetail;
  master: MasterDataSnapshot;
  onOpenCalculator: (scenario: CalculationScenario) => void;
}) {
  const craftEssenceId = detail.scenario.craftEssence?.craftEssenceId;
  const craftEssence = master.craftEssences.find((candidate) => candidate.id === craftEssenceId);
  const stacks = collectDamageEffectStacks({
    effects: detail.effects,
    servants: master.servants,
    craftEssence,
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
          <dl className="ranking-damage-range">
            <div>
              <dt>最低</dt>
              <dd>
                {numberFormatter.format(detail.result.rows[detail.input.npLevel - 1]!.minimum)}
              </dd>
            </div>
            <div>
              <dt>平均</dt>
              <dd>
                {numberFormatter.format(detail.result.rows[detail.input.npLevel - 1]!.average)}
              </dd>
            </div>
            <div>
              <dt>最大</dt>
              <dd>
                {numberFormatter.format(detail.result.rows[detail.input.npLevel - 1]!.maximum)}
              </dd>
            </div>
          </dl>
          <AreaSupportSummary detail={detail} />
          <dl className="ranking-input-summary">
            <div>
              <dt>最終ATK</dt>
              <dd>
                {numberFormatter.format(
                  detail.input.attackerAtk + detail.input.fouAtk + detail.input.craftEssenceAtk,
                )}
              </dd>
            </div>
            <div>
              <dt>相性</dt>
              <dd>
                クラス{detail.input.classAffinity.toFixed(2)}倍・属性
                {detail.input.attributeAffinity.toFixed(2)}倍
              </dd>
            </div>
            <div>
              <dt>HP</dt>
              <dd>
                {detail.input.attackerHpPermille === null
                  ? '未入力'
                  : `${String(detail.input.attackerHpPermille / 10)}%`}
              </dd>
            </div>
          </dl>
          <section className="ranking-effect-stacks" aria-label="適用効果と計算外効果">
            {stacks.map((stack) => (
              <div key={stack.kind}>
                <h4>{stack.label}</h4>
                <ul>
                  {stack.sources.map((source) => (
                    <li key={source.key} data-applied={source.applied ? 'true' : 'false'}>
                      <MasterImage
                        src={source.imageKey}
                        alt=""
                        fallback={source.effectLabel}
                        className="ranking-effect-icon"
                      />
                      <span>{source.effectLabel}</span>
                      <small>
                        {damageEffectStateLabel(source)}・{source.effectName || source.sourceName}
                      </small>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
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
                {detail.scenario.worldFactAssertions.map((assertion) => (
                  <li key={assertion.decisionKey}>
                    <span>共通条件</span>
                    <strong>
                      {assertion.fact.kind === 'trait'
                        ? traitLabel(assertion.fact.trait)
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
      <button type="button" onClick={() => onOpenCalculator(detail.scenario)}>
        同じ条件で計算機を開く
      </button>
    </div>
  );
}
