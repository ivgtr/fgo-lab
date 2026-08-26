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
