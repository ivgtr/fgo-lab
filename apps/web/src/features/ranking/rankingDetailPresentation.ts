import type { EffectProjection, RankingPolicyDetail } from '@fgo-lab/calculation-application';
import { findActorForm, type MasterDataSnapshot } from '@fgo-lab/master-data';
import { servantClassLabels } from '../../ui/servantFilterOptions';
import { traitLabel } from '../calculator/traitPresentation';
import { ocBoostUseSummary, ocUseSummary } from '../../ui/ocPresentation';

export interface RankingEvidenceItem {
  key: string;
  label: string;
  value: string;
}

type RankingContribution = RankingPolicyDetail['effectiveContributions']['contributions'][number];
type ContributionComponent = RankingContribution['component'];
type ContributionPolicyDecision = RankingContribution['selfDecision'];
type OperationOutcome = RankingContribution['executionOutcome'];

const CONTRIBUTION_COMPONENT_LABELS: Record<ContributionComponent, string> = {
  modifier: '効果倍率',
  modifierRate: '効果加算',
  ignore: '貫通効果',
  npBase: '宝具基礎ダメージ',
  npSpecial: '特攻効果',
};

const POLICY_REASON_LABELS: Record<
  Extract<ContributionPolicyDecision, { kind: 'excluded' }>['reason'],
  string
> = {
  selfBuffPolicy: '自己バフ設定により除外',
  conditionalEffectPolicy: '条件効果設定により除外',
  areaView: 'エリア表示設定により除外',
};

const OUTCOME_LABELS: Record<OperationOutcome, string> = {
  applied: '実行済み',
  notApplied: '適用されません',
  notRelevant: '今回の計算対象外',
  impossible: '実行不能',
  unsupported: '未対応',
};

const EXPLANATION_LABELS: Record<EffectProjection['explanation']['code'], string> = {
  applied: '実行済み',
  disabled: '無効化',
  conditionNotMet: '条件不成立',
  cardMismatch: 'カード条件不一致',
  targetMismatch: '対象条件不一致',
  stateMutationOnly: '状態反映のみ',
  unresolved: '判定未確定',
};

export function contributionDecisionLabel(decision: ContributionPolicyDecision): string {
  return decision.kind === 'included' ? '適用' : POLICY_REASON_LABELS[decision.reason];
}

export function contributionComponentLabel(component: ContributionComponent): string {
  return CONTRIBUTION_COMPONENT_LABELS[component];
}

export function operationOutcomeLabel(outcome: OperationOutcome): string {
  return OUTCOME_LABELS[outcome];
}

export function explanationLabel(code: EffectProjection['explanation']['code']): string {
  return EXPLANATION_LABELS[code];
}

export function projectionOutcomeLabel(effect: EffectProjection): string {
  if (effect.outcome === 'unsupported') return OUTCOME_LABELS.unsupported;
  if (
    effect.outcome !== 'applied' &&
    effect.proc.kind !== 'guaranteed' &&
    effect.explanation.code === 'disabled' &&
    effect.sourceActive &&
    effect.decision.state !== 'disabled'
  )
    return '確率不成立';
  return explanationLabel(effect.explanation.code);
}

export function rankingExclusionLabel(
  status: 'unavailableUnderPolicy' | 'inputRequired' | 'invalid' | 'unsupported',
  reason?: string,
): string {
  if (reason?.startsWith('inputRequired:')) return '追加の入力が必要です';
  const reasonLabels: Record<string, string> = {
    attackProfileNotReachable: '攻撃宝具へ到達する準備手順がありません',
    noSatisfiableCandidate: '条件を満たす実行候補がありません',
    npCapacityExceeded: '開始NPまたは必要NPがNP上限を超えています',
    candidateExecutionUnsupported: '候補の実行意味論に未対応部分があります',
    unsupportedActionAdmission: '実行条件を判定できない候補があります',
    unexpectedRankingFailure: 'ランキング計算で予期しない失敗が発生しました',
  };
  if (reason && reasonLabels[reason]) return reasonLabels[reason];
  const labels: Record<typeof status, string> = {
    unavailableUnderPolicy: 'この条件では実行可能な候補がありません',
    inputRequired: '追加の入力が必要です',
    invalid: '入力または条件が不正です',
    unsupported: '対応していない意味論が含まれます',
  };
  return labels[status];
}

