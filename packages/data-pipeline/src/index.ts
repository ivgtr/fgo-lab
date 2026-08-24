import { createHash } from 'node:crypto';
import type { MasterDataSnapshot, MasterManifest } from '@fgo-lab/master-data';
import {
  masterManifestSchema,
  masterSnapshotSchema,
  validateMasterSnapshot,
} from '@fgo-lab/master-data';

export function sha256(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex');
}
export interface FileArtifact {
  key: string;
  file: string;
  content: string;
  required: boolean;
}
export function createManifest(input: {
  masterDataVersion: string;
  createdAt: string;
  retrievedAt: string;
  minimalAppVersion: string;
  artifactKind: 'production' | 'diagnostic';
  imagesEnabled: boolean;
  files: readonly FileArtifact[];
}): MasterManifest {
  return masterManifestSchema.parse({
    manifestVersion: 1,
    masterDataVersion: input.masterDataVersion,
    createdAt: input.createdAt,
    source: { name: 'Atlas Academy', region: 'JP', retrievedAt: input.retrievedAt },
    minimalAppVersion: input.minimalAppVersion,
    schemaVersion: 1,
    artifactKind: input.artifactKind,
    imagesEnabled: input.imagesEnabled,
    files: input.files.map((file) => ({
      key: file.key,
      file: file.file,
      bytes: Buffer.byteLength(file.content),
      sha256: sha256(file.content),
      required: file.required,
    })),
  });
}
export interface AtlasFunctionInventory {
  attackEntries: number;
  counts: Record<string, number>;
  unknown: string[];
}
const ATTACK_TYPES = new Set([
  'damageNp',
  'damageNpIndividual',
  'damageNpPierce',
  'damageNpIndividualSum',
  'damageNpStateIndividualFix',
  'damageNpHpratioLow',
  'damageNpBattlePointPhase',
  'damageNpRare',
  'damageNpAndOrCheckIndividuality',
]);
export function inventoryAtlasAttackFunctions(
  servants: readonly unknown[],
): AtlasFunctionInventory {
  const counts: Record<string, number> = {};
  for (const value of servants) {
    if (!value || typeof value !== 'object') continue;
    const nps = (value as { noblePhantasms?: unknown }).noblePhantasms;
    if (!Array.isArray(nps)) continue;
    for (const np of nps) {
      if (!np || typeof np !== 'object') continue;
      const functions = (np as { functions?: unknown }).functions;
      if (!Array.isArray(functions)) continue;
      for (const fn of functions) {
        if (!fn || typeof fn !== 'object') continue;
        const type = (fn as { funcType?: unknown }).funcType;
        if (typeof type === 'string' && type.startsWith('damageNp'))
          counts[type] = (counts[type] ?? 0) + 1;
      }
    }
  }
  const unknown = Object.keys(counts)
    .filter((type) => !ATTACK_TYPES.has(type))
    .sort();
  return {
    attackEntries: Object.values(counts).reduce((sum, count) => sum + count, 0),
    counts: Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))),
    unknown,
  };
}
export function validatePublishedArtifact(
  manifestValue: unknown,
  files: Readonly<Record<string, string>>,
) {
  const manifest = masterManifestSchema.parse(manifestValue);
  const errors: string[] = [];
  for (const file of manifest.files) {
    const content = files[file.file];
    if (content === undefined) {
      if (file.required) errors.push(`missing:${file.file}`);
      continue;
    }
    if (Buffer.byteLength(content) !== file.bytes) errors.push(`bytes:${file.file}`);
    if (sha256(content) !== file.sha256) errors.push(`sha256:${file.file}`);
    if (file.key === 'master') {
      try {
        const report = validateMasterSnapshot(JSON.parse(content));
        errors.push(
          ...report.errors.map((error) => `schema:${error}`),
          ...report.unknownAttackFunctions.map((type) => `unknown:${type}`),
        );
      } catch {
        errors.push(`json:${file.file}`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

type AtlasMaterialStep = Record<
  string,
  { items?: { item?: { id?: number }; amount?: number }[]; qp?: number }
>;
type AtlasServant = {
  id?: number;
  collectionNo?: number;
  type?: string;
  name?: string;
  className?: string;
  rarity?: number;
  atkGrowth?: number[];
  traits?: { name?: string }[];
  skills?: {
    id?: number;
    name?: string;
    detail?: string;
    icon?: string;
    functions?: {
      funcId?: number;
      funcType?: string;
      funcTargetType?: string;
      funcPopupText?: string;
      svals?: { Value?: number; Rate?: number }[];
    }[];
  }[];
  noblePhantasms?: AtlasNp[];
  extraAssets?: { faces?: { ascension?: Record<string, string> } };
  ascensionMaterials?: AtlasMaterialStep;
  skillMaterials?: AtlasMaterialStep;
  appendSkillMaterials?: AtlasMaterialStep;
};
type AtlasNp = {
  card?: string;
  priority?: number;
  functions?: { funcType?: string; funcTargetType?: string; svals?: { Value?: number }[] }[];
};
type AtlasEquip = {
  id?: number;
  collectionNo?: number;
  name?: string;
  lvMax?: number;
  atkBase?: number;
  atkMax?: number;
  extraAssets?: { equipFace?: { equip?: Record<string, string> } };
};
type AtlasItem = {
  id?: number;
  name?: string;
  type?: string;
  priority?: number;
  icon?: string;
  uses?: string[];
};
const cardMap: Record<string, 'buster' | 'arts' | 'quick'> = { 1: 'quick', 2: 'buster', 3: 'arts' };

function growthSteps(source: AtlasMaterialStep | undefined, prefix: string, repeat = 1) {
  const result: { from: string; to: string; materialId: string; amount: number; qp: number }[] = [];
  if (!source) return result;
  for (const [level, step] of Object.entries(source)) {
    const from = Number(level);
    if (!Number.isInteger(from)) continue;
    for (let slot = 1; slot <= repeat; slot += 1)
      for (const item of step.items ?? []) {
        if (typeof item.item?.id !== 'number' || typeof item.amount !== 'number') continue;
        result.push({
          from: `${prefix}:${String(slot)}:${String(from)}`,
          to: `${prefix}:${String(slot)}:${String(from + 1)}`,
          materialId: String(item.item.id),
          amount: item.amount,
          qp: step.qp ?? 0,
        });
      }
  }
  return result;
}
export function normalizeAtlasSnapshot(input: {
  version: string;
  servants: unknown;
  equips: unknown;
  items: unknown;
}): MasterDataSnapshot {
  if (!Array.isArray(input.servants) || !Array.isArray(input.equips) || !Array.isArray(input.items))
    throw new TypeError('atlas_exports_must_be_arrays');
  const servants = (input.servants as AtlasServant[]).flatMap((servant) => {
    if (!servant.collectionNo || !['normal', 'heroine'].includes(servant.type ?? '')) return [];
    const attacks = (servant.noblePhantasms ?? [])
      .flatMap((np) =>
        (np.functions ?? [])
          .filter((fn) => typeof fn.funcType === 'string' && fn.funcType.startsWith('damageNp'))
          .map((fn) => ({ np, fn })),
      )
      .sort((a, b) => (b.np.priority ?? 0) - (a.np.priority ?? 0));
    const attack = attacks[0];
    if (
      typeof servant.id !== 'number' ||
      !servant.name ||
      !servant.className ||
      typeof servant.rarity !== 'number'
    )
      return [];
    const values = attack?.fn.svals?.slice(0, 5).map((value) => (value.Value ?? 0) / 10);
    const hasAttackNp = Boolean(
      attack && values && values.length === 5 && values.every((value) => value > 0),
    );
    const npMultipliers = hasAttackNp
      ? (values as [number, number, number, number, number])
      : ([0, 0, 0, 0, 0] as const);
    const representativeNp = attack?.np ?? servant.noblePhantasms?.[0];
    const image = servant.extraAssets?.faces?.ascension?.['1'] ?? null;
    return [
      {
        id: String(servant.id),
        name: servant.name,
        classId: servant.className,
        rarity: servant.rarity,
        hasAttackNp,
        npCard: cardMap[representativeNp?.card ?? ''] ?? 'buster',
        npTarget: attack?.fn.funcTargetType === 'enemyAll' ? 'all' : 'single',
        atkByLevel: Object.fromEntries(
          (servant.atkGrowth ?? []).map((atk, index) => [String(index + 1), atk]),
        ),
        npMultipliers,
        attackNpFunctionType: attack?.fn.funcType ?? 'none',
        traits: (servant.traits ?? []).flatMap((trait) => (trait.name ? [trait.name] : [])),
        imageKey: image,
        skills: (servant.skills ?? []).flatMap((skill) =>
          typeof skill.id === 'number' && skill.name
            ? [
                {
                  id: String(skill.id),
                  name: skill.name,
                  detail: skill.detail ?? '',
                  imageKey: skill.icon ?? null,
                  effects: (skill.functions ?? []).flatMap((fn) =>
                    typeof fn.funcId === 'number'
                      ? [
                          {
                            id: String(fn.funcId),
                            type: fn.funcType ?? 'unknown',
                            target: fn.funcTargetType ?? 'unknown',
                            label: fn.funcPopupText ?? fn.funcType ?? '効果',
                            values: (fn.svals ?? [])
                              .slice(0, 10)
                              .map((value) => value.Value ?? value.Rate ?? 0),
                          },
                        ]
                      : [],
                  ),
                },
              ]
            : [],
        ),
        growth: [
          ...growthSteps(servant.ascensionMaterials, 'ascension'),
          ...growthSteps(servant.skillMaterials, 'skill', 3),
          ...growthSteps(servant.appendSkillMaterials, 'append', 5),
        ],
      },
    ];
  });
  const craftEssences = (input.equips as AtlasEquip[]).flatMap((equip) => {
    if (
      !equip.collectionNo ||
      typeof equip.id !== 'number' ||
      !equip.name ||
      typeof equip.lvMax !== 'number'
    )
      return [];
    const initial = Math.min(20, equip.lvMax);
    const increment = (equip.lvMax - initial) / 4;
    return [
      {
        id: String(equip.id),
        name: equip.name,
        maxLevelByLimitBreak: [0, 1, 2, 3, 4].map((index) =>
          Math.round(initial + increment * index),
        ) as [number, number, number, number, number],
        atkMin: equip.atkBase ?? 0,
        atkMax: equip.atkMax ?? 0,
        imageKey: equip.extraAssets?.equipFace?.equip?.[String(equip.id)] ?? null,
      },
    ];
  });
  const materials = (input.items as AtlasItem[]).flatMap((item) =>
    typeof item.id === 'number' &&
    item.name &&
    item.uses?.some((use) => ['ascension', 'skill', 'appendSkill'].includes(use))
      ? [
          {
            id: String(item.id),
            name: item.name,
            category: item.type ?? 'material',
            sortOrder: item.priority ?? item.id,
            imageKey: item.icon ?? null,
          },
        ]
      : [],
  );
  return masterSnapshotSchema.parse({ version: input.version, servants, craftEssences, materials });
}
