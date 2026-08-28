import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import {
  canNormalizeDamageEffect,
  type ConditionExpression,
  type EffectProjection,
  type TraitScope,
} from '@fgo-lab/battle-execution';
import {
  ENGINE_VERSION,
  QUANTITY_FACT_DOMAINS,
  SCHEMA_VERSION,
  type VersionContext,
} from '@fgo-lab/schema';
import { describe, expect, it } from 'vitest';
import {
  applyEffectConditionDecision,
  applyEffectControlPresentationDecision,
  applyEffectPresentationDecision,
  applyEffectProjectionDecision as applyEffectInclusionDecision,
} from './effectDecision';
import { calculateScenario, createDefaultResolvedScenario } from './scenario';
import { setEffectSourceEnabled } from './scenarioCommands';
import { activationFactsForCondition } from './activationContext';

function appendActivationFacts(
  scenario: Parameters<typeof applyEffectInclusionDecision>[0],
  projection: EffectProjection,
) {
  if (projection.decision.state === 'none') return scenario;
  const decisionKey = projection.decision.decisionKey;
  return {
    ...scenario,
    activationDecisions: [
      ...scenario.activationDecisions,
      ...activationFactsForCondition(projection.explanation.condition).map((fact) => ({
        decisionKey,
        fact,
      })),
    ],
  };
}

const root = resolve(import.meta.dirname, '../../..');
function applyEffectProjectionDecision(
  scenario: Parameters<typeof applyEffectInclusionDecision>[0],
  projection: EffectProjection,
  enabled: boolean,
  peers: readonly EffectProjection[] = [],
) {
  const included = applyEffectInclusionDecision(
    enabled ? setEffectSourceEnabled(scenario, projection, true) : scenario,
    projection,
    enabled,
  );
  return enabled &&
    projection.decision.state !== 'none' &&
    projection.decision.kind === 'effect' &&
    projection.decision.plan.condition === 'userMayAssume'
    ? applyEffectConditionDecision(included, projection, true, peers)
    : included;
}
let productionMaster: Promise<ReturnType<typeof masterSnapshotSchema.parse>> | undefined;

function loadProductionMaster() {
  productionMaster ??= readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8').then(
    (content) => masterSnapshotSchema.parse(JSON.parse(content)),
  );
  return productionMaster;
}

function collectConditionKinds(condition: ConditionExpression | null, kinds: Set<string>): void {
  if (!condition) return;
  kinds.add(condition.kind);
  if (condition.kind === 'all' || condition.kind === 'any')
    condition.expressions.forEach((child) => collectConditionKinds(child, kinds));
  else if (condition.kind === 'not') collectConditionKinds(condition.expression, kinds);
}

function positiveTraitAtoms(
  condition: ConditionExpression | null,
  negated = false,
): { scope: TraitScope; trait: string }[] {
  if (!condition) return [];
  if (condition.kind === 'trait')
    return condition.present !== negated
      ? [{ scope: condition.scope, trait: condition.trait }]
      : [];
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.expressions.flatMap((child) => positiveTraitAtoms(child, negated));
  if (condition.kind === 'not') return positiveTraitAtoms(condition.expression, !negated);
  return [];
}

function hasPositiveTargetPredicate(
  condition: ConditionExpression | null,
  negated = false,
): boolean {
  if (!condition) return false;
  if (condition.kind === 'targetPredicate') return condition.present !== negated;
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.expressions.some((child) => hasPositiveTargetPredicate(child, negated));
  return condition.kind === 'not'
    ? hasPositiveTargetPredicate(condition.expression, !negated)
    : false;
}