export function calculationIssueLabel(code: string): string {
  if (code.startsWith('preparation:')) return '準備手順を適用できません';
  if (code.includes('input') || code.includes('required')) return '必要な入力を解決できません';
  if (code.includes('unsupported')) return '対応していない意味論が含まれます';
  if (code.includes('invalid') || code.includes('conflict')) return '入力または条件が不正です';
  return '計算上の問題があります';
}

export function warningLabel(_warning: string): string {
  return '計算上の警告があります';
}

export function detailErrorLabel(_reason: string): string {
  return '詳細を読み込めませんでした';
}

export interface RankingContributionView {
  key: string;
  component: string;
  selfDecision: string;
  conditionDecision: string;
  areaViewDecision: string;
  outcome: string;
  effective: boolean;
  presentationCounted: boolean;
}

export interface RankingContributionGroupView {
  key: string;
  label: string;
  source: string;
  contributions: RankingContributionView[];
}

function finalContributionOutcome(
  contribution: RankingContribution,
  relatedEffects: readonly EffectProjection[],
): string {
  if (contribution.effective) return 'damageへ適用';
  if (contribution.executionOutcome === 'unsupported') return OUTCOME_LABELS.unsupported;
  if (contribution.executionOutcome === 'impossible') return OUTCOME_LABELS.impossible;
  if (contribution.executionOutcome === 'notRelevant') return OUTCOME_LABELS.notRelevant;
  const policyExclusions = [
    contribution.selfDecision,
    contribution.conditionDecision,
    contribution.areaViewDecision,
  ]
    .filter((decision) => decision.kind === 'excluded')
    .map((decision) => contributionDecisionLabel(decision));
  if (contribution.executionOutcome === 'applied' && policyExclusions.length > 0)
    return `実行済み・${policyExclusions.join('／')}`;
  const relatedOutcome = relatedEffects.find(
    (effect) => effect.explanation.code !== 'applied' || effect.outcome !== 'applied',
  );
  if (relatedOutcome) return projectionOutcomeLabel(relatedOutcome);
  return OUTCOME_LABELS[contribution.executionOutcome];
}

