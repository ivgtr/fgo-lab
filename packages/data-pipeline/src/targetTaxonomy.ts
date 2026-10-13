import type { AtlasServant } from './atlasContract';
import { portableSha256 } from './portableHash';

const CLASS_PREDICATES = {
  classSaber: 'saber',
  classArcher: 'archer',
  classLancer: 'lancer',
  classRider: 'rider',
  classCaster: 'caster',
  classAssassin: 'assassin',
  classBerserker: 'berserker',
  classShielder: 'shielder',
  classRuler: 'ruler',
  classAlterEgo: 'alterEgo',
  classAvenger: 'avenger',
  classMoonCancer: 'moonCancer',
  classForeigner: 'foreigner',
  classPretender: 'pretender',
  classBeastDraco: 'beast',
  classBeastEresh: 'beastEresh',
  classUnBeastOlgaMarie: 'unBeastOlgaMarie',
} as const;

const ATTRIBUTE_PREDICATES = {
  attributeHuman: 'man',
  attributeEarth: 'earth',
  attributeSky: 'sky',
  attributeStar: 'star',
  attributeBeast: 'beast',
} as const;

const FAMILY_PREDICATES = {
  classDemonGodPillar: 'demonGodPillar',
  classBeast: 'beast',
} as const;

export function canonicalTargetPredicate(name: string) {
  if (name in CLASS_PREDICATES)
    return {
      kind: 'classIdentity' as const,
      classId: CLASS_PREDICATES[name as keyof typeof CLASS_PREDICATES],
    };
  if (name in ATTRIBUTE_PREDICATES)
    return {
      kind: 'attributeIdentity' as const,
      attribute: ATTRIBUTE_PREDICATES[name as keyof typeof ATTRIBUTE_PREDICATES],
    };
  if (name in FAMILY_PREDICATES)
    return {
      kind: 'familyMembership' as const,
      familyId: FAMILY_PREDICATES[name as keyof typeof FAMILY_PREDICATES],
    };
  return null;
}

export function normalizeTargetSemantics(servants: readonly AtlasServant[]) {
  const familyEvidence = Object.entries(FAMILY_PREDICATES).map(([rawTrait, familyId]) => {
    const atlasTargets = servants.flatMap((servant) =>
      servant.id !== undefined &&
      servant.className &&
      servant.traits?.some((trait) => trait.name === rawTrait)
        ? [{ targetId: String(servant.id), rawClassName: servant.className }]
        : [],
    );
    return {
      familyId,
      atlasTargets,
      sourceDigest: portableSha256(JSON.stringify(atlasTargets)),
    };
  });
  return {
    execution: {
      classIdentities: Object.values(CLASS_PREDICATES),
      attributeIdentities: Object.values(ATTRIBUTE_PREDICATES),
      families: Object.values(FAMILY_PREDICATES).map((familyId) => ({
        familyId,
        membershipConstraints: { kind: 'independent' as const },
      })),
    },
    evidence: { families: familyEvidence },
  };
}
