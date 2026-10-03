import type { CraftEssenceMaster, MaterialMaster, ServantMaster } from '@fgo-lab/master-data';
import type {
  CraftEssenceCopy,
  LocalProfile,
  ProfileCollection,
  ServantBuild,
  ServantTarget,
  SupportEffectRef,
  SupportSkill,
  SupportTemplate,
} from '@fgo-lab/schema';
import { SCHEMA_VERSION } from '@fgo-lab/schema';

export interface Clock {
  now(): Date;
}
export interface IdGenerator {
  next(): string;
}
export type ProfileLoadResult =
  | { state: 'empty' }
  | { state: 'invalid'; reason: 'profile_parse_failed' }
  | {
      state: 'ready';
      collection: ProfileCollection;
    };
export interface ProfileRepository {
  load(): Promise<ProfileLoadResult>;
  clear(): Promise<void>;
  replace(
    collection: ProfileCollection,
    options?: ProfileWriteOptions,
  ): Promise<ProfileWriteResult>;
}
export type ProfileWriteGuard = { isCurrent: () => boolean; signal: AbortSignal };
export type ProfileWriteOptions = {
  guard?: ProfileWriteGuard;
  backup?: boolean;
  requireEmpty?: boolean;
};
export type ProfileWriteResult = { status: 'committed' } | { status: 'aborted'; reason: 'stale' };

export function createProfileCollection(
  name: string,
  clock: Clock,
  ids: IdGenerator,
): ProfileCollection {
  const profileId = ids.next();
  const timestamp = clock.now().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    activeProfileId: profileId,
    profiles: [
      {
        profileId,
        name,
        createdAt: timestamp,
        updatedAt: timestamp,
        servantBuilds: {},
        servantTargets: {},
        craftEssences: [],
        supportTemplates: [],
        draft: null,
        history: [],
      },
    ],
  };
}
export function activeProfile(collection: ProfileCollection): LocalProfile {
  const profile = collection.profiles.find(
    (candidate) => candidate.profileId === collection.activeProfileId,
  );
  if (!profile) throw new Error('active_profile_missing');
  return profile;
}
export function isOwned(build: ServantBuild | undefined): boolean {
  return (build?.npLevel ?? 0) >= 1;
}
export function updateServantBuild(
  profile: LocalProfile,
  servantId: string,
  patch: Partial<Omit<ServantBuild, 'servantId' | 'updatedAt'>>,
  now: string,
): LocalProfile {
  const current = profile.servantBuilds[servantId] ?? {
    servantId,
    level: 1,
    ascension: 0,
    npLevel: 0,
    fouAtk: 0,
    skills: {},
    appends: {},
    updatedAt: now,
  };
  return {
    ...profile,
    servantBuilds: {
      ...profile.servantBuilds,
      [servantId]: { ...current, ...patch, servantId, updatedAt: now },
    },
    updatedAt: now,
  };
}

export function updateServantTarget(
  profile: LocalProfile,
  servantId: string,
  patch: Partial<Omit<ServantTarget, 'servantId' | 'updatedAt'>>,
  now: string,
): LocalProfile {
  const build = profile.servantBuilds[servantId];
  const current = profile.servantTargets[servantId] ?? {
    servantId,
    level: build?.level ?? 1,
    ascension: build?.ascension ?? 0,
    fouAtk: build?.fouAtk ?? 0,
    skills: build?.skills ?? {},
    appends: build?.appends ?? {},
    planned: true,
    updatedAt: now,
  };
  return {
    ...profile,
    servantTargets: {
      ...profile.servantTargets,
      [servantId]: { ...current, ...patch, servantId, updatedAt: now },
    },
    updatedAt: now,
  };
}

export function addCraftEssenceCopy(
  profile: LocalProfile,
  craftEssenceId: string,
  copyId: string,
  now: string,
): LocalProfile {
  const copy: CraftEssenceCopy = {
    copyId,
    craftEssenceId,
    level: 1,
    limitBreak: 0,
    updatedAt: now,
  };
  return { ...profile, craftEssences: [...profile.craftEssences, copy], updatedAt: now };
}

export function removeCraftEssenceCopy(profile: LocalProfile, copyId: string): LocalProfile {
  return {
    ...profile,
    craftEssences: profile.craftEssences.filter((copy) => copy.copyId !== copyId),
  };
}

