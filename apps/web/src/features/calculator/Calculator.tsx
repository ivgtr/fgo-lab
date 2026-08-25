import { useEffect, useRef, useState } from 'react';
import {
  deriveCraftEssenceAtk,
  deriveNpMultipliers,
  getPrimaryNoblePhantasm,
  getPrimaryNpDamage,
  getPrimaryNpPresentation,
  type CraftEssenceMaster,
  type ServantMaster,
} from '@fgo-lab/master-data';
import { classAttackRate as resolveClassAttackRate } from '@fgo-lab/calc-core';
import { applyScenarioNpDamageFunction } from '@fgo-lab/calculation-application';
import type { ResolvedEffect } from '@fgo-lab/effect-resolver';
import type {
  AttackerSkillSelection,
  DamageResolutionInput,
  CalculationHistoryEntry,
  CalculationResult as CalculationResultValue,
  CalculationScenario,
  CraftEssenceCopy,
  ServantBuild,
  SupportTemplate,
} from '@fgo-lab/schema';
import { numberFormatter } from '../../ui/i18n';
import { MasterImage } from '../../ui/MasterImage';
import {
  AttackerPicker,
  CraftEssencePicker,
  SupportServantPicker,
  SupportTemplatePicker,
} from './CalculatorPickers';
import { traitLabel } from './traitPresentation';
import { CalculationResult } from './CalculationResult';
import { collectDamageEffectStacks } from './damageEffectStacks';
import { AttackerSkills } from './AttackerSkills';
import { AppliedEffects } from './AppliedEffects';
import { EffectiveInputDetails } from './EffectiveInputDetails';
import { SupportSourceCard } from '../support/SupportSourceCard';
import './calculator.css';
import './calculator-form.css';

