import type { ServantMaster } from '@fgo-lab/master-data';
import type { SupportSource, SupportTemplate } from '@fgo-lab/schema';
import { isDamageRelevantEffect } from '@fgo-lab/effect-resolver';

export type SupportSourceGroup = SupportSource;

export function createServantMap(servants: readonly ServantMaster[]) {
  return new Map(servants.map((servant) => [servant.id, servant]));
}

export function groupSupportSources(template: SupportTemplate): SupportSourceGroup[] {
  return template.composition.sources;
}

export function supportTemplateSearchText(
  template: SupportTemplate,
  servantById: ReadonlyMap<string, ServantMaster>,
) {
  return [
    template.name,
    ...template.composition.sources.flatMap((source) => {
      const servant = servantById.get(source.servantId);
      return [
        servant?.name,
        ...source.skills.flatMap((selection) => {
          const skill = servant?.skills.find((candidate) => candidate.id === selection.skillId);
          return [skill?.name, ...(skill?.effects.map((item) => item.label) ?? [])];
        }),
      ];
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
    .filter(isDamageRelevantEffect)
    .map((effect) => effect.label)
    .filter((label, index, labels) => labels.indexOf(label) === index)
    .join('・');
}
