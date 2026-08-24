import type { CraftEssenceMaster, MaterialMaster, ServantMaster } from '@fgo-lab/master-data';
import type { LocalProfile, ProfileCollection, ServantBuild, ServantTarget } from '@fgo-lab/schema';

export interface Clock {
  now(): Date;
}
export interface IdGenerator {
  next(): string;
}
export interface ProfileRepository {
  load(): Promise<ProfileCollection | undefined>;
  replace(collection: ProfileCollection): Promise<void>;
}

export function createProfileCollection(
  name: string,
  clock: Clock,
  ids: IdGenerator,
): ProfileCollection {
  const profileId = ids.next();
  const timestamp = clock.now().toISOString();
  return {
    schemaVersion: 1,
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
export function defaultServantBuild(servantId: string, clock: Clock): ServantBuild {
  return {
    servantId,
    level: 1,
    ascension: 0,
    npLevel: 0,
    fouAtk: 0,
    skills: {},
    appends: {},
    updatedAt: clock.now().toISOString(),
  };
}
export function applyServantPatch(
  current: ServantBuild,
  patch: Partial<Omit<ServantBuild, 'servantId' | 'updatedAt'>>,
  clock: Clock,
): ServantBuild {
  return {
    ...current,
    ...patch,
    servantId: current.servantId,
    updatedAt: clock.now().toISOString(),
  };
}
export function validateCraftEssenceLevel(
  master: CraftEssenceMaster,
  level: number,
  limitBreak: number,
): boolean {
  const maximum = master.maxLevelByLimitBreak[limitBreak];
  return maximum !== undefined && Number.isInteger(level) && level >= 1 && level <= maximum;
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