export function Calculator({
  resolvedInput,
  scenarioInput,
  resolvedEffects,
  effectWarnings,
  result,
  scenario,
  servants,
  builds,
  craftEssenceCopies,
  craftEssences,
  supportTemplates,
  history,
  selectedSupport,
  onScenarioChange,
  onSupportSelect,
  onSupportSave,
  onFinalize,
  onHistorySelect,
}: {
  resolvedInput: DamageResolutionInput;
  scenarioInput: DamageResolutionInput;
  resolvedEffects: readonly ResolvedEffect[];
  effectWarnings: readonly string[];
  result: CalculationResultValue;
  scenario: CalculationScenario;
  servants: ServantMaster[];
  builds: Record<string, ServantBuild>;
  craftEssenceCopies: CraftEssenceCopy[];
  craftEssences: CraftEssenceMaster[];
  supportTemplates: SupportTemplate[];
  history: CalculationHistoryEntry[];
  selectedSupport: SupportTemplate | undefined;
  onScenarioChange: (scenario: CalculationScenario) => Promise<void>;
  onSupportSelect: (template: SupportTemplate | undefined) => Promise<void>;
  onSupportSave: (mode: 'new' | 'source') => Promise<void>;
  onFinalize: () => Promise<void>;
  onHistorySelect: (entry: CalculationHistoryEntry) => Promise<void>;
}) {
  const input = resolvedInput;
  const resolvedScenario = scenario.mode === 'resolved' ? scenario : null;
  const lastResolvedScenario = useRef<Extract<CalculationScenario, { mode: 'resolved' }> | null>(
    resolvedScenario,
  );
  useEffect(() => {
    if (resolvedScenario) lastResolvedScenario.current = resolvedScenario;
  }, [resolvedScenario]);
  const mode = resolvedScenario ? 'quick' : 'direct';
  const [supportDialogOpen, setSupportDialogOpen] = useState(false);
  const [supportServantDialogOpen, setSupportServantDialogOpen] = useState(false);
  const [attackerDialogOpen, setAttackerDialogOpen] = useState(false);
  const [craftEssenceDialogOpen, setCraftEssenceDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const attackerTriggerRef = useRef<HTMLButtonElement>(null);
  const craftEssenceTriggerRef = useRef<HTMLButtonElement>(null);
  const manualOverrides = new Set(Object.keys(resolvedScenario?.explicitOverrides ?? {}));
  const attackerSource = resolvedScenario?.attacker.source ?? 'master';
  const craftEssenceSelection = resolvedScenario?.craftEssence ?? null;
  const attacker = servants.find((candidate) => candidate.id === input.attackerId);
  const attackerNp = attacker ? getPrimaryNpPresentation(attacker) : null;
  const attackerDamage = attacker ? getPrimaryNpDamage(attacker) : undefined;
  const npConditionTraits = attackerDamage
    ? [
        ...new Map(
          attackerDamage.parametersByOvercharge.flat().flatMap((parameter) =>
            parameter.targetTrait
              ? [
                  [
                    parameter.targetTrait.name,
                    {
                      ...parameter.targetTrait,
                      id: parameter.targetTrait.name,
                      multiplier: (parameter.correctionPermille ?? 1_000) / 1_000,
                    },
                  ] as const,
                ]
              : [],
          ),
        ).values(),
      ]
    : [];
  const selectedCraftEssence = craftEssences.find(
    (candidate) => candidate.id === input.craftEssenceId,
  );
  const selectedCraftEssenceCopy = craftEssenceSelection
    ? craftEssenceCopies.find(
        (copy) => copy.craftEssenceId === craftEssenceSelection.craftEssenceId,
      )
    : undefined;
  const ownEffects = resolvedEffects.filter((effect) => effect.origin !== 'support');
  const supportEffects = resolvedEffects.filter((effect) => effect.origin === 'support');
  const supportComposition = resolvedScenario?.support?.composition;
  const supportSources = supportComposition?.sources ?? [];
  const selectedSupportEffectCount = supportComposition?.selectedEffects.length ?? 0;
  const supportModified = Boolean(
    selectedSupport &&
    supportComposition &&
    JSON.stringify(selectedSupport.composition) !== JSON.stringify(supportComposition),
  );
  const damageEffectStacks = collectDamageEffectStacks({
    effects: resolvedEffects,
    servants,
    craftEssence: selectedCraftEssence,
  });
  const enabledAttackerSkillCount = new Set(
    resolvedEffects
      .filter((effect) => effect.origin === 'attacker' && effect.state === 'applied')
      .map((effect) => effect.skillId),
  ).size;
  const classSituationLabel =
    input.classAffinity === 2
      ? '有利'
      : input.classAffinity === 1.5
        ? '攻撃有利'
        : input.classAffinity === 0.5
          ? '不利'
          : input.classAffinity === 1
            ? '等倍'
            : '直接入力';
  const attributeSituationLabel =
    input.attributeAffinity === 1.1
      ? '有利'
      : input.attributeAffinity === 0.9
        ? '不利'
        : input.attributeAffinity === 1
          ? '等倍'
          : '直接入力';
  const targetSummary = `クラス${classSituationLabel}（${input.classAffinity.toFixed(2)}倍）・属性${attributeSituationLabel}（${input.attributeAffinity.toFixed(2)}倍）${
    input.target.traits.length ? `・対象状態 ${input.target.traits.map(traitLabel).join('・')}` : ''
  }${
    input.fieldTraits.length ? `・フィールド ${input.fieldTraits.map(traitLabel).join('・')}` : ''
  }`;
  const craftEssenceSummary =
    selectedCraftEssence && craftEssenceSelection
      ? `${selectedCraftEssence.name} Lv.${craftEssenceSelection.level}`
      : '礼装なし';
  const supportSummary = selectedSupport
    ? `${selectedSupport.name}（${selectedSupportEffectCount}効果）`
    : supportSources.length
      ? `未保存の支援構成（${selectedSupportEffectCount}効果）`
      : '支援なし';
  function changeManualInput(patch: Partial<DamageResolutionInput>) {
    if (scenario.mode !== 'manual') return;
    void onScenarioChange({ ...scenario, manual: { ...scenario.manual, ...patch } });
  }
  function changeFinalValue(key: keyof DamageResolutionInput, value: number) {
    if (scenario.mode === 'manual') {
      changeManualInput({ [key]: value });
      return;
    }
    if (!['attackerAtk', 'fouAtk', 'craftEssenceAtk', 'classAttackRate'].includes(key)) return;
    void onScenarioChange({
      ...scenario,
      attacker: key === 'fouAtk' ? { ...scenario.attacker, fouAtk: value } : scenario.attacker,
      explicitOverrides: { ...scenario.explicitOverrides, [key]: value },
    });
  }
  function changeAffinitySituation(key: 'classAffinity' | 'attributeAffinity', value: number) {
    if (scenario.mode === 'manual') {
      changeManualInput({
        [key]: value,
        target:
          key === 'classAffinity'
            ? { ...input.target, classId: `affinity:${String(value)}` }
            : { ...input.target, attribute: 'unknown' },
      });
      return;
    }
    void onScenarioChange({
      ...scenario,
      assumptions: { ...scenario.assumptions, [key]: value },
      target:
        key === 'classAffinity'
          ? { ...scenario.target, classId: `affinity:${String(value)}` }
          : { ...scenario.target, attribute: 'unknown' },
    });
  }
  function changeAttackerLevel(level: number) {
    if (scenario.mode === 'manual') {
      changeManualInput({
        attackerLevel: level,
        attackerAtk: attacker?.atkByLevel[String(level)] ?? input.attackerAtk,
      });
      return;
    }
    void onScenarioChange({ ...scenario, attacker: { ...scenario.attacker, level } });
  }
  function resetAutomaticValues() {
    if (scenario.mode !== 'manual') return;
    const saved = builds[input.attackerId];
    changeManualInput({
      ...input,
      attackerAtk:
        attacker?.atkByLevel[String(input.attackerLevel)] ??
        attacker?.atkByLevel['90'] ??
        input.attackerAtk,
      fouAtk: saved?.fouAtk ?? 1000,
      craftEssenceAtk:
        selectedCraftEssence && craftEssenceSelection
          ? deriveCraftEssenceAtk(
              selectedCraftEssence,
              craftEssenceSelection.level,
              craftEssenceSelection.limitBreak,
            )
          : 0,
      classAttackRate: resolveClassAttackRate(attacker?.classId ?? 'unknown'),
      classAffinity: 1,
      attributeAffinity: 1,
    });
  }
  function changeEffectMode(effectMode: 'resolved' | 'manual') {
    if (effectMode === 'manual') {
      void onScenarioChange({ mode: 'manual', manual: scenarioInput });
      return;
    }
    if (scenario.mode === 'resolved') return;
    if (lastResolvedScenario.current) {
      void onScenarioChange(lastResolvedScenario.current);
      return;
    }
    const saved = builds[input.attackerId];
    const source = saved?.npLevel ? 'owned' : 'master';
    void onScenarioChange({
      mode: 'resolved',
      attacker: {
        servantId: input.attackerId,
        source,
        level: input.attackerLevel,
        npLevel: input.npLevel,
        fouAtk: input.fouAtk,
        stateTraits: input.attackerStateTraits,
      },
      overcharge: input.overcharge,
      target: {
        classId: input.target.classId,
        attribute: input.target.attribute,
        traits: input.target.traits,
        stateTraits: input.targetStateTraits,
        rarity: input.targetRarity,
      },
      attackerHpPermille: input.attackerHpPermille,
      fieldTraits: input.fieldTraits,
      battleState: { battlePointPhase: input.battlePointPhase },
      assumptions: {
        classAffinity: input.classAffinity,
        attributeAffinity: input.attributeAffinity,
      },
      craftEssence: null,
      attackerSkills: (attacker?.skills ?? []).slice(0, 3).map((skill, index) => ({
        skillId: skill.id,
        skillLevel: source === 'owned' ? (saved?.skills[String(index + 1)] ?? 1) : 10,
      })),
      mysticCode: null,
      support: null,
      effectDecisions: {},
      explicitOverrides: {
        attackerAtk: input.attackerAtk,
        fouAtk: input.fouAtk,
        craftEssenceAtk: input.craftEssenceAtk,
        classAttackRate: input.classAttackRate,
      },
    });
  }
  function selectAttacker(candidate: ServantMaster, source: 'owned' | 'master') {
    const saved = source === 'owned' ? builds[candidate.id] : undefined;
    const noblePhantasm = getPrimaryNoblePhantasm(candidate);
    const damage = getPrimaryNpDamage(candidate);
    if (!noblePhantasm || !damage) return;
    const level = saved?.level ?? 90;
    if (scenario.mode === 'manual') {
      changeManualInput(
        applyScenarioNpDamageFunction(
          {
            ...input,
            attackerId: candidate.id,
            attackerLevel: level,
            attackerAtk:
              candidate.atkByLevel[String(level)] ??
              candidate.atkByLevel['90'] ??
              input.attackerAtk,
            fouAtk: saved?.fouAtk ?? 1000,
            npLevel: Math.max(1, saved?.npLevel ?? 1),
            npMultipliers: deriveNpMultipliers(damage, input.overcharge),
            damageFunction: { status: 'resolved', kind: damage.kind, ignoreDefense: false },
            cardType: noblePhantasm.card,
            classAttackRate: resolveClassAttackRate(candidate.classId),
          },
          damage,
          candidate.traits,
        ),
      );
    } else {
      void onScenarioChange({
        ...scenario,
        attacker: {
          servantId: candidate.id,
          source,
          level,
          npLevel: Math.max(1, saved?.npLevel ?? 1),
          fouAtk: saved?.fouAtk ?? 1000,
          stateTraits: [],
        },
        attackerSkills: candidate.skills.slice(0, 3).map((skill, index) => ({
          skillId: skill.id,
          skillLevel: source === 'owned' ? (saved?.skills[String(index + 1)] ?? 1) : 10,
        })),
        effectDecisions: {},
        explicitOverrides: {},
      });
    }
    closeAttackerDialog();
  }
  function selectCraftEssence(
    master: CraftEssenceMaster,
    source: 'registered' | 'master',
    copy?: CraftEssenceCopy,
  ) {
    const level = copy?.level ?? 1;
    const limitBreak = copy?.limitBreak ?? 0;
    if (scenario.mode === 'manual') {
      if (lastResolvedScenario.current)
        lastResolvedScenario.current = {
          ...lastResolvedScenario.current,
          craftEssence: { craftEssenceId: master.id, level, limitBreak },
        };
      changeManualInput({
        craftEssenceId: master.id,
        craftEssenceAtk: deriveCraftEssenceAtk(master, level, limitBreak),
      });
    } else
      void onScenarioChange({
        ...scenario,
        craftEssence: { craftEssenceId: master.id, level, limitBreak },
      });
    closeCraftEssenceDialog();
  }
  function changeCraftEssenceState(patch: Partial<{ level: number; limitBreak: number }>) {
    const current = craftEssenceSelection;
    if (!current || !selectedCraftEssence || scenario.mode !== 'resolved') return;
    const limitBreak = Math.max(0, Math.min(4, patch.limitBreak ?? current.limitBreak));
    const maximum =
      selectedCraftEssence.maxLevelByLimitBreak[limitBreak] ??
      selectedCraftEssence.maxLevelByLimitBreak[4];
    const level = Math.max(1, Math.min(maximum, patch.level ?? current.level));
    void onScenarioChange({
      ...scenario,
      craftEssence: { ...current, level, limitBreak },
      explicitOverrides: Object.fromEntries(
        Object.entries(scenario.explicitOverrides).filter(([key]) => key !== 'craftEssenceAtk'),
      ),
    });
  }
  function clearCraftEssence() {
    if (scenario.mode === 'manual') changeManualInput({ craftEssenceId: null, craftEssenceAtk: 0 });
    else void onScenarioChange({ ...scenario, craftEssence: null });
  }
  function changeAttackerSkill(skillId: string, patch: Pick<AttackerSkillSelection, 'skillLevel'>) {
    if (!resolvedScenario) return;
    const attackerSkills = resolvedScenario.attackerSkills.map((skill) =>
      skill.skillId === skillId ? { ...skill, ...patch } : skill,
    );
    void onScenarioChange({ ...resolvedScenario, attackerSkills });
  }
  function changeEffect(effectKey: string, active: boolean) {
    const effect = resolvedEffects.find((candidate) => candidate.effectKey === effectKey);
    if (!resolvedScenario) return;
    if (effect?.origin === 'support' && resolvedScenario.support) {
      const ref = {
        sourceInstanceId: effect.sourceInstanceId,
        skillId: effect.skillId,
        effectId: effect.effectId,
      };
      const current = resolvedScenario.support.composition.selectedEffects;
      const matches = (candidate: typeof ref) =>
        candidate.sourceInstanceId === ref.sourceInstanceId &&
        candidate.skillId === ref.skillId &&
        candidate.effectId === ref.effectId;
      void onScenarioChange({
        ...resolvedScenario,
        support: {
          ...resolvedScenario.support,
          composition: {
            ...resolvedScenario.support.composition,
            selectedEffects: active
              ? current.some(matches)
                ? current
                : [...current, ref]
              : current.filter((candidate) => !matches(candidate)),
          },
        },
      });
      return;
    }
    void onScenarioChange({
      ...resolvedScenario,
      effectDecisions: { ...resolvedScenario.effectDecisions, [effectKey]: active },
    });
  }
  function addSupportServant(servant: ServantMaster) {
    const sourceInstanceId = crypto.randomUUID();
    const savedLevels = builds[servant.id]?.skills ?? {};
    const composition = supportComposition ?? { sources: [], selectedEffects: [] };
    if (!resolvedScenario) return;
    void onScenarioChange({
      ...resolvedScenario,
      support: {
        sourceTemplateId: resolvedScenario.support?.sourceTemplateId ?? null,
        composition: {
          ...composition,
          sources: [
            ...composition.sources,
            {
              sourceInstanceId,
              servantId: servant.id,
              skills: servant.skills.map((skill) => ({
                skillId: skill.id,
                skillLevel: savedLevels[String(skill.slot)] ?? 10,
              })),
            },
          ],
        },
      },
    });
    setSupportServantDialogOpen(false);
  }
  function removeCalculationSupportSource(sourceInstanceId: string) {
    if (!resolvedScenario?.support) return;
    void onScenarioChange({
      ...resolvedScenario,
      support: {
        ...resolvedScenario.support,
        composition: {
          sources: resolvedScenario.support.composition.sources.filter(
            (source) => source.sourceInstanceId !== sourceInstanceId,
          ),
          selectedEffects: resolvedScenario.support.composition.selectedEffects.filter(
            (effect) => effect.sourceInstanceId !== sourceInstanceId,
          ),
        },
      },
    });
  }
  function changeSupportSkillLevel(sourceInstanceId: string, skillId: string, skillLevel: number) {
    if (!resolvedScenario?.support) return;
    void onScenarioChange({
      ...resolvedScenario,
      support: {
        ...resolvedScenario.support,
        composition: {
          ...resolvedScenario.support.composition,
          sources: resolvedScenario.support.composition.sources.map((source) =>
            source.sourceInstanceId === sourceInstanceId
              ? {
                  ...source,
                  skills: source.skills.map((skill) =>
                    skill.skillId === skillId ? { ...skill, skillLevel } : skill,
                  ),
                }
              : source,
          ),
        },
      },
    });
  }
  function closeAttackerDialog() {
    setAttackerDialogOpen(false);
    requestAnimationFrame(() => attackerTriggerRef.current?.focus());
  }
  function closeCraftEssenceDialog() {
    setCraftEssenceDialogOpen(false);
    requestAnimationFrame(() => craftEssenceTriggerRef.current?.focus());
  }
  return (
    <div className="worksheet">
      <section>
        <div className="section-heading">
          <div>
            <p className="eyebrow">CONDITIONS</p>
            <h2>計算条件</h2>
          </div>
          <button type="button" onClick={() => setHistoryDialogOpen(true)}>
            履歴（{history.length}）
          </button>
        </div>
        <button
          ref={attackerTriggerRef}
          className="entity-summary entity-picker-trigger"
          onClick={() => setAttackerDialogOpen(true)}
          aria-label="攻撃役を変更"
        >
          <MasterImage src={attacker?.imageKey ?? null} alt="" fallback={attacker?.name ?? '?'} />
          <p>
            <strong>{attacker?.name ?? input.attackerId}</strong>
            <small>
              {attacker?.classId}・{attackerNp?.target === 'all' ? '全体' : '単体'}
              {attackerNp?.card.toUpperCase()}宝具
            </small>
            <small>
              {attackerSource === 'owned' ? '所持・育成管理の保存値' : '全DBの仮想設定'}
            </small>
          </p>
          <span className="picker-action">変更</span>
        </button>
        <div role="tablist" aria-label="入力方法">
          <button
            role="tab"
            aria-selected={mode === 'quick'}
            onClick={() => changeEffectMode('resolved')}
          >
            クイック操作
          </button>
          <button
            role="tab"
            aria-selected={mode === 'direct'}
            onClick={() => changeEffectMode('manual')}
          >
            直接入力
          </button>
        </div>
        <div className="form-grid">
          <label>
            サーヴァントLv
            <input
              aria-label="サーヴァントLv"
              type="number"
              min="1"
              max="120"
              value={input.attackerLevel}
              onChange={(event) => changeAttackerLevel(Number(event.target.value))}
            />
            {mode === 'quick' ? (
              <span
                className="quick-value-presets level-presets"
                aria-label="サーヴァントLvのクイック選択"
              >
                {[90, 100, 120].map((level) => (
                  <button
                    key={level}
                    type="button"
                    aria-pressed={input.attackerLevel === level}
                    onClick={() => changeAttackerLevel(level)}
                  >
                    {level}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={
                    input.attackerLevel ===
                    (attackerSource === 'owned' ? (builds[input.attackerId]?.level ?? 90) : 90)
                  }
                  onClick={() =>
                    changeAttackerLevel(
                      attackerSource === 'owned' ? (builds[input.attackerId]?.level ?? 90) : 90,
                    )
                  }
                >
                  リセット
                </button>
              </span>
            ) : null}
          </label>
          {mode === 'quick' ? (
            <label>
              ATKフォウ（加算）
              <input
                type="number"
                min="0"
                max="3000"
                step="10"
                value={input.fouAtk}
                onChange={(event) => changeFinalValue('fouAtk', Number(event.target.value))}
              />
              <span className="quick-value-presets" aria-label="ATKフォウのクイック選択">
                <button
                  type="button"
                  disabled={input.fouAtk >= 3000}
                  onClick={() => changeFinalValue('fouAtk', Math.min(input.fouAtk + 1000, 3000))}
                >
                  +1,000
                </button>
                <button
                  type="button"
                  disabled={input.fouAtk === 0}
                  onClick={() => changeFinalValue('fouAtk', 0)}
                >
                  リセット
                </button>
              </span>
              <small>合計ATKへ加算・最大+3,000</small>
            </label>
          ) : null}
          <label>
            宝具Lv
            <select
              value={input.npLevel}
              onChange={(event) => {
                const npLevel = Number(event.target.value);
                if (scenario.mode === 'manual') changeManualInput({ npLevel });
                else
                  void onScenarioChange({
                    ...scenario,
                    attacker: { ...scenario.attacker, npLevel },
                  });
              }}
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  NP{value}
                </option>
              ))}
            </select>
          </label>
          <label>
            OC
            <select
              value={input.overcharge}
              onChange={(event) => {
                const overcharge = Number(event.target.value);
                if (scenario.mode === 'manual') changeManualInput({ overcharge });
                else void onScenarioChange({ ...scenario, overcharge });
              }}
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <div className="picker-field form-grid-wide">
            <span>概念礼装</span>
            {selectedCraftEssence && craftEssenceSelection ? (
              <div className="selected-equipment">
                <button
                  ref={craftEssenceTriggerRef}
                  className="entity-summary compact entity-picker-trigger"
                  onClick={() => setCraftEssenceDialogOpen(true)}
                  aria-label="概念礼装を変更"
                >
                  <MasterImage
                    src={selectedCraftEssence.imageKey}
                    alt=""
                    fallback={selectedCraftEssence.name}
                  />
                  <span className="list-row-main">
                    <strong>{selectedCraftEssence.name}</strong>
                    <small>
                      {selectedCraftEssenceCopy ? '登録コピー' : '全DBの仮想設定'}
                      ・Lv{craftEssenceSelection.level}・ATK {input.craftEssenceAtk}
                    </small>
                  </span>
                  <span className="picker-action">変更</span>
                </button>
                <div className="equipment-controls">
                  <label>
                    礼装Lv
                    <input
                      type="number"
                      min="1"
                      max={
                        selectedCraftEssence.maxLevelByLimitBreak[craftEssenceSelection.limitBreak]
                      }
                      value={craftEssenceSelection.level}
                      onChange={(event) =>
                        changeCraftEssenceState({ level: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    限界突破
                    <select
                      value={craftEssenceSelection.limitBreak}
                      onChange={(event) =>
                        changeCraftEssenceState({ limitBreak: Number(event.target.value) })
                      }
                    >
                      {[0, 1, 2, 3, 4].map((value) => (
                        <option key={value} value={value}>
                          {value === 4 ? '最大解放' : `${value}回`}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedCraftEssenceCopy ? (
                    <button
                      type="button"
                      onClick={() =>
                        selectCraftEssence(
                          selectedCraftEssence,
                          'registered',
                          selectedCraftEssenceCopy,
                        )
                      }
                    >
                      保存値へ戻す
                    </button>
                  ) : null}
                  <button type="button" onClick={clearCraftEssence}>
                    外す
                  </button>
                </div>
              </div>
            ) : (
              <button
                ref={craftEssenceTriggerRef}
                className="empty-picker"
                onClick={() => setCraftEssenceDialogOpen(true)}
              >
                礼装なし・選択する
              </button>
            )}
          </div>
          <label>
            クラス相性の状況
            <select
              value={String(input.classAffinity)}
              onChange={(event) =>
                changeAffinitySituation('classAffinity', Number(event.target.value))
              }
            >
              <option value="2">有利（2.0倍）</option>
              <option value="1.5">攻撃有利（1.5倍）</option>
              <option value="1">等倍（1.0倍）</option>
              <option value="0.5">不利（0.5倍）</option>
              {![0.5, 1, 1.5, 2].includes(input.classAffinity) ? (
                <option value={String(input.classAffinity)}>
                  直接入力（{input.classAffinity}倍）
                </option>
              ) : null}
            </select>
          </label>
          <label>
            属性相性の状況
            <select
              value={String(input.attributeAffinity)}
              onChange={(event) =>
                changeAffinitySituation('attributeAffinity', Number(event.target.value))
              }
            >
              <option value="1.1">有利（1.1倍）</option>
              <option value="1">等倍（1.0倍）</option>
              <option value="0.9">不利（0.9倍）</option>
              {![0.9, 1, 1.1].includes(input.attributeAffinity) ? (
                <option value={String(input.attributeAffinity)}>
                  直接入力（{input.attributeAffinity}倍）
                </option>
              ) : null}
            </select>
          </label>
          {mode === 'direct' && (
            <>
              <div className="direct-input-summary form-grid-wide">
                <span>
                  <small>合計ATK</small>
                  <strong>
                    {numberFormatter.format(
                      input.attackerAtk + input.fouAtk + input.craftEssenceAtk,
                    )}
                  </strong>
                </span>
                <button type="button" onClick={resetAutomaticValues}>
                  ATK・相性を既定値へ戻す
                </button>
              </div>
              {(
                [
                  ['基礎ATK', 'attackerAtk'],
                  ['ATKフォウ', 'fouAtk'],
                  ['礼装ATK', 'craftEssenceAtk'],
                ] as const
              ).map(([label, key]) => (
                <label key={key}>
                  {label}
                  <input
                    type="number"
                    min="0"
                    max={key === 'fouAtk' ? 3000 : undefined}
                    step="1"
                    value={input[key]}
                    onChange={(event) => changeFinalValue(key, Number(event.target.value))}
                  />
                  <small>{manualOverrides.has(key) ? '直接入力' : '自動'}</small>
                </label>
              ))}
              {(
                [
                  ['クラス攻撃補正', 'classAttackRate'],
                  ['クラス相性', 'classAffinity'],
                  ['属性相性', 'attributeAffinity'],
                ] as const
              ).map(([label, key]) => (
                <label key={key}>
                  {label}
                  <input
                    type="number"
                    min="0"
                    max="5"
                    step="0.05"
                    value={input[key]}
                    onChange={(event) => changeFinalValue(key, Number(event.target.value))}
                  />
                  <small>{manualOverrides.has(key) ? '直接入力' : '対象から自動計算'}</small>
                </label>
              ))}
              {(
                [
                  ['攻撃バフ', 'attackBuff'],
                  ['敵防御力', 'defenseBuff'],
                  ['カード性能', 'cardBuff'],
                  ['カード耐性', 'cardResistance'],
                  ['宝具威力', 'npDamageBuff'],
                  ['宝具耐性', 'npResistance'],
                  ['特攻状態', 'powerMod'],
                  ['イベント特攻', 'eventDamageBuff'],
                  ['特殊威力', 'specialDamageBuff'],
                  ['特殊耐性', 'specialResistance'],
                ] as const
              ).map(([label, key]) => (
                <label key={key}>
                  {label}（%）
                  <input
                    type="number"
                    step="1"
                    value={input[key] * 100}
                    onChange={(event) =>
                      changeManualInput({ [key]: Number(event.target.value) / 100 })
                    }
                  />
                </label>
              ))}
              <label>
                NP{input.npLevel} 特攻宝具倍率（%）
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={(input.npSpecialMultipliers[input.npLevel - 1] ?? 1) * 100}
                  onChange={(event) => {
                    const multipliers = [
                      ...input.npSpecialMultipliers,
                    ] as DamageResolutionInput['npSpecialMultipliers'];
                    multipliers[input.npLevel - 1] = Number(event.target.value) / 100;
                    changeManualInput({ npSpecialMultipliers: multipliers });
                  }}
                />
              </label>
              <label>
                固定ダメージ加算
                <input
                  type="number"
                  step="1"
                  value={input.flatDamage}
                  onChange={(event) =>
                    changeManualInput({ flatDamage: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                固定ダメージ軽減
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={input.damageCut}
                  onChange={(event) => changeManualInput({ damageCut: Number(event.target.value) })}
                />
              </label>
            </>
          )}
        </div>
        <AttackerSkills
          attacker={attacker}
          attackerSource={attackerSource}
          selectedSkills={resolvedScenario?.attackerSkills ?? []}
          savedBuild={builds[input.attackerId]}
          hidden={mode === 'direct'}
          onChange={changeAttackerSkill}
        />
        {mode === 'quick' && resolvedScenario && npConditionTraits.length > 0 ? (
          <fieldset aria-label="適用条件" className="modifier-group">
            <div className="calculator-support-effect-legend">
              <span>
                <strong>対象特性</strong>
                <small>特攻宝具の成立条件</small>
              </span>
            </div>
            <div className="modifier-list">
              {npConditionTraits.map((trait) => {
                const active = resolvedScenario.target.traits.includes(trait.id);
                return (
                  <button
                    type="button"
                    key={trait.id}
                    aria-pressed={active}
                    onClick={() =>
                      void onScenarioChange({
                        ...resolvedScenario,
                        target: {
                          ...resolvedScenario.target,
                          traits: active
                            ? resolvedScenario.target.traits.filter(
                                (candidate) => candidate !== trait.id,
                              )
                            : [...resolvedScenario.target.traits, trait.id],
                        },
                      })
                    }
                  >
                    {traitLabel(trait.id)}・特攻宝具 {trait.multiplier.toFixed(2)}倍
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : null}
        {mode === 'quick' ? (
          <AppliedEffects
            title="自身の適用内容"
            effects={ownEffects}
            servants={servants}
            craftEssence={selectedCraftEssence}
            onToggle={changeEffect}
          />
        ) : null}
        <section className="support-composition" aria-label="支援・バフ" hidden={mode === 'direct'}>
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">SUPPORT</p>
              <h3>支援・バフ</h3>
            </div>
            <small>この計算だけの支援構成</small>
          </div>
          <div className="calculator-support-actions">
            <button type="button" onClick={() => setSupportServantDialogOpen(true)}>
              ＋ 支援役を追加
            </button>
            <button type="button" onClick={() => setSupportDialogOpen(true)}>
              保存セットを呼び出す
            </button>
            {supportSources.length ? (
              <button type="button" onClick={() => void onSupportSave('new')}>
                別名で保存
              </button>
            ) : null}
            {selectedSupport && supportModified ? (
              <button type="button" onClick={() => void onSupportSave('source')}>
                保存元を更新
              </button>
            ) : null}
          </div>
          <div className="calculator-support-summary" aria-label="現在の支援構成">
            <span className="calculator-support-faces" aria-hidden="true">
              {supportSources.length ? (
                supportSources.slice(0, 3).map((supportSource, index) => {
                  const source = servants.find((servant) => servant.id === supportSource.servantId);
                  return (
                    <MasterImage
                      key={`${supportSource.sourceInstanceId}:${String(index)}`}
                      src={source?.imageKey ?? null}
                      alt=""
                      fallback={source?.name ?? '?'}
                    />
                  );
                })
              ) : (
                <span className="support-empty-icon">+</span>
              )}
            </span>
            <span className="calculator-support-summary-copy">
              <small>{selectedSupport ? '保存セットから開始' : '現在の支援構成'}</small>
              <strong>
                {selectedSupport
                  ? `${selectedSupport.name}${supportModified ? '・変更あり' : ''}`
                  : supportSources.length
                    ? '未保存の構成'
                    : '支援なし'}
              </strong>
              <span>
                {supportSources.length
                  ? `${String(supportSources.length)}騎・選択中${String(selectedSupportEffectCount)}効果`
                  : '支援役を直接追加するか、保存セットを呼び出します'}
              </span>
            </span>
          </div>
          {supportComposition ? (
            <>
              <div className="calculator-support-source-stack">
                {supportSources.map((supportSource) => {
                  const servant = servants.find(
                    (candidate) => candidate.id === supportSource.servantId,
                  );
                  const duplicates = supportSources.filter(
                    (candidate) => candidate.servantId === supportSource.servantId,
                  );
                  const suffix =
                    duplicates.length > 1
                      ? ` ${String(duplicates.findIndex((candidate) => candidate.sourceInstanceId === supportSource.sourceInstanceId) + 1)}`
                      : '';
                  return (
                    <SupportSourceCard
                      key={supportSource.sourceInstanceId}
                      source={supportSource}
                      servant={servant}
                      displayName={`${servant?.name ?? supportSource.servantId}${suffix}`}
                      onRemove={() =>
                        removeCalculationSupportSource(supportSource.sourceInstanceId)
                      }
                      onSkillLevelChange={(skillId, skillLevel) =>
                        changeSupportSkillLevel(supportSource.sourceInstanceId, skillId, skillLevel)
                      }
                    />
                  );
                })}
              </div>
              <AppliedEffects
                title="支援の適用内容"
                effects={supportEffects}
                servants={servants}
                craftEssence={selectedCraftEssence}
                onToggle={changeEffect}
                action={
                  <button
                    type="button"
                    className="quiet"
                    onClick={() => void onSupportSelect(undefined)}
                  >
                    構成を空にする
                  </button>
                }
              />
              {effectWarnings
                .filter((warning) => warning.startsWith('support_'))
                .map((warning) => (
                  <p className="notice" key={warning}>
                    未解決: {warning}
                  </p>
                ))}
            </>
          ) : null}
        </section>
        <EffectiveInputDetails
          input={resolvedInput}
          mode={mode}
          damageEffectStacks={damageEffectStacks}
        />
      </section>
      <CalculationResult
        input={resolvedInput}
        result={result}
        scenario={scenario}
        attackerName={attacker?.name ?? input.attackerId}
        attackerImage={attacker?.imageKey ?? null}
        targetSummary={targetSummary}
        craftEssenceSummary={craftEssenceSummary}
        supportSummary={supportSummary}
        enabledAttackerSkillCount={enabledAttackerSkillCount}
        onFinalize={onFinalize}
      />
      {attackerDialogOpen && (
        <AttackerPicker
          servants={servants}
          builds={builds}
          initialSource={attackerSource}
          onSelect={selectAttacker}
          onClose={closeAttackerDialog}
        />
      )}
      {craftEssenceDialogOpen && (
        <CraftEssencePicker
          copies={craftEssenceCopies}
          masters={craftEssences}
          initialSource={
            selectedCraftEssenceCopy
              ? 'registered'
              : craftEssenceCopies.length
                ? 'registered'
                : 'master'
          }
          onSelect={selectCraftEssence}
          onClose={closeCraftEssenceDialog}
        />
      )}
      {historyDialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="calculation-history-title"
          className="dialog"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setHistoryDialogOpen(false);
          }}
        >
          <div className="dialog-panel calculation-history-dialog">
            <div className="section-heading">
              <div>
                <p className="eyebrow">HISTORY</p>
                <h2 id="calculation-history-title">計算履歴</h2>
              </div>
              <button type="button" onClick={() => setHistoryDialogOpen(false)}>
                閉じる
              </button>
            </div>
            {history.length ? (
              <ul className="calculation-history-list">
                {[...history].reverse().map((entry) => {
                  const attackerId =
                    entry.scenario.mode === 'manual'
                      ? entry.scenario.manual.attackerId
                      : entry.scenario.attacker.servantId;
                  const servant = servants.find((candidate) => candidate.id === attackerId);
                  const npLevel =
                    entry.scenario.mode === 'manual'
                      ? entry.scenario.manual.npLevel
                      : entry.scenario.attacker.npLevel;
                  const average =
                    entry.result.status === 'calculated'
                      ? entry.result.rows[npLevel - 1]?.average
                      : undefined;
                  return (
                    <li key={entry.historyId}>
                      <button
                        type="button"
                        onClick={() => {
                          void onHistorySelect(entry);
                          setHistoryDialogOpen(false);
                        }}
                      >
                        <span>
                          <strong>{servant?.name ?? attackerId}</strong>
                          <small>
                            NP{npLevel}・{new Date(entry.lastUsedAt).toLocaleString('ja-JP')}
                          </small>
                        </span>
                        <span>
                          {average === undefined ? '計算対象外' : numberFormatter.format(average)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="empty">確定済みの計算履歴はありません。</p>
            )}
          </div>
        </div>
      )}
      {supportDialogOpen && (
        <SupportTemplatePicker
          templates={supportTemplates}
          servants={servants}
          onSelect={(template) => {
            void onSupportSelect(template);
            setSupportDialogOpen(false);
          }}
          onClose={() => setSupportDialogOpen(false)}
        />
      )}
      {supportServantDialogOpen && (
        <SupportServantPicker
          servants={servants}
          builds={builds}
          onSelect={addSupportServant}
          onClose={() => setSupportServantDialogOpen(false)}
        />
      )}
    </div>
  );
}