export function updateCraftEssenceCopy(
  profile: LocalProfile,
  master: CraftEssenceMaster,
  copyId: string,
  patch: Pick<Partial<CraftEssenceCopy>, 'level' | 'limitBreak'>,
  now: string,
): LocalProfile {
  return {
    ...profile,
    craftEssences: profile.craftEssences.map((copy) => {
      if (copy.copyId !== copyId) return copy;
      const limitBreak = patch.limitBreak ?? copy.limitBreak;
      const maximum = master.maxLevelByLimitBreak[limitBreak] ?? 100;
      return {
        ...copy,
        level: Math.min(patch.level ?? copy.level, maximum),
        limitBreak,
        updatedAt: now,
      };
    }),
    updatedAt: now,
  };
}

export function addSupportTemplate(
  profile: LocalProfile,
  masterDataVersion: string,
  templateId: string,
  now: string,
): LocalProfile {
  const template: SupportTemplate = {
    templateId,
    name: `支援条件 ${String(profile.supportTemplates.length + 1)}`,
    masterDataVersion,
    composition: { sources: [], effectInclusions: [] },
    updatedAt: now,
    lastUsedAt: null,
  };
  return {
    ...profile,
    supportTemplates: [...profile.supportTemplates, template],
    updatedAt: now,
  };
}

export function addSupportServant(
  profile: LocalProfile,
  templateId: string,
  source: ServantMaster,
  sourceInstanceId: string,
  skillLevels: Readonly<Record<string, number>>,
  now: string,
): LocalProfile {
  return {
    ...profile,
    supportTemplates: profile.supportTemplates.map((template) => {
      if (template.templateId !== templateId) return template;
      if (
        template.composition.sources.some(
          (candidate) => candidate.sourceInstanceId === sourceInstanceId,
        )
      )
        return template;
      const addition = {
        sourceInstanceId,
        servantId: source.id,
        skills: source.skills.map((skill) => ({
          skillId: skill.id,
          skillLevel: Math.min(10, Math.max(1, skillLevels[String(skill.slot)] ?? 10)),
          enabled: false,
        })),
      };
      return {
        ...template,
        composition: {
          ...template.composition,
          sources: [...template.composition.sources, addition],
        },
        updatedAt: now,
      };
    }),
    updatedAt: now,
  };
}

export function updateSupportTemplate(
  profile: LocalProfile,
  templateId: string,
  patch: Partial<Pick<SupportTemplate, 'name' | 'lastUsedAt' | 'composition'>>,
  now: string,
): LocalProfile {
  return {
    ...profile,
    supportTemplates: profile.supportTemplates.map((template) =>
      template.templateId === templateId ? { ...template, ...patch, updatedAt: now } : template,
    ),
    updatedAt: now,
  };
}

export function removeSupportTemplate(profile: LocalProfile, templateId: string): LocalProfile {
  return {
    ...profile,
    supportTemplates: profile.supportTemplates.filter(
      (template) => template.templateId !== templateId,
    ),
  };
}

export function removeSupportSource(
  profile: LocalProfile,
  templateId: string,
  sourceInstanceId: string,
  now: string,
): LocalProfile {
  return {
    ...profile,
    supportTemplates: profile.supportTemplates.map((template) =>
      template.templateId === templateId
        ? {
            ...template,
            composition: {
              sources: template.composition.sources.filter(
                (source) => source.sourceInstanceId !== sourceInstanceId,
              ),
              effectInclusions: template.composition.effectInclusions.filter(
                (effect) => effect.sourceInstanceId !== sourceInstanceId,
              ),
            },
            updatedAt: now,
          }
        : template,
    ),
    updatedAt: now,
  };
}

export function updateSupportSkill(
  profile: LocalProfile,
  templateId: string,
  sourceInstanceId: string,
  skillId: string,
  patch: Partial<Pick<SupportSkill, 'skillLevel' | 'enabled'>>,
  now: string,
): LocalProfile {
  return {
    ...profile,
    supportTemplates: profile.supportTemplates.map((template) =>
      template.templateId === templateId
        ? {
            ...template,
            composition: {
              ...template.composition,
              sources: template.composition.sources.map((source) =>
                source.sourceInstanceId === sourceInstanceId
                  ? {
                      ...source,
                      skills: source.skills.map((skill) =>
                        skill.skillId === skillId ? { ...skill, ...patch } : skill,
                      ),
                    }
                  : source,
              ),
            },
            updatedAt: now,
          }
        : template,
    ),
    updatedAt: now,
  };
}

