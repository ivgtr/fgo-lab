import type { ServantMaster } from '@fgo-lab/master-data';
import type { AttackerSkillSelection, CalcInput, SupportTemplate } from '@fgo-lab/schema';

export type ResolvedBuffKind = 'attackBuff' | 'cardBuff' | 'npDamageBuff';

export interface ResolvedSupportEffect {
  origin: 'attacker' | 'support';
  sourceId: string;
  sourceName: string;
  skillId: string;
  skillName: string;
  effectId: string;
  label: string;
  value: number | null;
  kind: ResolvedBuffKind | null;
  applied: boolean;
  reason: string;
}

export interface ResolvedSupportTemplate {
  input: CalcInput;
  effects: ResolvedSupportEffect[];
  precision: 'exact' | 'approximate' | 'unsupported';
  warnings: string[];
}

interface SkillSelection {
  sourceId: string;
  skillId: string;
  skillLevel: number;
  enabled: boolean;
  order: number;
}

const CARD_LABELS: Record<string, CalcInput['cardType']> = {
  バスターアップ: 'buster',
  アーツアップ: 'arts',
  クイックアップ: 'quick',
};

const KNOWN_UNSUPPORTED_DAMAGE_LABELS = new Set([
  '宝具威力アップブースト',
  'イベント攻撃威力アップ',
]);

function buffKind(label: string): ResolvedBuffKind | null {
  if (label === '攻撃力アップ') return 'attackBuff';
  if (label === '宝具威力アップ') return 'npDamageBuff';
  if (label in CARD_LABELS) return 'cardBuff';
  return null;
}

function isPotentiallyDamageRelevant(label: string): boolean {
  return (
    KNOWN_UNSUPPORTED_DAMAGE_LABELS.has(label) ||
    label.includes('威力アップ') ||
    label.includes('特攻') ||
    label.includes('防御力ダウン') ||
    label.includes('耐性ダウン')
  );
}

function resolveSkillSelections(
  baseInput: CalcInput,
  selectedSkills: readonly SkillSelection[],
  servants: readonly ServantMaster[],
  origin: ResolvedSupportEffect['origin'],
): ResolvedSupportTemplate {
  const nextInput = { ...baseInput };
  const effects: ResolvedSupportEffect[] = [];
  const warnings: string[] = [];
  let precision: ResolvedSupportTemplate['precision'] = 'exact';
  const servantById = new Map(servants.map((servant) => [servant.id, servant]));

  for (const selected of [...selectedSkills].sort((a, b) => a.order - b.order)) {
    if (!selected.enabled) continue;
    const source = servantById.get(selected.sourceId);
    const skill = source?.skills.find((candidate) => candidate.id === selected.skillId);
    if (!source || !skill) {
      precision = 'unsupported';
      warnings.push(`${origin}_effect_missing:${selected.sourceId}:${selected.skillId}`);
      continue;
    }
    for (const effect of skill.effects) {
      const rawValue = effect.values[selected.skillLevel - 1];
      const kind = buffKind(effect.label);
      if (rawValue === undefined) {
        precision = 'unsupported';
        warnings.push(`${origin}_effect_level_missing:${source.id}:${skill.id}:${effect.id}`);
        effects.push({
          origin,
          sourceId: source.id,
          sourceName: source.name,
          skillId: skill.id,
          skillName: skill.name,
          effectId: effect.id,
          label: effect.label,
          value: null,
          kind,
          applied: false,
          reason: 'level_value_missing',
        });
        continue;
      }
      const value = rawValue / 1000;
      const cardType = CARD_LABELS[effect.label];
      if (kind === 'cardBuff' && cardType !== baseInput.cardType) {
        effects.push({
          origin,
          sourceId: source.id,
          sourceName: source.name,
          skillId: skill.id,
          skillName: skill.name,
          effectId: effect.id,
          label: effect.label,
          value,
          kind,
          applied: false,
          reason: 'card_type_mismatch',
        });
        continue;
      }
      if (kind) {
        nextInput[kind] += value;
        effects.push({
          origin,
          sourceId: source.id,
          sourceName: source.name,
          skillId: skill.id,
          skillName: skill.name,
          effectId: effect.id,
          label: effect.label,
          value,
          kind,
          applied: true,
          reason: 'unconditional_attacker_buff',
        });
        continue;
      }
      const damageRelevant = isPotentiallyDamageRelevant(effect.label);
      if (damageRelevant) {
        if (precision === 'exact') precision = 'approximate';
        warnings.push(`${origin}_effect_not_resolved:${source.id}:${skill.id}:${effect.id}`);
      }
      effects.push({
        origin,
        sourceId: source.id,
        sourceName: source.name,
        skillId: skill.id,
        skillName: skill.name,
        effectId: effect.id,
        label: effect.label,
        value,
        kind: null,
        applied: false,
        reason: damageRelevant ? 'damage_effect_not_supported' : 'not_np_damage_relevant',
      });
    }
  }

  return { input: nextInput, effects, precision, warnings };
}

export function resolveSupportTemplate(
  baseInput: CalcInput,
  template: SupportTemplate,
  servants: readonly ServantMaster[],
): ResolvedSupportTemplate {
  return resolveSkillSelections(
    baseInput,
    template.effects.map((effect) => ({
      sourceId: effect.sourceId,
      skillId: effect.effectId,
      skillLevel: effect.skillLevel,
      enabled: effect.enabled,
      order: effect.order,
    })),
    servants,
    'support',
  );
}

export function resolveAttackerSkills(
  baseInput: CalcInput,
  selections: readonly AttackerSkillSelection[],
  servants: readonly ServantMaster[],
): ResolvedSupportTemplate {
  return resolveSkillSelections(
    baseInput,
    selections.map((selection, order) => ({
      sourceId: baseInput.attackerId,
      skillId: selection.skillId,
      skillLevel: selection.skillLevel,
      enabled: selection.enabled,
      order,
    })),
    servants,
    'attacker',
  );
}