describe('production master damage quality ratchet', () => {
  it('ratchets every canonical activation-local damage occurrence', async () => {
    const master = await loadProductionMaster();
    const inventory = { effects: 0, choice: 0, operationTrigger: 0, sourceQuantity: 0 };
    for (const servant of master.servants)
      for (const [origin, sources] of [
        ['attacker', servant.skills],
        ['np', servant.noblePhantasms],
        ['passive', servant.passives],
      ] as const)
        for (const source of sources)
          for (const effect of source.effects) {
            if (!canNormalizeDamageEffect(effect, origin)) continue;
            const hasActivationCondition =
              effect.choice !== null ||
              effect.operationTrigger !== null ||
              effect.sourceQuantityConditions.length > 0;
            if (!hasActivationCondition) continue;
            inventory.effects += 1;
            if (effect.choice !== null) inventory.choice += 1;
            if (effect.operationTrigger !== null) inventory.operationTrigger += 1;
            if (effect.sourceQuantityConditions.length > 0) inventory.sourceQuantity += 1;
          }
    expect(inventory).toEqual({
      effects: 39,
      choice: 34,
      operationTrigger: 5,
      sourceQuantity: 5,
    });
  });

  it('allows Summer Wu to grant a state trait after an initial negative trait fact', async () => {
    const master = await loadProductionMaster();
    const servant = master.servants.find((candidate) => candidate.id === '505200')!;
    const scenario = createDefaultResolvedScenario(master, undefined, servant);
    const versions: VersionContext = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    };
    const baseline = calculateScenario(scenario, master, versions);
    const initiallyNotUndead = calculateScenario(
      {
        ...scenario,
        worldFactAssertions: [
          {
            decisionKey: 'world:initial:not-undead',
            fact: { kind: 'trait', scope: 'target', trait: 'undead', present: false },
          },
        ],
      },
      master,
      versions,
    );

    expect(baseline.result.status).toBe('calculated');
    expect(initiallyNotUndead.result.status).toBe('calculated');
    expect(initiallyNotUndead.result.rows).toEqual(baseline.result.rows);
    expect(initiallyNotUndead.input.target.traits).toEqual([]);
    expect(initiallyNotUndead.input.targetStateTraits).toContain('undead');
    expect(
      initiallyNotUndead.effects.find((effect) => effect.label === '死霊特性付与'),
    ).toMatchObject({ visibility: 'hidden', outcome: 'applied' });
    expect(initiallyNotUndead.effectWarnings).not.toEqual(
      expect.arrayContaining([expect.stringContaining('traitPolarity:target:undead')]),
    );
  });

  it('keeps the canonical Battle Point domain large enough for every master phase', async () => {
    const master = await loadProductionMaster();
    const maximumPhases = master.servants.flatMap((servant) =>
      servant.noblePhantasms.flatMap((np) =>
        np.damage.flatMap((damage) =>
          damage.kind === 'battlePointPhase' ? [damage.maximumBattlePointPhase] : [],
        ),
      ),
    );
    expect(maximumPhases.length).toBeGreaterThan(0);
    expect(Math.max(...maximumPhases)).toBeLessThanOrEqual(
      QUANTITY_FACT_DOMAINS.battlePointPhase.max,
    );
    expect(Math.min(...maximumPhases)).toBeGreaterThanOrEqual(
      QUANTITY_FACT_DOMAINS.battlePointPhase.min,
    );
  });

  it('executes normalized Battle Point guards and rejects contradictory decisions', async () => {
    const master = await loadProductionMaster();
    const versions: VersionContext = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    };
    const ereshkigal = master.servants.find((servant) => servant.id === '3300200')!;
    const ereshkigalScenario = createDefaultResolvedScenario(master, undefined, ereshkigal);
    const beforeDefencePierce = calculateScenario(
      { ...ereshkigalScenario, battleState: { battlePointPhase: 6 } },
      master,
      versions,
    );
    const afterDefencePierce = calculateScenario(
      { ...ereshkigalScenario, battleState: { battlePointPhase: 7 } },
      master,
      versions,
    );

    expect(beforeDefencePierce.result.status).toBe('calculated');
    expect(beforeDefencePierce.input.damageFunction).toMatchObject({ ignoreDefense: false });
    expect(afterDefencePierce.result.status).toBe('calculated');
    expect(afterDefencePierce.input.damageFunction).toMatchObject({ ignoreDefense: true });
    expect(afterDefencePierce.effects.find((effect) => effect.label === '防御無視')).toMatchObject({
      outcome: 'applied',
      controllability: 'user',
    });

    const beniEnma = master.servants.find((servant) => servant.id === '705300')!;
    const beniScenario = createDefaultResolvedScenario(master, undefined, beniEnma);
    const baseline = calculateScenario(
      { ...beniScenario, battleState: { battlePointPhase: 0 } },
      master,
      versions,
    );
    const conditionalNpDamage = baseline.effects.find(
      (effect) =>
        effect.skillName === '首取り翁の針山剣 EX' &&
        effect.label === '宝具威力アップ' &&
        effect.controllability === 'user' &&
        effect.explanation.condition !== null,
    )!;
    const enabled = applyEffectProjectionDecision(
      { ...beniScenario, battleState: { battlePointPhase: 0 } },
      conditionalNpDamage,
      true,
    );
    const compatible = calculateScenario(enabled, master, versions);
    const conflict = calculateScenario(
      { ...enabled, battleState: { battlePointPhase: 2 } },
      master,
      versions,
    );

    expect(compatible.result.status).toBe('calculated');
    expect(
      compatible.effects.find(
        (effect) => effect.projectionKey === conditionalNpDamage.projectionKey,
      ),
    ).toMatchObject({ outcome: 'applied' });
    expect(compatible.input.npDamageBuff).toBe(0.2);
    expect(conflict.result.status).toBe('calculated');
    expect(conflict.input.npDamageBuff).toBe(0);
    expect(
      conflict.effects.find((effect) => effect.projectionKey === conditionalNpDamage.projectionKey)
        ?.outcome,
    ).toBe('notApplied');
  });

  it('evaluates HP-linear modifier values from the attacker HP quantity', async () => {
    const master = await loadProductionMaster();
    const versions: VersionContext = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    };
    const calculateEnabled = (servantId: string, skillName: string, hp: number) => {
      const servant = master.servants.find((candidate) => candidate.id === servantId)!;
      const scenario = {
        ...createDefaultResolvedScenario(master, undefined, servant),
        attackerHpPermille: hp,
      };
      const baseline = calculateScenario(scenario, master, versions);
      const projection = baseline.effects.find(
        (effect) =>
          effect.skillName === skillName &&
          effect.label === '攻撃力アップ' &&
          effect.requiredQuantity === 'attackerHpPermille',
      )!;
      return {
        projection,
        result: calculateScenario(
          applyEffectProjectionDecision(scenario, projection, true),
          master,
          versions,
        ),
      };
    };

    const cuFull = calculateEnabled('300100', '四枝の浅瀬 A', 1_000);
    const cuHalf = calculateEnabled('300100', '四枝の浅瀬 A', 500);
    const cuZero = calculateEnabled('300100', '四枝の浅瀬 A', 0);
    expect(cuFull.result.input.attackBuff).toBe(0.2);
    expect(cuHalf.result.input.attackBuff).toBe(0.35);
    expect(cuZero.result.input.attackBuff).toBe(0.5);
    expect(cuHalf.projection.value).toBe(0.35);

    const lipHalf = calculateEnabled('1000100', '被虐体質 A+', 500);
    const lipZero = calculateEnabled('1000100', '被虐体質 A+', 0);
    expect(lipHalf.result.result.status).toBe('calculated');
    expect(lipHalf.result.input.attackBuff).toBe(0.3);
    expect(lipZero.result.input.attackBuff).toBe(0.5);

    const passionLip = master.servants.find((servant) => servant.id === '1000100');
    if (!passionLip) throw new Error('production Passionlip missing');
    const incompatible = calculateScenario(
      {
        ...applyEffectProjectionDecision(
          {
            ...createDefaultResolvedScenario(master, undefined, passionLip),
            attackerHpPermille: 500,
          },
          lipHalf.projection,
          true,
        ),
        attackerHpPermille: 600,
      },
      master,
      versions,
    );
    expect(incompatible.result.status).toBe('calculated');
    expect(incompatible.input.attackBuff).toBe(0);

    const attacker = master.servants.find((servant) => servant.id === '100100')!;
    const supportScenario = {
      ...createDefaultResolvedScenario(master, undefined, attacker),
      attackerHpPermille: 500,
      support: {
        sourceTemplateId: null,
        composition: {
          sources: [
            {
              sourceInstanceId: 'support:leonidas',
              servantId: '300900',
              skills: [{ skillId: '49650', skillLevel: 10, enabled: true }],
            },
          ],
          effectInclusions: [],
        },
      },
    };
    const supportBaseline = calculateScenario(supportScenario, master, versions);
    const supportHpEffect = supportBaseline.effects.find(
      (effect) =>
        effect.source.origin === 'support' &&
        effect.requiredInputs.some((input) => input.kind === 'sourceHpPermille'),
    )!;
    const sourceHpInput = supportHpEffect.requiredInputs.find(
      (input) => input.kind === 'sourceHpPermille',
    )!;
    const fullHp = calculateScenario(
      applyEffectProjectionDecision(supportScenario, supportHpEffect, true),
      master,
      versions,
    );
    const halfHpScenario = {
      ...supportScenario,
      canonicalInputValues: {
        [sourceHpInput.key]: { kind: 'integer' as const, value: 500 },
      },
    };
    const halfHpBaseline = calculateScenario(halfHpScenario, master, versions);
    const halfHp = calculateScenario(
      applyEffectProjectionDecision(
        halfHpScenario,
        halfHpBaseline.effects.find(
          (effect) => effect.projectionKey === supportHpEffect.projectionKey,
        )!,
        true,
      ),
      master,
      versions,
    );
    expect(fullHp.result.status).toBe('calculated');
    expect(halfHp.result.status).toBe('calculated');
    expect(halfHp.input.attackBuff).toBeGreaterThan(fullHp.input.attackBuff);
    expect(
      halfHp.effects.find((effect) => effect.projectionKey === supportHpEffect.projectionKey),
    ).toMatchObject({ outcome: 'applied', executionSupport: 'supported' });
  });

  it('executes action candidates locally and rejects different candidates together', async () => {
    const master = await loadProductionMaster();
    const servant = master.servants.find((candidate) => candidate.id === '101000')!;
    const scenario = createDefaultResolvedScenario(master, undefined, servant);
    const versions: VersionContext = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    };
    const baseline = calculateScenario(scenario, master, versions);
    const buster = baseline.effects.find(
      (effect) =>
        effect.skillName === '真紅の勇者伝説・劇場版 EX' && effect.modifier === 'cardBuff',
    )!;
    const attack = baseline.effects.find(
      (effect) =>
        effect.skillName === '真紅の勇者伝説・劇場版 EX' && effect.modifier === 'attackBuff',
    )!;
    const busterOnly = calculateScenario(
      applyEffectProjectionDecision(scenario, buster, true),
      master,
      versions,
    );
    const attackOnly = calculateScenario(
      applyEffectProjectionDecision(scenario, attack, true),
      master,
      versions,
    );
    const resolvedChoiceScenario = applyEffectProjectionDecision(
      applyEffectProjectionDecision(scenario, buster, true),
      attack,
      true,
    );
    const resolvedChoice = calculateScenario(resolvedChoiceScenario, master, versions);
    const conflict = calculateScenario(
      appendActivationFacts(resolvedChoiceScenario, buster),
      master,
      versions,
    );

    expect(busterOnly.result.status).toBe('calculated');
    expect(busterOnly.input.cardBuff).toBeGreaterThan(0);
    expect(busterOnly.input.attackBuff).toBe(0);
    expect(attackOnly.result.status).toBe('calculated');
    expect(attackOnly.input.attackBuff).toBeGreaterThan(0);
    expect(attackOnly.input.cardBuff).toBe(0);
    expect(resolvedChoice.result.status).toBe('calculated');
    expect(resolvedChoice.input.attackBuff).toBeGreaterThan(0);
    expect(resolvedChoice.input.cardBuff).toBe(0);
    expect(conflict.result.status).toBe('unsupported');
    expect(conflict.input.cardBuff).toBe(0);
    expect(conflict.input.attackBuff).toBe(0);
    expect(
      conflict.effects
        .filter(
          (effect) =>
            effect.projectionKey === buster.projectionKey ||
            effect.projectionKey === attack.projectionKey,
        )
        .map((effect) => effect.outcome),
    ).not.toContain('applied');
    expect(conflict.effectWarnings).toEqual(
      expect.arrayContaining([expect.stringContaining('choiceConflict')]),
    );
  });

  it('keeps Battle Point rate guards effect-local to Beni-enma action candidates', async () => {
    const master = await loadProductionMaster();
    const servant = master.servants.find((candidate) => candidate.id === '705300')!;
    const scenario = createDefaultResolvedScenario(master, undefined, servant);
    const versions: VersionContext = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    };
    const baseline = calculateScenario(scenario, master, versions);
    const guarded = baseline.effects.filter(
      (effect) =>
        effect.modifier !== null &&
        JSON.stringify(effect.explanation.condition).includes('sourceQuantity'),
    );
    expect(guarded).toHaveLength(3);
    expect(guarded.every((effect) => effect.controllability === 'user')).toBe(true);
    const firstAttack = guarded.find(
      (effect) =>
        effect.modifier === 'attackBuff' &&
        JSON.stringify(effect.explanation.condition).includes('"candidate":"1"'),
    )!;
    const rareAttack = guarded.find(
      (effect) =>
        effect.modifier === 'attackBuff' &&
        JSON.stringify(effect.explanation.condition).includes('"candidate":"2"'),
    )!;
    const rareNp = guarded.find((effect) => effect.modifier === 'npDamageBuff')!;
    const rareScenario = applyEffectProjectionDecision(
      applyEffectProjectionDecision(scenario, rareAttack, true),
      rareNp,
      true,
    );
    expect(rareScenario.worldFactAssertions).toEqual(scenario.worldFactAssertions);
    const rare = calculateScenario(rareScenario, master, versions);
    expect(rare.result.status).toBe('calculated');
    expect(rare.input.attackBuff).toBeCloseTo(0.2, 10);
    expect(rare.input.npDamageBuff).toBeCloseTo(0.2, 10);
    expect(
      rare.effects
        .filter((effect) =>
          [rareAttack.projectionKey, rareNp.projectionKey].includes(effect.projectionKey),
        )
        .map((effect) => effect.outcome),
    ).toEqual(['applied', 'applied']);

    const resolvedChoiceScenario = applyEffectProjectionDecision(rareScenario, firstAttack, true);
    const resolvedChoice = calculateScenario(resolvedChoiceScenario, master, versions);
    const conflict = calculateScenario(
      appendActivationFacts(resolvedChoiceScenario, rareAttack),
      master,
      versions,
    );
    expect(resolvedChoice.result.status).toBe('calculated');
    expect(resolvedChoice.input.attackBuff).toBeCloseTo(0.2, 10);
    expect(resolvedChoice.input.npDamageBuff).toBe(0);
    expect(conflict.result.status).toBe('unsupported');
    expect(conflict.input.attackBuff).toBe(0);
    expect(conflict.input.npDamageBuff).toBe(0);
    expect(conflict.effectWarnings).toEqual(
      expect.arrayContaining([expect.stringContaining('choiceConflict')]),
    );
  });

  it('resolves an automatic NP-card pre-damage reference at artifact build time', async () => {
    const master = await loadProductionMaster();
    const servant = master.servants.find((candidate) => candidate.id === '506000')!;
    const calculation = calculateScenario(
      createDefaultResolvedScenario(master, undefined, servant),
      master,
      {
        schemaVersion: SCHEMA_VERSION,
        engineVersion: ENGINE_VERSION,
        appVersion: '0.1.0',
        gameRegion: 'JP',
        masterDataLocale: 'ja-JP',
        masterDataVersion: master.version,
      },
    );
    const preDamageReference = calculation.effects.find(
      (effect) => effect.label === '宝具攻撃ダメージ前追加効果',
    );
    expect(calculation.result.status).toBe('calculated');
    expect(calculation.result.rows).toHaveLength(5);
    expect(preDamageReference).toBeUndefined();
    expect(
      servant.noblePhantasms
        .flatMap((np) => np.effects)
        .find((effect) => effect.operationReference?.skillId === '970936'),
    ).toMatchObject({
      operationReference: { kind: 'resolvedSkill', levelSource: 'secondaryValueParameter' },
    });
  });

  it('changes the NP card transactionally before evaluating card-specific modifiers', async () => {
    const master = await loadProductionMaster();
    const servant = master.servants.find((candidate) => candidate.id === '200100')!;
    const inactiveScenario = createDefaultResolvedScenario(master, undefined, servant);
    const versions: VersionContext = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    };
    const inactive = calculateScenario(inactiveScenario, master, versions);
    const artsChange = inactive.effects.find(
      (effect) =>
        effect.skillName === '回路接続 EX' &&
        effect.modifier === 'cardTypeChange' &&
        effect.label.includes('Arts'),
    )!;
    const scenario = setEffectSourceEnabled(inactiveScenario, artsChange, true);
    const baseline = calculateScenario(scenario, master, versions);
    const changedScenario = applyEffectProjectionDecision(scenario, artsChange, true);
    const changed = calculateScenario(changedScenario, master, versions);
    const busterChange = baseline.effects.find(
      (effect) =>
        effect.skillName === '回路接続 EX' &&
        effect.modifier === 'cardTypeChange' &&
        effect.label.includes('Buster'),
    )!;
    const artsBuff = changed.effects.find(
      (effect) =>
        effect.skillName === '回路接続 EX' &&
        effect.modifier === 'cardBuff' &&
        effect.label === 'アーツアップ',
    )!;
    const busterBuff = changed.effects.find(
      (effect) =>
        effect.skillName === '回路接続 EX' &&
        effect.modifier === 'cardBuff' &&
        effect.label === 'バスターアップ',
    )!;
    const buffed = calculateScenario(
      applyEffectProjectionDecision(changedScenario, artsBuff, true),
      master,
      versions,
    );
    const resolvedChoiceScenario = applyEffectProjectionDecision(
      changedScenario,
      busterChange,
      true,
    );
    const resolvedChoice = calculateScenario(resolvedChoiceScenario, master, versions);
    const conflict = calculateScenario(
      appendActivationFacts(resolvedChoiceScenario, artsChange),
      master,
      versions,
    );

    expect(baseline.input.cardType).toBe('buster');
    expect(changed.result.status).toBe('calculated');
    expect(changed.input.cardType).toBe('arts');
    expect(changed.result.rows[0]?.average).not.toBe(baseline.result.rows[0]?.average);
    expect(artsChange).toMatchObject({ sourceActive: true, decision: { state: 'disabled' } });
    expect(
      changed.effects.find((effect) => effect.projectionKey === artsChange.projectionKey),
    ).toMatchObject({ outcome: 'applied', decision: { state: 'enabled' } });
    expect(artsBuff.visibility).toBe('visible');
    expect(busterBuff.visibility).toBe('hidden');
    expect(buffed.result.status).toBe('calculated');
    expect(buffed.input.cardType).toBe('arts');
    expect(buffed.input.cardBuff).toBeGreaterThan(0);
    expect(resolvedChoice.result.status).toBe('calculated');
    expect(resolvedChoice.input.cardType).toBe('buster');
    expect(conflict.result.status).toBe('unsupported');
    expect(conflict.input.cardType).toBe('buster');
    expect(
      conflict.effects
        .filter((effect) => effect.modifier === 'cardTypeChange')
        .map((effect) => effect.outcome),
    ).not.toContain('applied');
  });

  it('replaces Jade Rabbit NP form traits atomically with the card type', async () => {
    const master = await loadProductionMaster();
    const servant = master.servants.find((candidate) => candidate.id === '2301100')!;
    const scenario = createDefaultResolvedScenario(master, undefined, servant);
    const versions: VersionContext = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    };
    const baseline = calculateScenario(scenario, master, versions);
    const busterForm = baseline.effects.find(
      (effect) => effect.modifier === 'cardTypeChange' && effect.label === '月下',
    )!;
    const artsForm = baseline.effects.find(
      (effect) =>
        effect.modifier === 'cardTypeChange' &&
        effect.skillName === '望月に踊る A' &&
        effect.label === '日輪',
    )!;
    const busterFormScenario = applyEffectProjectionDecision(scenario, busterForm, true);
    const withBusterForm = calculateScenario(busterFormScenario, master, versions);
    const busterAttack = withBusterForm.effects.find(
      (effect) =>
        effect.modifier === 'attackBuff' &&
        JSON.stringify(effect.explanation.condition).includes('traitId:3121'),
    )!;
    const busterNp = withBusterForm.effects.find(
      (effect) =>
        effect.modifier === 'npDamageBuff' &&
        JSON.stringify(effect.explanation.condition).includes('traitId:3121'),
    )!;
    const artsAttack = baseline.effects.find(
      (effect) =>
        effect.modifier === 'attackBuff' &&
        JSON.stringify(effect.explanation.condition).includes('traitId:3122'),
    )!;
    expect(baseline).toMatchObject({
      result: { status: 'calculated' },
      input: { cardType: 'arts', attackBuff: 0, npDamageBuff: 0.2 },
    });
    expect(
      baseline.effects.find(
        (effect) => effect.modifier === 'cardTypeChange' && effect.source.origin === 'passive',
      ),
    ).toMatchObject({ controllability: 'user', outcome: 'applied' });

    const busterScenario = [busterAttack, busterNp].reduce(
      (current, effect) => applyEffectProjectionDecision(current, effect, true),
      busterFormScenario,
    );
    const buster = calculateScenario(busterScenario, master, versions);
    expect(buster.result.status).toBe('calculated');
    expect(buster.input).toMatchObject({ cardType: 'buster', attackBuff: 0.3, npDamageBuff: 0.5 });
    expect(
      buster.effects
        .filter((effect) =>
          [busterForm.projectionKey, busterAttack.projectionKey, busterNp.projectionKey].includes(
            effect.projectionKey,
          ),
        )
        .map((effect) => effect.outcome),
    ).toEqual(['applied', 'applied', 'applied']);

    const arts = calculateScenario(
      applyEffectProjectionDecision(
        applyEffectProjectionDecision(scenario, artsForm, true),
        artsAttack,
        true,
      ),
      master,
      versions,
    );
    expect(arts.result.status).toBe('calculated');
    expect(arts.input).toMatchObject({ cardType: 'arts', attackBuff: 0.3 });

    const missingForm = calculateScenario(
      applyEffectProjectionDecision(scenario, busterAttack, true),
      master,
      versions,
    );
    expect(missingForm.result.status).toBe('unsupported');
    expect(missingForm.input.attackBuff).toBe(0);

    const resolvedFormScenario = applyEffectProjectionDecision(
      applyEffectProjectionDecision(scenario, busterForm, true),
      artsForm,
      true,
    );
    const resolvedForms = calculateScenario(resolvedFormScenario, master, versions);
    const conflictingForms = calculateScenario(
      appendActivationFacts(resolvedFormScenario, busterForm),
      master,
      versions,
    );
    expect(resolvedForms.result.status).toBe('calculated');
    expect(resolvedForms.input.cardType).toBe('arts');
    expect(conflictingForms.result.status).toBe('unsupported');
    expect(conflictingForms.input.cardType).toBe('arts');
    expect(
      conflictingForms.effects
        .filter((effect) =>
          [busterForm.projectionKey, artsForm.projectionKey].includes(effect.projectionKey),
        )
        .map((effect) => effect.outcome),
    ).not.toContain('applied');
  });

  it('keeps command-card attack triggers outside NP damage projections', async () => {
    const master = await loadProductionMaster();
    const occurrences = master.servants.flatMap((servant) =>
      [...servant.skills, ...servant.passives].flatMap((skill) =>
        skill.effects.flatMap((effect) =>
          effect.triggerScope === 'commandCardAttack'
            ? [{ servantId: servant.id, skillId: skill.id, effect }]
            : [],
        ),
      ),
    );
    expect({
      servants: new Set(occurrences.map((item) => item.servantId)).size,
      effects: occurrences.length,
    }).toEqual({ servants: 20, effects: 22 });
    expect(occurrences.every(({ effect }) => !canNormalizeDamageEffect(effect, 'attacker'))).toBe(
      true,
    );

    const indra = master.servants.find((servant) => servant.id === '305900')!;
    const scenario = createDefaultResolvedScenario(master, undefined, indra);
    const calculation = calculateScenario(scenario, master, {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    });
    expect(calculation.result.status).toBe('calculated');
    expect(
      calculation.effects.some((effect) => effect.label.includes('攻撃ダメージ前追加効果')),
    ).toBe(false);
  });

  it('separates command-card scope and buff identity from NP damage semantics', async () => {
    const master = await loadProductionMaster();
    const commandCardEffects = master.servants.flatMap((servant) =>
      [...servant.skills, ...servant.passives].flatMap((skill) =>
        skill.effects.flatMap((effect) =>
          effect.triggerScope === 'commandCard' ? [{ servantId: servant.id, effect }] : [],
        ),
      ),
    );
    expect({
      servants: new Set(commandCardEffects.map((item) => item.servantId)).size,
      effects: commandCardEffects.length,
    }).toEqual({ servants: 11, effects: 17 });
    expect(
      commandCardEffects.every(({ effect }) => !canNormalizeDamageEffect(effect, 'attacker')),
    ).toBe(true);

    const versions: VersionContext = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    };
    for (const servantId of ['101700', '703600']) {
      const servant = master.servants.find((candidate) => candidate.id === servantId)!;
      const calculation = calculateScenario(
        createDefaultResolvedScenario(master, undefined, servant),
        master,
        versions,
      );
      expect(
        calculation.effects.some((effect) =>
          JSON.stringify(effect.explanation.condition).includes('faceCard'),
        ),
      ).toBe(false);
    }

    const nemo = master.servants.find((servant) => servant.id === '405700')!;
    const nemoScenario = createDefaultResolvedScenario(master, undefined, nemo);
    const nemoInitial = calculateScenario(nemoScenario, master, versions);
    const linkedArts = nemoInitial.effects.find(
      (effect) => effect.label === 'アーツアップ' && effect.source.skillId === '2554650',
    )!;
    const nemoUsedScenario = applyEffectProjectionDecision(nemoScenario, linkedArts, true);
    const nemoSelected = calculateScenario(nemoUsedScenario, master, versions);
    const nemoWithoutArts = calculateScenario(
      applyEffectProjectionDecision(nemoScenario, linkedArts, false),
      master,
      versions,
    );
    expect(nemoSelected.result.status).toBe('calculated');
    expect(nemoSelected.input.cardBuff - nemoWithoutArts.input.cardBuff).toBeCloseTo(
      linkedArts.value!,
      10,
    );
    expect(
      nemoSelected.effects.find((effect) => effect.projectionKey === linkedArts.projectionKey),
    ).toMatchObject({ outcome: 'applied' });

    const mash = master.servants.find((servant) => servant.id === '800100')!;
    const mashCalculation = calculateScenario(
      createDefaultResolvedScenario(master, undefined, mash),
      master,
      versions,
    );
    const linkedBuster = mashCalculation.effects.find(
      (effect) => effect.label === 'バスターアップ' && effect.source.origin === 'np',
    );
    expect(mashCalculation.result.status).toBe('calculated');
    expect(linkedBuster).toMatchObject({ controllability: 'user', outcome: 'applied' });
    expect(mashCalculation.input.cardBuff).toBeGreaterThan(0);
  });

  it('executes function-position guards as effect-local decisions', async () => {
    const master = await loadProductionMaster();
    const occurrences = master.servants.flatMap((servant) =>
      [
        ...servant.skills.map((skill) => ({ origin: 'attacker' as const, skill })),
        ...servant.passives.map((skill) => ({ origin: 'passive' as const, skill })),
        ...servant.noblePhantasms.map((skill) => ({ origin: 'np' as const, skill })),
      ].flatMap(({ origin, skill }) =>
        skill.effects.flatMap((effect) =>
          effect.operationTrigger ? [{ servantId: servant.id, origin, effect }] : [],
        ),
      ),
    );
    expect({
      servants: new Set(occurrences.map((item) => item.servantId)).size,
      effects: occurrences.length,
      damageCandidates: occurrences.filter(({ effect, origin }) =>
        canNormalizeDamageEffect(effect, origin),
      ).length,
    }).toEqual({ servants: 13, effects: 23, damageCandidates: 5 });
    expect(
      occurrences.every(({ effect }) =>
        effect.atlasEvidence.parameterSemantics.condition.includes('TriggeredFuncPosition'),
      ),
    ).toBe(true);

    const versions: VersionContext = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    };
    const cases = [
      ['204900', '攻撃力アップ', 'attackBuff', 0.2],
      ['2301200', '宝具威力アップ', 'npDamageBuff', 0.2],
      ['2800500', '防御力ダウン', 'attackBuff', 0.5],
    ] as const;
    for (const [servantId, label, inputKey, value] of cases) {
      const servant = master.servants.find((candidate) => candidate.id === servantId)!;
      const scenario = createDefaultResolvedScenario(master, undefined, servant);
      const initial = calculateScenario(scenario, master, versions);
      const projection = initial.effects.find(
        (effect) =>
          effect.label === label &&
          effect.explanation.condition !== null &&
          (() => {
            const kinds = new Set<string>();
            collectConditionKinds(effect.explanation.condition, kinds);
            return kinds.has('operationTrigger');
          })(),
      )!;
      expect(projection).toMatchObject({
        controllability: 'user',
        outcome: 'notApplied',
        decision: { kind: 'effect', plan: { condition: 'userMayAssume' } },
      });
      const usedScenario = setEffectSourceEnabled(scenario, projection, true);
      const used = calculateScenario(usedScenario, master, versions);
      const selectedScenario = applyEffectProjectionDecision(usedScenario, projection, true);
      expect(selectedScenario.worldFactAssertions).toEqual(scenario.worldFactAssertions);
      const selected = calculateScenario(selectedScenario, master, versions);
      expect(selected.result.status, `${servantId}:${label}`).toBe('calculated');
      expect(selected.input[inputKey] - used.input[inputKey], `${servantId}:${label}`).toBeCloseTo(
        value,
        10,
      );
      expect(
        selected.effects.find((effect) => effect.projectionKey === projection.projectionKey),
      ).toMatchObject({ outcome: 'applied', decision: { state: 'enabled' } });
      expect(selected.input.target.traits).toEqual([]);
      expect(selected.input.fieldTraits).toEqual([]);
    }
  });

  it('fails closed on out-of-domain HP facts for the production HP-ratio NP', async () => {
    const master = await loadProductionMaster();
    const servant = master.servants.find((candidate) => candidate.id === '202500')!;
    const scenario = createDefaultResolvedScenario(master, undefined, servant);
    const versions: VersionContext = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    };
    for (const value of [-100, 2_000]) {
      const calculation = calculateScenario(
        {
          ...scenario,
          worldFactAssertions: [
            {
              decisionKey: 'world:attacker-hp',
              fact: { kind: 'quantity', quantity: 'attackerHpPermille', value },
            },
          ],
        },
        master,
        versions,
      );
      expect(calculation.result.status, String(value)).toBe('unsupported');
      expect(calculation.result.rows, String(value)).toEqual([]);
      expect(calculation.input.attackerHpPermille, String(value)).toBe(1_000);
      expect(calculation.effectWarnings, String(value)).toEqual(
        expect.arrayContaining([
          expect.stringContaining(
            'constraintValidationUnsupported:world:attacker-hp:quantityFactOutOfDomain',
          ),
        ]),
      );
    }
  });

  it('keeps representative OR conditions user-controllable and effect-local', async () => {
    const master = await loadProductionMaster();
    const versions: VersionContext = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    };
    const cases = [
      ['305900', 'インドラ', '威力アップ〔蛇・竜〕'],
      ['306300', 'グレイ・リリィ', '威力アップ・対霊体'],
      ['704000', 'モルガン', '威力アップ・対円卓の騎士と妖精'],
      ['900400', 'マルタ', '威力アップ・対神性、死霊、悪魔'],
      ['2801200', 'ソロモン', '威力アップ・七騎士クラス'],
      ['4000100', 'Ｕ－オルガマリー', '威力アップ・対エクストラクラス'],
    ] as const;
    for (const [servantId, servantName, label] of cases) {
      const servant = master.servants.find((candidate) => candidate.id === servantId)!;
      const scenario = createDefaultResolvedScenario(master, undefined, servant);
      const initial = calculateScenario(scenario, master, versions);
      const projection = initial.effects.find((effect) => effect.label === label)!;
      expect(projection, `${servantName}:${label}`).toMatchObject({
        visibility: 'visible',
        controllability: 'user',
        outcome: 'notApplied',
        decision: { kind: 'effect', plan: { condition: 'userMayAssume' } },
      });
      const selected = calculateScenario(
        applyEffectProjectionDecision(scenario, projection, true),
        master,
        versions,
      );
      expect(selected.result.status, `${servantName}:${label}`).toBe('calculated');
      if (initial.result.status !== 'calculated' || selected.result.status !== 'calculated')
        throw new Error(`${servantName}:${label}:calculated result expected`);
      expect(selected.result.rows[0].average).toBeGreaterThan(initial.result.rows[0].average);
      expect(
        selected.effects.find((effect) => effect.projectionKey === projection.projectionKey),
      ).toMatchObject({ outcome: 'applied', decision: { state: 'enabled' } });
      expect(selected.input.target.traits).toEqual([]);
      expect(selected.input.fieldTraits).toEqual([]);

      if (projection.decision.state !== 'none' && projection.decision.kind === 'targetPredicate')
        continue;
      const atoms = positiveTraitAtoms(projection.explanation.condition).filter(
        (atom, index, all) =>
          all.findIndex(
            (candidate) => candidate.scope === atom.scope && candidate.trait === atom.trait,
          ) === index,
      );
      if (atoms.length === 0) {
        expect(
          hasPositiveTargetPredicate(projection.explanation.condition),
          `${servantName}:${label}:typed target predicates`,
        ).toBe(true);
        continue;
      }
      expect(atoms.length, `${servantName}:${label}:trait atoms`).toBeGreaterThan(0);
      const compatible = calculateScenario(
        {
          ...applyEffectProjectionDecision(scenario, projection, true),
          worldFactAssertions: [
            {
              decisionKey: `audit:compatible:${projection.projectionKey}`,
              fact: { kind: 'trait', ...atoms[0]!, present: true },
            },
          ],
        },
        master,
        versions,
      );
      expect(compatible.result.status, `${servantName}:${label}:compatible`).toBe('calculated');

      const incompatible = calculateScenario(
        {
          ...applyEffectProjectionDecision(scenario, projection, true),
          worldFactAssertions: atoms.flatMap((atom) => {
            const scopes =
              atom.scope === 'target'
                ? (['target', 'targetState'] as const)
                : atom.scope === 'attacker'
                  ? (['attacker', 'attackerState'] as const)
                  : [atom.scope];
            return scopes.map((scope) => ({
              decisionKey: `audit:negative:${projection.projectionKey}:${scope}:${atom.trait}`,
              fact: {
                kind: 'trait' as const,
                scope,
                trait: atom.trait,
                present: false,
              },
            }));
          }),
        },
        master,
        versions,
      );
      expect(incompatible.result.status, `${servantName}:${label}:incompatible`).toBe(
        'unsupported',
      );
      expect(incompatible.effectWarnings).toEqual(
        expect.arrayContaining([expect.stringContaining('constraintConflict:')]),
      );
      expect(
        incompatible.effects.find((effect) => effect.projectionKey === projection.projectionKey)
          ?.outcome,
      ).not.toBe('applied');
    }

    const nemo = master.servants.find((candidate) => candidate.name === 'ネモ')!;
    const scenario = createDefaultResolvedScenario(master, undefined, nemo);
    const initial = calculateScenario(scenario, master, versions);
    const projections = [
      '攻撃力アップ：水辺または虚数空間',
      'アーツアップ：水辺または虚数空間',
      '宝具威力アップ：水辺または虚数空間',
    ].map((label) => initial.effects.find((effect) => effect.label === label)!);
    const usedScenario = projections.reduce(
      (current, projection) => setEffectSourceEnabled(current, projection, true),
      scenario,
    );
    const used = calculateScenario(usedScenario, master, versions);
    const selectedScenario = projections.reduce(
      (current, projection) => applyEffectProjectionDecision(current, projection, true),
      usedScenario,
    );
    const selected = calculateScenario(selectedScenario, master, versions);
    expect(selected.result.status).toBe('calculated');
    expect(projections.every((projection) => projection.controllability === 'user')).toBe(true);
    expect(selected.input.attackBuff - used.input.attackBuff).toBeCloseTo(0.2, 10);
    expect(selected.input.cardBuff - used.input.cardBuff).toBeCloseTo(0.2, 10);
    expect(selected.input.npDamageBuff - used.input.npDamageBuff).toBeCloseTo(0.2, 10);
    expect(selected.input.fieldTraits).toEqual([]);
  });

  it('executes Dante realm choices through typed assumptions and rejects the conflict', async () => {
    const master = await loadProductionMaster();
    const servant = master.servants.find((candidate) => candidate.name === 'ダンテ・アリギエーリ');
    const versions: VersionContext = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    };
    expect(servant).toBeDefined();
    const scenario = createDefaultResolvedScenario(master, undefined, servant);
    const initial = calculateScenario(scenario, master, versions);
    const sky = initial.effects.find((effect) => effect.label === '威力アップ・対 天の力')!;
    const earth = initial.effects.find((effect) => effect.label === '威力アップ・対 地の力')!;
    const fieldChanges = initial.effects.filter((effect) =>
      effect.label.startsWith('フィールド変化'),
    );
    const passive = initial.effects.find((effect) => effect.source.origin === 'passive')!;
    const automaticNpEffect = initial.effects.find(
      (effect) => effect.label === '宝具威力アップ' && effect.source.origin === 'np',
    )!;
    const mismatchedCardEffects = initial.effects.filter(
      (effect) => effect.explanation.code === 'cardMismatch',
    );
    expect(initial.result.status).toBe('calculated');
    if (initial.result.status !== 'calculated') throw new Error('Dante base must calculate');
    expect(initial.result.rows[0].average).toBeCloseTo(32_208.975);

    expect(fieldChanges).not.toHaveLength(0);
    expect(fieldChanges.every((effect) => effect.visibility === 'hidden')).toBe(true);
    expect(passive).toMatchObject({ controllability: 'user', decision: { state: 'enabled' } });
    expect(automaticNpEffect).toMatchObject({
      outcome: 'applied',
      controllability: 'user',
      decision: { state: 'enabled' },
    });
    expect(mismatchedCardEffects).not.toHaveLength(0);
    expect(mismatchedCardEffects.every((effect) => effect.visibility === 'hidden')).toBe(true);

    const skyScenario = applyEffectProjectionDecision(scenario, sky, true);
    const earthScenario = applyEffectProjectionDecision(scenario, earth, true);
    for (const [selected, selectedScenario] of [
      [sky, skyScenario],
      [earth, earthScenario],
    ] as const) {
      const calculation = calculateScenario(selectedScenario, master, versions);
      expect(calculation.result.status).toBe('calculated');
      if (calculation.result.status !== 'calculated')
        throw new Error('Dante selected realm must calculate');
      expect(calculation.result.rows[0].average).toBeCloseTo(45_629.59);
      expect(calculation.input.powerMod).toBe(0.5);
      expect(calculation.input.target.traits).toEqual([]);
      expect(calculation.input.target.attribute).toBe(selected === sky ? 'sky' : 'earth');
      expect(calculation.input.fieldTraits).toEqual([
        selected === sky ? 'fieldHeaven' : 'fieldHell',
      ]);
      expect(
        calculation.result.trace.some(
          (entry) =>
            entry.step === 'user-decision' && entry.detail.includes(selected.projectionKey),
        ),
      ).toBe(true);
      expect(
        calculation.result.trace.some(
          (entry) =>
            entry.step === 'beforeNpDamage:addModifier' &&
            entry.detail.includes(`${selected.projectionKey}:modifier:powerMod:applied`),
        ),
      ).toBe(true);
      expect(
        calculation.effects.filter(
          (effect) => effect.label.startsWith('威力アップ・対') && effect.outcome === 'applied',
        ),
      ).toEqual([expect.objectContaining({ projectionKey: selected.projectionKey })]);
    }

    const conflict = calculateScenario(
      {
        ...scenario,
        ...applyEffectProjectionDecision(skyScenario, earth, true),
      },
      master,
      versions,
    );
    expect(conflict.result.status).toBe('unsupported');
    expect(conflict.input.powerMod).toBe(0);
    expect(conflict.input.fieldTraits).toEqual([]);
    expect(conflict.effectWarnings).toEqual(
      expect.arrayContaining([expect.stringContaining('constraintConflict:')]),
    );

    const earthAfterConflict = calculateScenario(
      applyEffectProjectionDecision(
        applyEffectProjectionDecision(skyScenario, earth, true),
        sky,
        false,
      ),
      master,
      versions,
    );
    expect(earthAfterConflict.result.status).toBe('calculated');
    expect(earthAfterConflict.input.powerMod).toBe(0.5);
    expect(earthAfterConflict.effects.find((effect) => effect.label === sky.label)).toMatchObject({
      outcome: 'notApplied',
      visibility: 'visible',
      controllability: 'user',
      explanation: { code: 'disabled' },
    });
    expect(earthAfterConflict.effects.find((effect) => effect.label === earth.label)).toMatchObject(
      {
        outcome: 'applied',
      },
    );

    for (const [attribute, fieldFact, selected, rejectedLabel] of [
      [
        'sky',
        {
          decisionKey: 'world:heaven',
          fact: {
            kind: 'trait' as const,
            scope: 'field' as const,
            trait: 'fieldHeaven',
            present: true,
          },
        },
        earthScenario,
        '威力アップ・対 地の力',
      ],
      [
        'earth',
        {
          decisionKey: 'world:hell',
          fact: {
            kind: 'trait' as const,
            scope: 'field' as const,
            trait: 'fieldHell',
            present: true,
          },
        },
        skyScenario,
        '威力アップ・対 天の力',
      ],
    ] as const) {
      const crossDomainConflict = calculateScenario(
        {
          ...selected,
          targetContext: {
            ...selected.targetContext,
            attribute: { kind: 'concrete', attribute },
          },
          worldFactAssertions: [fieldFact],
        },
        master,
        versions,
      );
      expect(crossDomainConflict.result.status).toBe('unsupported');
      expect(crossDomainConflict.effectWarnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('invalidTargetContext:noSatisfiableTarget'),
        ]),
      );
      expect(
        crossDomainConflict.effects.find((effect) => effect.label === rejectedLabel)?.outcome,
      ).not.toBe('applied');
      expect(
        crossDomainConflict.effects.filter(
          (effect) => effect.label.startsWith('威力アップ・対') && effect.outcome === 'applied',
        ),
      ).toHaveLength(0);
      expect(crossDomainConflict.input.powerMod).toBe(0);
    }

    for (const [attribute, fieldFact, selected, acceptedLabel] of [
      [
        'sky',
        {
          decisionKey: 'world:heaven',
          fact: {
            kind: 'trait' as const,
            scope: 'field' as const,
            trait: 'fieldHeaven',
            present: true,
          },
        },
        skyScenario,
        '威力アップ・対 天の力',
      ],
      [
        'earth',
        {
          decisionKey: 'world:hell',
          fact: {
            kind: 'trait' as const,
            scope: 'field' as const,
            trait: 'fieldHell',
            present: true,
          },
        },
        earthScenario,
        '威力アップ・対 地の力',
      ],
    ] as const) {
      const compatible = calculateScenario(
        {
          ...selected,
          targetContext: {
            ...selected.targetContext,
            attribute: { kind: 'concrete', attribute },
          },
          worldFactAssertions: [fieldFact],
        },
        master,
        versions,
      );
      expect(compatible.result.status).toBe('calculated');
      expect(compatible.input.powerMod).toBe(0.5);
      expect(compatible.effects.find((effect) => effect.label === acceptedLabel)?.outcome).toBe(
        'applied',
      );
    }
  });

  it('commits production attacker-skill mutations only when their source is used', async () => {
    const master = await loadProductionMaster();
    const versions: VersionContext = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    };

    const gareth = master.servants.find((candidate) => candidate.id === '105400')!;
    const garethScenario = createDefaultResolvedScenario(master, undefined, gareth);
    const garethInitial = calculateScenario(garethScenario, master, versions);
    const sunlightPower = garethInitial.effects.find(
      (effect) =>
        effect.label === '攻撃力アップ' &&
        effect.explanation.condition?.kind === 'any' &&
        effect.explanation.condition.expressions.some(
          (condition) => condition.kind === 'trait' && condition.trait === 'fieldSunlight',
        ),
    )!;
    expect(sunlightPower.activationSources).toEqual([
      expect.objectContaining({ origin: 'attacker', skillId: '2109451' }),
    ]);
    expect(garethInitial.input.fieldTraits).toEqual([]);
    expect(
      garethInitial.effects.find((effect) => effect.label === 'フィールドセット〔陽射し〕'),
    ).toMatchObject({ visibility: 'hidden', outcome: 'notApplied' });

    const garethPresentationScenario = applyEffectPresentationDecision(
      garethScenario,
      sunlightPower,
      true,
      garethInitial.effects,
    );
    const garethSelected = calculateScenario(garethPresentationScenario, master, versions);
    expect(garethSelected.result.status).toBe('calculated');
    expect(garethSelected.input.fieldTraits).toEqual(['fieldSunlight']);
    expect(garethSelected.input.attackBuff).toBeCloseTo(0.3);
    expect(
      garethSelected.effects.find((effect) => effect.projectionKey === sunlightPower.projectionKey),
    ).toMatchObject({ controllability: 'user', decision: { state: 'enabled' } });
    expect(
      garethSelected.effects.find((effect) => effect.label === 'フィールドセット〔陽射し〕'),
    ).toMatchObject({ visibility: 'hidden', outcome: 'applied' });

    const tezcatlipoca = master.servants.find((candidate) => candidate.id === '604700')!;
    const tezcatlipocaScenario = {
      ...createDefaultResolvedScenario(master, undefined, tezcatlipoca),
      worldFactAssertions: [
        {
          decisionKey: 'world:field:sunlight',
          fact: {
            kind: 'trait' as const,
            scope: 'field' as const,
            trait: 'fieldSunlight',
            present: true,
          },
        },
      ],
    };
    const tezcatlipocaInitial = calculateScenario(tezcatlipocaScenario, master, versions);
    const arts = tezcatlipocaInitial.effects.find(
      (effect) => effect.label === 'アーツアップ' && effect.source.skillId === '2178550',
    )!;
    expect(tezcatlipocaInitial.input.fieldTraits).toEqual(['fieldSunlight']);
    expect(
      tezcatlipocaInitial.effects.find(
        (effect) => effect.label === 'フィールド特性打ち消し〔陽射し〕',
      ),
    ).toMatchObject({ visibility: 'hidden', outcome: 'notApplied' });

    const tezcatlipocaSelected = calculateScenario(
      applyEffectPresentationDecision(
        tezcatlipocaScenario,
        arts,
        true,
        tezcatlipocaInitial.effects,
      ),
      master,
      versions,
    );
    expect(tezcatlipocaSelected.result.status).toBe('calculated');
    expect(tezcatlipocaSelected.input.fieldTraits).toEqual([]);
    expect(
      tezcatlipocaSelected.effects.find(
        (effect) => effect.label === 'フィールド特性打ち消し〔陽射し〕',
      ),
    ).toMatchObject({ visibility: 'hidden', outcome: 'applied' });

    const ereshkigal = master.servants.find((candidate) => candidate.id === '303200')!;
    const ereshkigalCalculation = calculateScenario(
      createDefaultResolvedScenario(master, undefined, ereshkigal),
      master,
      versions,
    );
    expect(ereshkigalCalculation.result.status).toBe('calculated');
    expect(ereshkigalCalculation.input.attackerStateTraits).not.toContain('blessedByKur');
    expect(
      ereshkigalCalculation.effects.find((effect) => effect.label === '冥界の護り'),
    ).toMatchObject({ visibility: 'hidden', outcome: 'notApplied' });
  });

  it('ratchets attacker-skill context mutation decision reachability across production master', async () => {
    const master = await loadProductionMaster();
    const versions: VersionContext = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    };
    const mutationKeys: string[] = [];
    const reachableKeys = new Set<string>();
    const ambiguousActivationDependencies: string[] = [];
    const missingSelectedSources: string[] = [];
    const staleDeselectedSources: string[] = [];
    let rawFieldMutationCount = 0;
    let rawRecipientMutationCount = 0;

    for (const servant of master.servants) {
      for (const effect of servant.skills.flatMap((skill) => skill.effects)) {
        if (
          effect.execution.some(
            (operation) =>
              operation.kind === 'contextMutation' &&
              operation.mutation !== 'addQuantity' &&
              operation.scope === 'field',
          )
        )
          rawFieldMutationCount += 1;
        if (
          effect.execution.some(
            (operation) =>
              operation.kind === 'contextMutation' &&
              operation.mutation !== 'addQuantity' &&
              operation.scope === 'recipientState',
          )
        )
          rawRecipientMutationCount += 1;
      }
      let scenario: ReturnType<typeof createDefaultResolvedScenario>;
      try {
        scenario = createDefaultResolvedScenario(master, undefined, servant);
      } catch {
        continue;
      }
      const initial = calculateScenario(scenario, master, versions);
      const rawMutationKeys = new Set(
        servant.skills.flatMap((skill) =>
          skill.effects.flatMap((effect) =>
            effect.execution.some((operation) => operation.kind === 'contextMutation')
              ? effect.execution.some(
                  (operation) =>
                    operation.kind === 'contextMutation' && operation.mutation !== 'addQuantity',
                )
                ? [`${skill.id}:${effect.occurrenceId}`]
                : []
              : [],
          ),
        ),
      );
      const mutations = initial.effects.filter(
        (effect) =>
          effect.source.origin === 'attacker' &&
          effect.modifier === null &&
          rawMutationKeys.has(`${effect.source.skillId}:${effect.source.effectOccurrenceId}`),
      );
      for (const mutation of mutations) {
        const key = `${servant.id}:${mutation.source.skillId}:${mutation.source.effectOccurrenceId}`;
        mutationKeys.push(key);
        expect(mutation, key).toMatchObject({ visibility: 'hidden', outcome: 'notApplied' });
      }
      for (const projection of initial.effects.filter(
        (effect) => effect.visibility === 'visible' && effect.controllability === 'user',
      )) {
        const control = initial.effectControls.find(
          (candidate) => candidate.projection.projectionKey === projection.projectionKey,
        );
        if (!control) throw new Error(`effect_control_missing:${projection.projectionKey}`);
        if (projection.activationSources.length > 1)
          ambiguousActivationDependencies.push(
            `${servant.id}:${projection.projectionKey}:${projection.activationSources
              .map((source) => `${source.origin}:${source.skillId}`)
              .join(',')}`,
          );
        const selected = calculateScenario(
          applyEffectControlPresentationDecision(
            scenario,
            control,
            true,
            initial.effects,
            initial.effectInputs,
          ),
          master,
          versions,
        );
        for (const source of projection.activationSources) {
          if (!rawMutationKeys.has(`${source.skillId}:${source.effectOccurrenceId}`)) continue;
          const sourceEnabled = selected.effects.some(
            (effect) =>
              effect.source.origin === source.origin &&
              effect.source.sourceInstanceId === source.sourceInstanceId &&
              effect.source.skillId === source.skillId &&
              effect.source.effectOccurrenceId === source.effectOccurrenceId &&
              effect.explanation.code !== 'disabled',
          );
          if (!sourceEnabled)
            missingSelectedSources.push(
              `${servant.id}:${projection.projectionKey}:${source.skillId}:${source.effectOccurrenceId}`,
            );
        }
        for (const mutation of selected.effects.filter(
          (effect) =>
            effect.source.origin === 'attacker' &&
            effect.modifier === null &&
            effect.outcome === 'applied' &&
            rawMutationKeys.has(`${effect.source.skillId}:${effect.source.effectOccurrenceId}`),
        ))
          reachableKeys.add(
            `${servant.id}:${mutation.source.skillId}:${mutation.source.effectOccurrenceId}`,
          );
        const selectedScenario = applyEffectControlPresentationDecision(
          scenario,
          control,
          true,
          initial.effects,
          initial.effectInputs,
        );
        const selectedControl = selected.effectControls.find(
          (candidate) => candidate.projection.projectionKey === projection.projectionKey,
        );
        if (!selectedControl)
          throw new Error(`selected_effect_control_missing:${projection.projectionKey}`);
        const deselectedScenario = applyEffectControlPresentationDecision(
          selectedScenario,
          selectedControl,
          false,
          selected.effects,
          selected.effectInputs,
        );
        const deselected = calculateScenario(deselectedScenario, master, versions);
        for (const source of projection.activationSources) {
          if (!rawMutationKeys.has(`${source.skillId}:${source.effectOccurrenceId}`)) continue;
          const sourceStillApplied = deselected.effects.some(
            (effect) =>
              effect.source.origin === source.origin &&
              effect.source.sourceInstanceId === source.sourceInstanceId &&
              effect.source.skillId === source.skillId &&
              effect.source.effectOccurrenceId === source.effectOccurrenceId &&
              effect.outcome === 'applied',
          );
          const neededByAnotherIncludedEffect = deselected.effects.some((effect) => {
            const effectDecision = effect.decision;
            if (
              effect.projectionKey === projection.projectionKey ||
              effect.visibility !== 'visible' ||
              !effect.activationSources.some(
                (candidate) =>
                  candidate.origin === source.origin &&
                  candidate.sourceInstanceId === source.sourceInstanceId &&
                  candidate.skillId === source.skillId &&
                  candidate.effectOccurrenceId === source.effectOccurrenceId,
              ) ||
              effectDecision.state === 'none' ||
              effectDecision.kind !== 'effect'
            )
              return false;
            const decision = deselectedScenario.effectDecisions.find(
              (candidate) => candidate.decisionKey === effectDecision.decisionKey,
            );
            return decision?.operationEnabled ?? effectDecision.plan.activation === 'automatic';
          });
          if (sourceStillApplied && !neededByAnotherIncludedEffect)
            staleDeselectedSources.push(
              `${servant.id}:${projection.projectionKey}:${source.skillId}:${source.effectOccurrenceId}`,
            );
        }
      }
    }

    const unreachableKeys = mutationKeys
      .filter((key) => !reachableKeys.has(key))
      .sort((left, right) => left.localeCompare(right));
    expect(rawFieldMutationCount).toBe(15);
    expect(rawRecipientMutationCount).toBe(17);
    expect(mutationKeys).toHaveLength(26);
    expect(reachableKeys.size).toBe(17);
    expect(unreachableKeys).toEqual([
      '1101500:2180550:20766:0',
      '1101500:2180550:8691:0',
      '203400:2242450:21097:0',
      '2800500:2184550:8412:0',
      '303200:433650:2065:0',
      '304000:670450:8412:0',
      '505100:2075650:3767:0',
      '505100:2075650:8411:0',
      '505100:2075650:8412:0',
    ]);
    expect(ambiguousActivationDependencies).toEqual([]);
    expect(missingSelectedSources).toEqual([]);
    expect(staleDeselectedSources).toEqual([]);
  }, 60_000);
});