export function presentRankingContributionGroups(
  detail: RankingPolicyDetail,
): RankingContributionGroupView[] {
  const groups = new Map<string, RankingContributionGroupView>();
  for (const contribution of detail.effectiveContributions.contributions) {
    const relatedEffects = detail.effects.filter(
      (effect) => effect.contributionId === contribution.contributionId,
    );
    const firstEffect = relatedEffects[0];
    const key = contribution.presentationGroupId;
    const group = groups.get(key) ?? {
      key,
      label: firstEffect?.label ?? contributionComponentLabel(contribution.component),
      source: firstEffect?.sourceName ?? '実行結果',
      contributions: [],
    };
    group.contributions.push({
      key: contribution.contributionId,
      component: contributionComponentLabel(contribution.component),
      selfDecision: contributionDecisionLabel(contribution.selfDecision),
      conditionDecision: contributionDecisionLabel(contribution.conditionDecision),
      areaViewDecision: contributionDecisionLabel(contribution.areaViewDecision),
      outcome: finalContributionOutcome(contribution, relatedEffects),
      effective: contribution.effective,
      presentationCounted: contribution.presentationCounted,
    });
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function rankingEffectStateLabel(
  detail: RankingPolicyDetail,
  effect: EffectProjection | undefined,
  fallback: string,
): string {
  if (!effect) return fallback;
  const policyReasons = detail.effectiveContributions.contributions
    .filter((contribution) => contribution.contributionId === effect.contributionId)
    .flatMap((contribution) =>
      [contribution.selfDecision, contribution.conditionDecision, contribution.areaViewDecision]
        .filter((decision) => decision.kind === 'excluded')
        .map((decision) => contributionDecisionLabel(decision)),
    );
  if (effect.outcome === 'applied' && policyReasons.length > 0) return policyReasons.join('／');
  return effect.outcome === 'applied' ? fallback : projectionOutcomeLabel(effect);
}

export function presentRankingDetailEvidence(
  detail: RankingPolicyDetail,
  master: MasterDataSnapshot,
): {
  profile: RankingEvidenceItem[];
  conditions: RankingEvidenceItem[];
  actions: RankingEvidenceItem[];
} {
  const servant = master.servants.find(({ id }) => id === detail.servantId);
  const initialForm = servant
    ? findActorForm(servant, detail.scenario.attacker.initialActorFormId)?.name
    : undefined;
  const profile = [
    { key: 'initial-form', label: '開始形態', value: initialForm ?? '不明' },
    {
      key: 'terminal-form',
      label: '終端形態',
      value: detail.attackProfile.terminalFormLabel ?? initialForm ?? '不明',
    },
    { key: 'attack-np', label: '攻撃宝具', value: detail.noblePhantasmName },
  ];
  const conditions: RankingEvidenceItem[] = [
    { key: 'initial-oc', label: '初期OC', value: String(detail.scenario.initialOvercharge) },
    { key: 'effective-oc', label: '発動時OC', value: String(detail.input.overcharge) },
  ];
  conditions.push({
    key: 'start-np',
    label: '開始NP',
    value: `${String(detail.candidateEvidence.startNpGauge / 100)}%`,
  });
  for (const input of detail.effectInputs)
    conditions.push({
      key: `input:${input.key}`,
      label: input.label,
      value:
        input.value === null
          ? '未入力'
          : input.kind === 'effectStackCount'
            ? `${input.value}回・準備開始時の仮定（${detail.scenario.canonicalInputValues[input.key]?.origin === 'maximum' ? '最大回数' : detail.scenario.canonicalInputValues[input.key]?.origin === 'baseline' ? '通常値' : '指定回数'}）`
            : String(input.value),
    });
  for (const assertion of detail.scenario.worldFactAssertions)
    conditions.push({
      key: `fact:${assertion.decisionKey}`,
      label:
        assertion.fact.kind === 'trait' && assertion.fact.scope === 'field'
          ? 'フィールド条件'
          : '共通条件',
      value:
        assertion.fact.kind === 'trait'
          ? `${traitLabel(assertion.fact.trait)}${assertion.fact.present ? '' : 'ではない'}`
          : `${assertion.fact.quantity}=${String(assertion.fact.value)}`,
    });
  if (detail.scenario.targetContext.class.kind === 'concrete')
    conditions.push({
      key: 'target-class',
      label: '対象クラス',
      value:
        servantClassLabels.get(detail.scenario.targetContext.class.classId) ??
        detail.scenario.targetContext.class.classId,
    });
  if (detail.scenario.targetContext.attribute.kind === 'concrete')
    conditions.push({
      key: 'target-attribute',
      label: '対象属性',
      value: detail.scenario.targetContext.attribute.attribute,
    });
  for (const { familyId } of detail.scenario.targetContext.families)
    conditions.push({ key: `family:${familyId}`, label: '対象family', value: familyId });
  const visibleProcEffects = [
    ...new Map(
      detail.effects
        .filter((effect) => effect.visibility === 'visible' && effect.proc.kind !== 'guaranteed')
        .map((effect) => [effect.projectionKey, effect]),
    ).values(),
  ];
  for (const effect of visibleProcEffects) {
    const procInput = detail.effectInputs.find((input) =>
      input.relatedProjectionKeys.includes(effect.projectionKey),
    );
    conditions.push({
      key: `proc:${effect.projectionKey}`,
      label: effect.label,
      value: `${
        effect.proc.kind === 'chainedRolls'
          ? `連続成功 ${String(procInput?.value ?? 0)}/${String(procInput?.maximum ?? effect.proc.maximumSuccesses)}`
          : effect.outcome === 'applied'
            ? '成功'
            : '失敗'
      }${effect.procRatePermille === null ? '' : `・${String(effect.procRatePermille / 10)}%`}`,
    });
  }
  const actions = detail.appliedPreparationActions.map((action, index) => ({
    key: `${String(index)}:${action.sourceKind}:${action.sourceId}`,
    label:
      action.command.kind === 'useSkillSlot'
        ? `スキル${String(action.command.slot)}`
        : action.command.kind === 'useTransformNoblePhantasm'
          ? '変身宝具'
          : `攻撃宝具「${detail.noblePhantasmName}」`,
    value: `NP ${String(action.resourceBefore.gauge / 100)}% → ${String(action.resourceAfter.gauge / 100)}%${action.ocUse ? ` ／ ${ocUseSummary(action.ocUse)}` : ''}`,
  }));
  for (const [index, action] of detail.appliedPreparationActions.entries())
    for (const use of action.ocUse?.boostUses ?? [])
      actions.push({
        key: `oc:${index}:${use.instanceId}`,
        label: 'OC加算の使用',
        value: ocBoostUseSummary(use),
      });
  return { profile, conditions, actions };
}
