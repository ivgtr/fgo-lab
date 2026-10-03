import { z } from 'zod';

export const rankingNpLevelSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);
export const rankingNpBasisSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('specified'), npLevel: rankingNpLevelSchema }).strict(),
  z.object({ kind: z.literal('owned') }).strict(),
]);
export const initialOverchargeSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const selectionShape = {
  initialOvercharge: initialOverchargeSchema,
  population: z.enum(['all', 'owned']),
  levelBasis: z.enum(['naturalLimit', 'uniformLevel90', 'ownedLevel']),
  npLevelBasis: rankingNpBasisSchema,
  classAffinity: z.enum(['neutral', 'favorable']),
  selfBuffs: z.enum(['included', 'excluded']),
  conditionalEffects: z.enum(['baseline', 'satisfied']),
};

const resolvedBasisShape = {
  servantId: z.string().min(1),
  level: z.number().int().min(1).max(120),
  npLevel: rankingNpLevelSchema,
  initialOvercharge: initialOverchargeSchema,
};

export const rankingGrowthBasisSchema = z.enum(['common', 'saved']);
export const rankingSkillLevelsSchema = z.partialRecord(
  z.enum(['1', '2', '3']),
  z.number().int().min(1).max(10),
);
export const rankingSelectionSchema = z.discriminatedUnion('growthBasis', [
  z
    .object({ ...selectionShape, growthBasis: z.literal('common') })
    .strict()
    .refine(
      (selection) =>
        selection.population === 'owned' ||
        (selection.levelBasis !== 'ownedLevel' && selection.npLevelBasis.kind !== 'owned'),
      { message: 'ranking_owned_basis_requires_owned_population' },
    ),
  z
    .object({
      ...selectionShape,
      growthBasis: z.literal('saved'),
      population: z.literal('owned'),
      levelBasis: z.literal('ownedLevel'),
      npLevelBasis: z.object({ kind: z.literal('owned') }).strict(),
    })
    .strict(),
]);
export type RankingSelection = z.infer<typeof rankingSelectionSchema>;
export const resolvedRankingBasisSchema = z.discriminatedUnion('growthBasis', [
  z
    .object({
      ...resolvedBasisShape,
      growthBasis: z.literal('common'),
      levelSource: selectionShape.levelBasis,
      npSource: z.enum(['specified', 'owned']),
      fouAtk: z.literal(1000),
      skillLevels: rankingSkillLevelsSchema.refine(
        (levels) => Object.values(levels).every((level) => level === 10),
        { message: 'ranking_common_skill_level_must_be_ten' },
      ),
    })
    .strict(),
  z
    .object({
      ...resolvedBasisShape,
      growthBasis: z.literal('saved'),
      levelSource: z.literal('ownedLevel'),
      npSource: z.literal('owned'),
      fouAtk: z.number().int().min(0).max(3000),
      skillLevels: rankingSkillLevelsSchema,
    })
    .strict(),
]);
export type ResolvedRankingBasis = z.infer<typeof resolvedRankingBasisSchema>;
