import type { RankingPolicyDetail } from '@fgo-lab/calculation-application';
import { findActorForm, type MasterDataSnapshot } from '@fgo-lab/master-data';
import { servantClassLabels } from '../../ui/servantFilterOptions';
import { traitLabel } from '../calculator/traitPresentation';

export interface RankingEvidenceItem {
  key: string;
  label: string;
  value: string;
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
  const conditions: RankingEvidenceItem[] = [];
  if (detail.candidateEvidence.startNpGauge !== 10_000)
    conditions.push({
      key: 'start-np',
      label: '開始NP',
      value: `${String(detail.candidateEvidence.startNpGauge / 100)}%`,
    });
  for (const input of detail.effectInputs)
    conditions.push({
      key: `input:${input.key}`,
      label: input.label,
      value: input.value === null ? '未入力' : String(input.value),
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
    value: `NP ${String(action.resourceBefore.gauge / 100)}% → ${String(action.resourceAfter.gauge / 100)}%`,
  }));
  return { profile, conditions, actions };
}
