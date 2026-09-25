import { EffectInlineInput } from './EffectInlineInput';
import { useEffect, useRef, useState } from 'react';
import type { AppliedPreparationAction } from '@fgo-lab/calculation-application';
import { ocBoostUseSummary, ocUseSummary } from '../../ui/ocPresentation';
import {
  deriveCraftEssenceAtk,
  deriveNpMultipliers,
  findNoblePhantasmVariant,
  getPrimaryNpDamage,
  getPrimaryNpPresentation,
  naturalServantLevel,
  type CraftEssenceMaster,
  type MasterDataSnapshot,
  type ServantMaster,
} from '@fgo-lab/master-data';
import {
  attributeRelationFromMultiplier,
  availableTargetClassRelations,
  classRelationFromMultiplier,
  classAttackRate as resolveClassAttackRate,
} from '@fgo-lab/calc-core';
import type {
  EffectControlViewModel,
  EffectInputViewModel,
  EffectProjection,
  ActivationRequirementOwner,
  PreparationChoiceOption,
} from '@fgo-lab/calculation-application';
import {
  applyCanonicalInputCommand,
  applyTargetContextCommand,
  appendCalculationSupportSource,
  applyEffectControlPresentationDecision,
  excludeDefaultAttackerSkillContributions,
  removeCalculationSupportSource as removeSupportSourceFromScenario,
  resetTargetClassContextForAttacker,
  setInitialActorForm,
  initialOcOptions,
  changeResolvedNpLevel,
  changeResolvedInitialOc,
  setInitialHp,
  setEnemyDefenseBuff,
  setAttackerSkillLevel,
  setCalculationSupportSkillLevel,
  setCalculationSupportSkillEnabled,
  createDefaultTargetContext,
  getAttackReachableInitialActorForms,
  defaultCalculatorPreNoblePhantasmCandidate,
  preparationChoiceOptions,
  setPreparationSkillChoice,
} from '@fgo-lab/calculation-application';
import type {
  AttackerSkillUse,
  DamageResolutionInput,
  CalculationHistoryEntry,
  CurrentCalculationHistoryEntry,
  CalculationResult as CalculationResultValue,
  CalculationScenario,
  CraftEssenceCopy,
  PortableCalculationRequest,
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
import { CalculationResult } from './CalculationResult';
import { createCalculatorViewModel } from './calculatorViewModel';
import { AttackerSkills } from './AttackerSkills';
import { AppliedEffects } from './AppliedEffects';
import { EffectiveInputDetails } from './EffectiveInputDetails';
import { QuickValuePresets } from './QuickValuePresets';
import { SupportSourceCard } from '../support/SupportSourceCard';
import './calculator.css';
import './calculator-form.css';

export function Calculator({
  master,
  resolvedInput,
  scenarioInput,
  resolvedEffects,
  appliedPreparationActions,
  effectControls,
  effectWarnings,
  effectInputs,
  activationRequirements,
  result,
  request,
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
  onRegenerateHistory,
  onResetPortableRequest,
  resetPending,
  resetError,
}: {
  master: MasterDataSnapshot;
  resolvedInput: DamageResolutionInput;
  scenarioInput: DamageResolutionInput;
  resolvedEffects: readonly EffectProjection[];
  appliedPreparationActions: readonly AppliedPreparationAction[];
  effectControls: readonly EffectControlViewModel[];
  effectWarnings: readonly string[];
  effectInputs: readonly EffectInputViewModel[];
  activationRequirements: readonly ActivationRequirementOwner[];
  result: CalculationResultValue;
  request: PortableCalculationRequest;
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
  onHistorySelect: (entry: CurrentCalculationHistoryEntry) => Promise<void>;
  onRegenerateHistory: (
    entry: Extract<CalculationHistoryEntry, { disposition: 'historicalOnly' }>,
  ) => Promise<void>;
  onResetPortableRequest: () => Promise<void>;
  resetPending?: boolean | undefined;
  resetError?: string | undefined;
}) {
  const input = resolvedInput;
  const initialHpPermille =
    scenario.mode === 'resolved' ? scenario.attackerHpPermille : input.attackerHpPermille;
  const effectiveInitialOvercharge =
    scenario.mode === 'resolved' && request.executionIntent.kind !== 'manual'
      ? request.executionIntent.initialNpGauge / 10_000
      : scenario.mode === 'resolved'
        ? scenario.initialOvercharge
        : input.overcharge;
  const executedHp = appliedPreparationActions.at(-1)?.hpAfter?.actors.attacker;
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
  const defenseValue = scenario.mode === 'resolved' ? scenario.enemyDefenseBuff : null;
  const [enemyDefenseEdit, setEnemyDefenseEdit] = useState({
    base: defenseValue,
    text: defenseValue === null ? '' : String(defenseValue * 100),
  });
  const enemyDefenseText =
    enemyDefenseEdit.base === defenseValue
      ? enemyDefenseEdit.text
      : defenseValue === null
        ? ''
        : String(defenseValue * 100);
  const enemyDefenseValue = enemyDefenseText.trim() === '' ? null : Number(enemyDefenseText);
  const enemyDefenseValid =
    enemyDefenseValue !== null &&
    Number.isFinite(enemyDefenseValue) &&
    enemyDefenseValue >= -500 &&
    enemyDefenseValue <= 500;
  const attackerTriggerRef = useRef<HTMLButtonElement>(null);
  const craftEssenceTriggerRef = useRef<HTMLButtonElement>(null);
  const manualOverrides = new Set(Object.keys(resolvedScenario?.explicitOverrides ?? {}));
  const attackerSource = resolvedScenario?.attacker.source ?? 'master';
  const craftEssenceSelection = resolvedScenario?.craftEssence ?? null;
  const attacker = servants.find((candidate) => candidate.id === input.attackerId);
  const availableClassRelations = new Set(
    availableTargetClassRelations(attacker?.classId ?? 'unknown'),
  );
  const naturalAttackerLevel = attacker
    ? naturalServantLevel(attacker.rarity)
    : input.attackerLevel;
  const resetAttackerLevel =
    attackerSource === 'owned'
      ? (builds[input.attackerId]?.level ?? naturalAttackerLevel)
      : naturalAttackerLevel;
  const attackerNp = attacker ? getPrimaryNpPresentation(attacker) : null;
  const attackerDamage = attacker ? getPrimaryNpDamage(attacker) : null;
  const attackerBattlePointMaximumPhase = attacker?.battlePointDomains?.length
    ? Math.min(
        ...attacker.battlePointDomains.map(
          (domain) => domain.phases.at(-1)?.phase ?? Number.POSITIVE_INFINITY,
        ),
      )
    : attackerDamage?.kind === 'battlePointPhase'
      ? attackerDamage.maximumBattlePointPhase
      : null;
  const initialActorForms = attacker
    ? getAttackReachableInitialActorForms(
        attacker,
        master.npResourceSemantics,
        input.npLevel as 1 | 2 | 3 | 4 | 5,
      )
    : [];
  const resolvedAttackerSkillUses = appliedPreparationActions.flatMap((action) =>
    action.command.kind === 'useSkillSlot'
      ? [
          {
            slot: action.command.slot,
            skillLevel: action.command.skillLevel,
            skillId: action.sourceId,
            actorFormId: action.actorFormId,
            selectedEffects: action.selectedEffects,
            transitionId: action.transition?.id ?? null,
          },
        ]
      : [],
  );
  const preparationChoices =
    attacker && resolvedScenario
      ? preparationChoiceOptions(appliedPreparationActions, attacker)
      : [];
  const selectedCraftEssence = craftEssences.find(
    (candidate) => candidate.id === input.craftEssenceId,
  );
  const selectedCraftEssenceCopy = craftEssenceSelection
    ? craftEssenceCopies.find(
        (copy) => copy.craftEssenceId === craftEssenceSelection.craftEssenceId,
      )
    : undefined;
  const supportComposition = resolvedScenario?.support?.composition;
  const {
    supportEffects,
    requiresAttackerHp,
    supportSources,
    excludedSupportEffectCount,
    supportModified,
    damageEffectStacks,
    enabledAttackerSkillCount,
    targetSummary,
    craftEssenceSummary,
    supportSummary,
  } = createCalculatorViewModel({
    input,
    effects: resolvedEffects,
    servants,
    attackerDamage,
    selectedCraftEssence,
    craftEssenceSelection,
    selectedSupport,
    supportComposition,
  });
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
      changeManualInput({ [key]: value });
      return;
    }
    void onScenarioChange({
      ...scenario,
      targetContext: applyTargetContextCommand(
        scenario.targetContext,
        key === 'classAffinity'
          ? { kind: 'setClassRelation', relation: classRelationFromMultiplier(value) }
          : { kind: 'setAttributeRelation', relation: attributeRelationFromMultiplier(value) },
      ),
    });
  }
  function changeDamageContext(
    key: 'attackerHpPermille' | 'battlePointPhase',
    value: number | null,
  ) {
    if (scenario.mode === 'manual') {
      changeManualInput({ [key]: value });
      return;
    }
    if (key === 'attackerHpPermille') {
      void onScenarioChange(setInitialHp(scenario, value));
      return;
    }
    void onScenarioChange({
      ...scenario,
      battleState: { ...scenario.battleState, battlePointPhase: value },
    });
  }
  function changeInitialBattlePoint(domainId: string, value: number | null) {
    if (scenario.mode !== 'resolved') return;
    const points =
      value === null
        ? Object.fromEntries(
            Object.entries(scenario.initialBattlePointPoints ?? {}).filter(
              ([id]) => id !== domainId,
            ),
          )
        : { ...scenario.initialBattlePointPoints, [domainId]: value };
    void onScenarioChange({
      ...scenario,
      initialBattlePointPoints: points,
      battleState: {
        ...scenario.battleState,
        battlePointPhase: Object.keys(points).length === 0 ? 0 : null,
      },
    });
  }
  function changeCanonicalInput(key: string, value: number | null) {
    if (scenario.mode !== 'resolved') return;
    void onScenarioChange(
      applyCanonicalInputCommand(scenario, {
        kind: 'setCanonicalIntegerInput',
        key,
        value,
      }),
    );
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
    if (!attacker) return;
    const defaultPlan = defaultCalculatorPreNoblePhantasmCandidate(
      attacker,
      master.npResourceSemantics,
      input.npLevel as 1 | 2 | 3 | 4 | 5,
    );
    void onScenarioChange(
      excludeDefaultAttackerSkillContributions(
        {
          mode: 'resolved',
          attacker: {
            servantId: input.attackerId,
            initialActorFormId: defaultPlan.terminalState.initialFormId,
            source,
            level: input.attackerLevel,
            npLevel: input.npLevel,
            fouAtk: input.fouAtk,
          },
          initialOvercharge: 1,
          targetContext: applyTargetContextCommand(createDefaultTargetContext(attacker.classId), {
            kind: 'setAttributeRelation',
            relation: attributeRelationFromMultiplier(input.attributeAffinity),
          }),
          attackerHpPermille: input.attackerHpPermille,
          battleState: { battlePointPhase: input.battlePointPhase },
          enemyDefenseBuff: input.defenseBuff,
          canonicalInputValues: {},
          craftEssence: null,
          preNoblePhantasmPlan: defaultPlan.commands.map((command) =>
            command.kind === 'useSkillSlot'
              ? {
                  ...command,
                  skillLevel: source === 'owned' ? (saved?.skills[String(command.slot)] ?? 1) : 10,
                }
              : command,
          ),
          mysticCode: null,
          support: null,
          effectDecisions: [],
          activationFacts: [],
          worldFactAssertions: [],
          explicitOverrides: {
            attackerAtk: input.attackerAtk,
            fouAtk: input.fouAtk,
            craftEssenceAtk: input.craftEssenceAtk,
            classAttackRate: input.classAttackRate,
          },
        },
        master,
      ),
    );
  }
  function selectAttacker(candidate: ServantMaster, source: 'owned' | 'master') {
    const saved = source === 'owned' ? builds[candidate.id] : undefined;
    const candidateNpLevel = Math.max(1, saved?.npLevel ?? 1) as 1 | 2 | 3 | 4 | 5;
    const defaultPlan = defaultCalculatorPreNoblePhantasmCandidate(
      candidate,
      master.npResourceSemantics,
      candidateNpLevel,
    );
    const noblePhantasm = defaultPlan.terminalState.selectedNoblePhantasmVariant
      ? findNoblePhantasmVariant(candidate, defaultPlan.terminalState.selectedNoblePhantasmVariant)
      : undefined;
    if (noblePhantasm?.kind !== 'attack') return;
    const damage = noblePhantasm.damage[0];
    if (!damage) return;
    const level = saved?.level ?? naturalServantLevel(candidate.rarity);
    if (scenario.mode === 'manual') {
      changeManualInput({
        ...input,
        attackerId: candidate.id,
        attackerLevel: level,
        attackerAtk:
          candidate.atkByLevel[String(level)] ?? candidate.atkByLevel['90'] ?? input.attackerAtk,
        fouAtk: saved?.fouAtk ?? 1000,
        npLevel: Math.max(1, saved?.npLevel ?? 1),
        npMultipliers: deriveNpMultipliers(damage, input.overcharge),
        npSpecialMultipliers: [1, 1, 1, 1, 1],
        damageFunction: { status: 'resolved', kind: damage.kind, ignoreDefense: false },
        cardType: noblePhantasm.card,
        classAttackRate: resolveClassAttackRate(candidate.classId),
        attackerHpPermille: null,
        battlePointPhase: null,
      });
    } else {
      void onScenarioChange(
        excludeDefaultAttackerSkillContributions(
          resetTargetClassContextForAttacker(
            {
              ...changeResolvedNpLevel(scenario, master.npResourceSemantics, candidateNpLevel),
              attacker: {
                servantId: candidate.id,
                initialActorFormId: defaultPlan.terminalState.initialFormId,
                source,
                level,
                npLevel: Math.max(1, saved?.npLevel ?? 1),
                fouAtk: saved?.fouAtk ?? 1000,
              },
              preNoblePhantasmPlan: defaultPlan.commands.map((command) =>
                command.kind === 'useSkillSlot'
                  ? {
                      ...command,
                      skillLevel:
                        source === 'owned' ? (saved?.skills[String(command.slot)] ?? 1) : 10,
                    }
                  : command,
              ),
              effectDecisions: [],
              worldFactAssertions: [],
              attackerHpPermille: 1000,
              battleState: { battlePointPhase: candidate.battlePointDomains?.length ? 0 : null },
              initialBattlePointPoints: {},
              canonicalInputValues: {},
              explicitOverrides: {},
            },
            candidate.classId,
          ),
          master,
        ),
      );
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
  function changeAttackerSkill(
    slot: 1 | 2 | 3,
    patch: Partial<Pick<AttackerSkillUse, 'skillLevel'>>,
  ) {
    if (!resolvedScenario) return;
    const next =
      patch.skillLevel === undefined
        ? resolvedScenario
        : setAttackerSkillLevel(resolvedScenario, slot, patch.skillLevel);
    void onScenarioChange(next);
  }
  function changeInitialActorForm(actorId: string, limitCount: number) {
    if (!resolvedScenario || !attacker) return;
    void onScenarioChange(
      excludeDefaultAttackerSkillContributions(
        setInitialActorForm(
          resolvedScenario,
          attacker,
          master.npResourceSemantics,
          { actorId, limitCount },
          resolvedEffects,
        ),
        master,
      ),
    );
  }
  function changeEffect(control: EffectControlViewModel, active: boolean) {
    if (!resolvedScenario) return;
    void onScenarioChange(
      applyEffectControlPresentationDecision(
        resolvedScenario,
        control,
        active,
        activationRequirements,
        resolvedEffects,
        effectInputs,
      ),
    );
  }
  function changePreparationChoice(option: PreparationChoiceOption) {
    if (!resolvedScenario || !attacker) return;
    void onScenarioChange(
      excludeDefaultAttackerSkillContributions(
        setPreparationSkillChoice(resolvedScenario, option, resolvedEffects),
        master,
      ),
    );
  }
  function addSupportServant(servant: ServantMaster) {
    const sourceInstanceId = crypto.randomUUID();
    const savedLevels = builds[servant.id]?.skills ?? {};
    if (!resolvedScenario) return;
    void onScenarioChange(
      appendCalculationSupportSource(resolvedScenario, {
        sourceInstanceId,
        servantId: servant.id,
        skills: servant.skills.map((skill) => ({
          skillId: skill.id,
          skillLevel: savedLevels[String(skill.slot)] ?? 10,
          enabled: false,
        })),
      }),
    );
    setSupportServantDialogOpen(false);
  }
  function removeCalculationSupportSource(sourceInstanceId: string) {
    if (!resolvedScenario?.support) return;
    void onScenarioChange(
      removeSupportSourceFromScenario(resolvedScenario, sourceInstanceId, supportEffects),
    );
  }
  function changeSupportSkillLevel(sourceInstanceId: string, skillId: string, skillLevel: number) {
    if (!resolvedScenario?.support) return;
    void onScenarioChange(
      setCalculationSupportSkillLevel(resolvedScenario, sourceInstanceId, skillId, skillLevel),
    );
  }
  function changeSupportSkillEnabled(sourceInstanceId: string, skillId: string, enabled: boolean) {
    if (!resolvedScenario?.support) return;
    void onScenarioChange(
      setCalculationSupportSkillEnabled(resolvedScenario, sourceInstanceId, skillId, enabled),
    );
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
          {mode === 'quick' && initialActorForms.length > 1 ? (
            <label>
              初期形態
              <select
                aria-label="初期形態"
                value={JSON.stringify(resolvedScenario?.attacker.initialActorFormId)}
                onChange={(event) => {
                  const selected = initialActorForms[event.target.selectedIndex];
                  if (selected) changeInitialActorForm(selected.id.actorId, selected.id.limitCount);
                }}
              >
                {initialActorForms.map((form) => (
                  <option
                    key={`${form.id.actorId}:${String(form.id.limitCount)}`}
                    value={JSON.stringify(form.id)}
                  >
                    {form.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
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
              <QuickValuePresets
                label="サーヴァントLvのクイック選択"
                value={input.attackerLevel}
                controls={[
                  { kind: 'preset', label: '100', value: 100 },
                  { kind: 'preset', label: '120', value: 120 },
                ]}
                resetValue={resetAttackerLevel}
                onChange={changeAttackerLevel}
                className="level-presets"
              />
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
              <QuickValuePresets
                label="ATKフォウのクイック選択"
                value={input.fouAtk}
                controls={[
                  {
                    kind: 'action',
                    label: '+1,000',
                    value: Math.min(input.fouAtk + 1_000, 3_000),
                    disabled: input.fouAtk >= 3_000,
                  },
                ]}
                resetValue={0}
                onChange={(value) => changeFinalValue('fouAtk', value)}
              />
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
                  void onScenarioChange(
                    changeResolvedNpLevel(scenario, master.npResourceSemantics, npLevel),
                  );
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
            {scenario.mode === 'manual' ? '最終OC' : '初期OC'}
            <select
              value={effectiveInitialOvercharge}
              onChange={(event) => {
                const overcharge = Number(event.target.value);
                if (scenario.mode === 'manual') changeManualInput({ overcharge });
                else
                  void onScenarioChange(
                    changeResolvedInitialOc(scenario, master.npResourceSemantics, overcharge),
                  );
              }}
            >
              {(scenario.mode === 'manual'
                ? [1, 2, 3, 4, 5]
                : initialOcOptions(master.npResourceSemantics, scenario.attacker.npLevel)
              ).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          {scenario.mode === 'resolved' && (
            <div className="form-grid-wide">
              {appliedPreparationActions
                .flatMap((action) => (action.ocUse ? [action.ocUse] : []))
                .map((receipt, index, receipts) => (
                  <div key={receipt.actionId}>
                    <p>
                      {index === 0 ? `開始NP ${effectiveInitialOvercharge * 100}% ／ ` : ''}
                      {receipts.length > 1 ? `宝具${index + 1}：` : ''}
                      {ocUseSummary(receipt)}
                    </p>
                    {receipt.boostUses.length > 0 && (
                      <ul>
                        {receipt.boostUses.map((use) => (
                          <li key={use.instanceId}>{ocBoostUseSummary(use)}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
            </div>
          )}
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
              <option
                value="2"
                disabled={mode === 'quick' && !availableClassRelations.has('advantage2')}
              >
                有利（2.0倍）
              </option>
              <option
                value="1.5"
                disabled={mode === 'quick' && !availableClassRelations.has('advantage15')}
              >
                攻撃有利（1.5倍）
              </option>
              <option
                value="1"
                disabled={mode === 'quick' && !availableClassRelations.has('neutral')}
              >
                等倍（1.0倍）
              </option>
              <option
                value="0.5"
                disabled={mode === 'quick' && !availableClassRelations.has('disadvantage')}
              >
                不利（0.5倍）
              </option>
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
          {requiresAttackerHp || scenario.mode === 'resolved' ? (
            <label className="damage-context-input form-grid-wide">
              準備開始時のHP（%）
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                required
                value={initialHpPermille === null ? '' : initialHpPermille / 10}
                onChange={(event) =>
                  changeDamageContext(
                    'attackerHpPermille',
                    event.target.value === ''
                      ? null
                      : Math.round(Math.min(100, Math.max(0, Number(event.target.value))) * 10),
                  )
                }
              />
              <small>
                {executedHp?.kind === 'absolute'
                  ? `実行後HP: ${executedHp.current.toLocaleString()} / ${executedHp.maximum.toLocaleString()}（${Math.round((executedHp.current / executedHp.maximum) * 100)}%）`
                  : 'スキル・宝具による回復や減少を適用する前のHPです'}
              </small>
              <button type="button" onClick={() => changeDamageContext('attackerHpPermille', 1000)}>
                初期HPを100%へ戻す
              </button>
            </label>
          ) : null}
          {scenario.mode === 'resolved' ? (
            <label className="damage-context-input form-grid-wide">
              敵防御力（%）
              <input
                type="text"
                inputMode="decimal"
                required
                aria-invalid={!enemyDefenseValid}
                value={enemyDefenseText}
                onChange={(event) => {
                  const text = event.target.value;
                  setEnemyDefenseEdit({ base: defenseValue, text });
                  const numeric = text.trim() === '' ? null : Number(text);
                  if (
                    numeric !== null &&
                    Number.isFinite(numeric) &&
                    numeric >= -500 &&
                    numeric <= 500
                  )
                    void onScenarioChange(setEnemyDefenseBuff(scenario, numeric / 100));
                }}
              />
              <small>対象に設定された防御力です。効果のオン・オフとは独立します</small>
            </label>
          ) : null}
          {attackerBattlePointMaximumPhase !== null &&
          (scenario.mode === 'manual' ||
            (scenario.battleState.battlePointPhase !== null &&
              scenario.battleState.battlePointPhase > 0)) ? (
            <label className="damage-context-input form-grid-wide">
              バトルポイント段階
              <input
                type="number"
                min="0"
                max={attackerBattlePointMaximumPhase}
                step="1"
                required
                value={input.battlePointPhase ?? ''}
                onChange={(event) =>
                  changeDamageContext(
                    'battlePointPhase',
                    event.target.value === ''
                      ? null
                      : Math.round(
                          Math.min(
                            attackerBattlePointMaximumPhase,
                            Math.max(0, Number(event.target.value)),
                          ),
                        ),
                  )
                }
              />
              <small>0〜{attackerBattlePointMaximumPhase}の開始段階を入力します</small>
            </label>
          ) : null}
          {scenario.mode === 'resolved' &&
            attacker?.battlePointDomains?.map((domain) => (
              <label className="damage-context-input form-grid-wide" key={domain.id}>
                開始バトルポイント{attacker.battlePointDomains!.length > 1 ? ` (${domain.id})` : ''}
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={scenario.initialBattlePointPoints?.[domain.id] ?? ''}
                  placeholder="自動"
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === '') changeInitialBattlePoint(domain.id, null);
                    else if (Number.isSafeInteger(Number(value)) && Number(value) >= 0)
                      changeInitialBattlePoint(domain.id, Number(value));
                  }}
                />
                <small>準備前の値です。空欄では自動で開始状態を選びます</small>
              </label>
            ))}
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
          selectedSkills={
            resolvedScenario?.preNoblePhantasmPlan.filter(
              (command): command is AttackerSkillUse => command.kind === 'useSkillSlot',
            ) ?? []
          }
          resolvedSkillUses={resolvedAttackerSkillUses}
          savedBuild={builds[input.attackerId]}
          hidden={mode === 'direct'}
          onChange={changeAttackerSkill}
        />
        {mode === 'quick' ? (
          <AppliedEffects
            title="自身の適用内容"
            effects={effectControls.filter(
              (control) => control.projection.source.origin !== 'support',
            )}
            inputs={effectInputs.filter((input) => input.section === 'own')}
            servants={servants}
            craftEssence={selectedCraftEssence}
            onToggle={changeEffect}
            onInputChange={changeCanonicalInput}
            preparationChoices={preparationChoices}
            onPreparationChoice={changePreparationChoice}
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
                  ? `${String(supportSources.length)}騎・除外${String(excludedSupportEffectCount)}効果`
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
                      onSkillEnabledChange={(skillId, enabled) =>
                        changeSupportSkillEnabled(supportSource.sourceInstanceId, skillId, enabled)
                      }
                    />
                  );
                })}
              </div>
              <AppliedEffects
                title="支援の適用内容"
                effects={effectControls.filter(
                  (control) => control.projection.source.origin === 'support',
                )}
                inputs={effectInputs.filter((input) => input.section === 'support')}
                servants={servants}
                craftEssence={selectedCraftEssence}
                onToggle={changeEffect}
                onInputChange={changeCanonicalInput}
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
        request={request}
        onResetPortableRequest={onResetPortableRequest}
        resetPending={resetPending}
        resetError={resetError}
        attackerName={attacker?.name ?? input.attackerId}
        attackerImage={attacker?.imageKey ?? null}
        targetSummary={targetSummary}
        craftEssenceSummary={craftEssenceSummary}
        supportSummary={supportSummary}
        enabledAttackerSkillCount={enabledAttackerSkillCount}
        effectInputs={effectInputs}
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
                  const scenario = 'request' in entry ? entry.request.scenario : entry.scenario;
                  const attackerId =
                    scenario.mode === 'manual'
                      ? scenario.manual.attackerId
                      : scenario.attacker.servantId;
                  const servant = servants.find((candidate) => candidate.id === attackerId);
                  const npLevel =
                    scenario.mode === 'manual'
                      ? scenario.manual.npLevel
                      : scenario.attacker.npLevel;
                  const average =
                    entry.result.status === 'calculated'
                      ? entry.result.rows[npLevel - 1]?.average
                      : undefined;
                  return (
                    <li key={entry.historyId}>
                      <button
                        type="button"
                        disabled={!('request' in entry) && !servant}
                        onClick={() => {
                          if ('request' in entry) void onHistorySelect(entry);
                          else void onRegenerateHistory(entry);
                          setHistoryDialogOpen(false);
                        }}
                      >
                        <span>
                          <strong>{servant?.name ?? attackerId}</strong>
                          <small>
                            NP{npLevel}・{new Date(entry.lastUsedAt).toLocaleString('ja-JP')}
                            {'request' in entry ? '' : '・旧版履歴（現在の仕様で新規作成）'}
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

export function RejectedCalculator({
  result,
  scenario,
  effectInputs,
  onScenarioChange,
}: {
  result: CalculationResultValue;
  scenario: Extract<CalculationScenario, { mode: 'resolved' }>;
  effectInputs: readonly EffectInputViewModel[];
  onScenarioChange: (scenario: CalculationScenario) => Promise<void>;
}) {
  function changeCanonicalInput(key: string, value: number | null) {
    void onScenarioChange(
      applyCanonicalInputCommand(scenario, {
        kind: 'setCanonicalIntegerInput',
        key,
        value,
      }),
    );
  }
  const hpUnavailable = result.status === 'unavailable' && result.reason === 'attackerDead';
  const hpRepair = hpUnavailable || scenario.attackerHpPermille === null;
  return (
    <div className="worksheet">
      <section>
        <div className="section-heading">
          <div>
            <p className="eyebrow">PREPARATION</p>
            <h2>攻撃準備を完了できません</h2>
          </div>
        </div>
        {hpUnavailable ? (
          <p role="alert">
            HPが0のため宝具を使用できません。準備開始時のHPと準備操作を確認してください。
          </p>
        ) : null}
        {hpRepair && !effectInputs.some((input) => input.key === 'oc:hp:attacker') ? (
          <label className="damage-context-input">
            準備開始時のHP（%）
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={scenario.attackerHpPermille === null ? '' : scenario.attackerHpPermille / 10}
              onChange={(event) =>
                void onScenarioChange(
                  setInitialHp(
                    scenario,
                    event.target.value === ''
                      ? null
                      : Math.round(Math.min(100, Math.max(0, Number(event.target.value))) * 10),
                  ),
                )
              }
            />
            <button
              type="button"
              onClick={() => void onScenarioChange(setInitialHp(scenario, 1000))}
            >
              初期HPを100%へ戻す
            </button>
          </label>
        ) : null}
        <p>準備状態を修正すると再計算します。この状態から直接入力へは切り替えられません。</p>
        {effectInputs.map((input) => (
          <EffectInlineInput key={input.key} input={input} onChange={changeCanonicalInput} />
        ))}
        <ul>
          {result.issues.map((issue) => (
            <li key={`${issue.code}:${issue.detail}`}>{issue.code}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