export function toggleSupportEffect(
  profile: LocalProfile,
  templateId: string,
  effect: SupportEffectRef,
  selected: boolean,
  now: string,
): LocalProfile {
  return {
    ...profile,
    supportTemplates: profile.supportTemplates.map((template) =>
      template.templateId === templateId
        ? {
            ...template,
            composition: {
              ...template.composition,
              effectInclusions: selected
                ? template.composition.effectInclusions.filter(
                    (candidate) =>
                      candidate.sourceInstanceId !== effect.sourceInstanceId ||
                      candidate.skillId !== effect.skillId ||
                      candidate.effectId !== effect.effectId ||
                      candidate.effectOccurrenceId !== effect.effectOccurrenceId,
                  )
                : template.composition.effectInclusions.some(
                      (candidate) =>
                        candidate.sourceInstanceId === effect.sourceInstanceId &&
                        candidate.skillId === effect.skillId &&
                        candidate.effectId === effect.effectId &&
                        candidate.effectOccurrenceId === effect.effectOccurrenceId,
                    )
                  ? template.composition.effectInclusions
                  : [...template.composition.effectInclusions, { ...effect, included: false }],
            },
            updatedAt: now,
          }
        : template,
    ),
    updatedAt: now,
  };
}
export interface MaterialUsage {
  materialId: string;
  servantId: string;
  purpose: string;
  amount: number;
}
export interface MaterialLedgerEntry {
  material: MaterialMaster;
  amount: number;
  usages: MaterialUsage[];
}
export function calculateGrowthLedger(
  servants: readonly ServantMaster[],
  materials: readonly MaterialMaster[],
  current: Readonly<Record<string, ServantBuild>>,
  targets: Readonly<Record<string, ServantTarget>>,
): MaterialLedgerEntry[] {
  const usages: MaterialUsage[] = [];
  const qpTransitions = new Set<string>();
  for (const servant of servants) {
    const target = targets[servant.id];
    if (!target?.planned) continue;
    const build = current[servant.id];
    for (const step of servant.growth) {
      const [purpose, slot, fromRaw] = step.from.split(':');
      const toLevel = Number(step.to.split(':')[2]);
      const fromLevel = Number(fromRaw);
      if (!purpose || !slot || !Number.isInteger(fromLevel) || !Number.isInteger(toLevel)) continue;
      const currentLevel =
        purpose === 'ascension'
          ? (build?.ascension ?? 0)
          : purpose === 'append'
            ? (build?.appends[slot] ?? 0)
            : (build?.skills[slot] ?? 1);
      const targetLevel =
        purpose === 'ascension'
          ? target.ascension
          : purpose === 'append'
            ? (target.appends[slot] ?? 0)
            : (target.skills[slot] ?? 1);
      if (currentLevel <= fromLevel && targetLevel >= toLevel) {
        usages.push({
          materialId: step.materialId,
          servantId: servant.id,
          purpose: `${purpose}:${slot}`,
          amount: step.amount,
        });
        const transition = `${servant.id}:${step.from}:${step.to}`;
        if (step.qp > 0 && !qpTransitions.has(transition)) {
          qpTransitions.add(transition);
          usages.push({
            materialId: 'system:qp',
            servantId: servant.id,
            purpose: `${purpose}:${slot}:QP`,
            amount: step.qp,
          });
        }
      }
    }
  }
  const ledgerMaterials: MaterialMaster[] = [
    ...materials,
    {
      id: 'system:qp',
      name: 'QP',
      category: 'currency',
      sortOrder: Number.MAX_SAFE_INTEGER,
      imageKey: null,
    },
  ];
  return ledgerMaterials
    .map((material) => {
      const selected = usages.filter((usage) => usage.materialId === material.id);
      return {
        material,
        amount: selected.reduce((sum, usage) => sum + usage.amount, 0),
        usages: selected,
      };
    })
    .filter((entry) => entry.amount > 0);
}
export function filterAndSortLedger(
  entries: readonly MaterialLedgerEntry[],
  search: string,
  category: string,
  order: 'game' | 'amount' | 'name',
): MaterialLedgerEntry[] {
  const filtered = entries.filter(
    (entry) =>
      (category === 'all' || entry.material.category === category) &&
      entry.material.name.toLocaleLowerCase('ja').includes(search.toLocaleLowerCase('ja')),
  );
  return [...filtered].sort((a, b) =>
    order === 'amount'
      ? b.amount - a.amount
      : order === 'name'
        ? a.material.name.localeCompare(b.material.name, 'ja')
        : a.material.sortOrder - b.material.sortOrder,
  );
}
