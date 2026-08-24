import type { ServantMaster } from '@fgo-lab/master-data';
import type { SupportEffect, SupportTemplate } from '@fgo-lab/schema';

export interface SupportSourceGroup {
  sourceInstanceId: string;
  sourceId: string;
  ownership: SupportEffect['ownership'];
  effects: SupportEffect[];
}

export function createServantMap(servants: readonly ServantMaster[]) {
  return new Map(servants.map((servant) => [servant.id, servant]));
}

export function groupSupportSources(template: SupportTemplate): SupportSourceGroup[] {
  const groups = new Map<string, SupportSourceGroup>();
  for (const effect of [...template.effects].sort((left, right) => left.order - right.order)) {
    const current = groups.get(effect.sourceInstanceId);
    if (current) current.effects.push(effect);
    else
      groups.set(effect.sourceInstanceId, {
        sourceInstanceId: effect.sourceInstanceId,
        sourceId: effect.sourceId,
        ownership: effect.ownership,
        effects: [effect],
      });
  }
  return [...groups.values()];
}

export function supportTemplateSearchText(
  template: SupportTemplate,
  servantById: ReadonlyMap<string, ServantMaster>,
) {
  return [
    template.name,
    ...template.effects.flatMap((effect) => {
      const servant = servantById.get(effect.sourceId);
      const skill = servant?.skills.find((candidate) => candidate.id === effect.effectId);
      return [servant?.name, skill?.name, ...(skill?.effects.map((item) => item.label) ?? [])];
    }),
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('ja');
}

export function relativeSupportUsage(value: string | null): string {
  if (!value) return '未使用';
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
  if (days === 0) return '今日使用';
  if (days === 1) return '昨日使用';
  if (days < 30) return `${String(days)}日前使用`;
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' }).format(
    new Date(value),
  );
}

export function supportSkillSummary(servant: ServantMaster | undefined, effectId: string) {
  const skill = servant?.skills.find((candidate) => candidate.id === effectId);
  return (skill?.effects ?? [])
    .map((effect) => effect.label)
    .filter((label, index, labels) => labels.indexOf(label) === index)
    .join('・');
}
