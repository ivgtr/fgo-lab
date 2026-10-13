import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import {
  certifiedSourceVersion,
  normalizeAtlasSnapshot,
  normalizeCertifiedAtlasSnapshot,
  normalizeNiceCombatRules,
  normalizeRawCombatRules,
} from '@fgo-lab/data-pipeline';
import {
  sourceCertificateSchema,
  type AtlasExportKey,
  type SourceCertificate,
} from '@fgo-lab/master-data';
import { compareCombatRules } from './compareCombatRules';
import {
  compareJsonVocabulary,
  scanCapturedAtlasVocabulary,
  type JsonVocabulary,
} from './jsonVocabulary';
import { probeRawNiceGrowth } from './probeRawNiceGrowth';
import { probeRawNiceIdentity } from './probeRawNiceIdentity';
import { probeRawNiceMaterials } from './probeRawNiceMaterials';
import { probeRawNiceVocabulary } from './probeRawNiceVocabulary';
import { probeRawNiceFunctionValues } from './probeSkillValues';
import { attestReplayBytes } from './replayAttestation';
import { auditRawVocabulary } from './rawVocabulary';

const run = promisify(execFile);
const fullCommit = /^[a-f0-9]{40}$/;
const fullDigest = /^[a-f0-9]{64}$/;
const replayMarkerSchema = z.strictObject({
  format: z.literal('fgo-lab-atlas-replay-v1'),
  rawCommit: z.string().regex(/^[a-f0-9]{40}$/),
  exporterCommit: z.string().regex(/^[a-f0-9]{40}$/),
  referenceIds: z.array(z.number().int().positive()),
  result: z.strictObject({
    servants: z.number().int().nonnegative(),
    craftEssences: z.number().int().nonnegative(),
    references: z.number().int().nonnegative(),
    ignoredRawColumns: z.record(z.string(), z.array(z.string())),
  }),
});

async function git(repo: string, ...args: string[]): Promise<string> {
  const { stdout } = await run('git', ['-C', repo, ...args], { maxBuffer: 64 * 1024 * 1024 });
  return stdout.trimEnd();
}

async function jsonFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

function hash(body: string): string {
  return createHash('sha256').update(body).digest('hex');
}

export type CertificateEvidence = {
  rawVocabularyChanges: 0;
  jsonVocabularyChanges: 0;
  sourceBodies: number;
  classRuleCells: number;
  identityEntities: number;
  growthCells: number;
  materialSteps: number;
  skillValueCells: number;
  canonicalBytes: number;
};

export async function issueCandidateCertificate(input: {
  rawRepo: string;
  rawCommit: string;
  exporterRepo: string;
  exporterCommit: string;
  observedDirectory: string;
  replayDirectory: string;
  observedAt: string;
  publishedAt: string;
  publisherCommit: string;
  contractSha256: string;
  generation: number;
}): Promise<{ certificate: SourceCertificate; evidence: CertificateEvidence }> {
  for (const [label, value] of [
    ['raw', input.rawCommit],
    ['exporter', input.exporterCommit],
    ['publisher', input.publisherCommit],
  ] as const)
    if (!fullCommit.test(value)) throw new TypeError(`certificate_issuer:invalid_${label}_commit`);
  if (!fullDigest.test(input.contractSha256))
    throw new TypeError('certificate_issuer:invalid_contract_digest');
  if ((await git(input.rawRepo, 'rev-parse', 'HEAD')) !== input.rawCommit)
    throw new TypeError('certificate_issuer:raw_checkout_mismatch');
  if ((await git(input.exporterRepo, 'rev-parse', 'HEAD')) !== input.exporterCommit)
    throw new TypeError('certificate_issuer:exporter_checkout_mismatch');

  const replayMarker = replayMarkerSchema.parse(
    await jsonFile(join(input.replayDirectory, 'fgo-lab-replay.json')),
  );
  if (
    replayMarker.rawCommit !== input.rawCommit ||
    replayMarker.exporterCommit !== input.exporterCommit
  )
    throw new TypeError('certificate_issuer:replay_revision_mismatch');
  const replay = await attestReplayBytes({
    observedDirectory: input.observedDirectory,
    replayDirectory: input.replayDirectory,
  });
  if (
    JSON.stringify(replayMarker.referenceIds) !==
      JSON.stringify(replay.referencedSkills.map(({ id }) => id)) ||
    replayMarker.result.references !== replay.referencedSkills.length
  )
    throw new TypeError('certificate_issuer:replay_reference_mismatch');
  const rawVocabulary = await auditRawVocabulary({
    repo: input.rawRepo,
    revision: input.rawCommit,
    baselinePath: resolve(import.meta.dirname, '../baselines/raw-jp-0dc872.json'),
  });
  if (rawVocabulary.changes.length)
    throw new TypeError(
      `certificate_issuer:raw_vocabulary:${JSON.stringify(rawVocabulary.changes)}`,
    );
  const jsonVocabulary = await scanCapturedAtlasVocabulary(input.observedDirectory);
  const expectedJsonVocabulary = (await jsonFile(
    resolve(import.meta.dirname, '../baselines/nice-jp-20261013.json'),
  )) as JsonVocabulary;
  const jsonChanges = compareJsonVocabulary(expectedJsonVocabulary, jsonVocabulary);
  if (jsonChanges.length)
    throw new TypeError(`certificate_issuer:json_vocabulary:${JSON.stringify(jsonChanges)}`);

  const nice = new Map<AtlasExportKey, unknown>();
  for (const entry of replay.exports)
    nice.set(entry.key, await jsonFile(join(input.observedDirectory, `${entry.key}.json`)));
  const referenceMap = new Map<number, unknown>();
  for (const entry of replay.referencedSkills)
    referenceMap.set(
      entry.id,
      await jsonFile(
        join(input.observedDirectory, 'referenced_skills', `${String(entry.id)}.json`),
      ),
    );
  const n = (key: AtlasExportKey): unknown => nice.get(key);
  const raw = new Map<string, unknown>();
  async function table(name: string): Promise<unknown> {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name))
      throw new TypeError('certificate_issuer:invalid_raw_table');
    if (!raw.has(name))
      raw.set(
        name,
        JSON.parse(
          await git(input.rawRepo, 'show', `${input.rawCommit}:master/${name}.json`),
        ) as unknown,
      );
    return raw.get(name);
  }
  const [
    mstClass,
    mstClassRelation,
    mstAttriRelation,
    mstCard,
    mstConstant,
    mstSvt,
    mstSvtLimit,
    mstSvtExp,
    mstEquip,
    mstEquipSkill,
    mstItem,
    mstSvtSkill,
    mstSvtTreasureDevice,
    mstFunc,
    mstBuff,
    mstCombineLimit,
    mstCombineSkill,
    mstCombineAppendPassiveSkill,
    mstSkillLv,
    mstTreasureDeviceLv,
  ] = await Promise.all(
    [
      'mstClass',
      'mstClassRelation',
      'mstAttriRelation',
      'mstCard',
      'mstConstant',
      'mstSvt',
      'mstSvtLimit',
      'mstSvtExp',
      'mstEquip',
      'mstEquipSkill',
      'mstItem',
      'mstSvtSkill',
      'mstSvtTreasureDevice',
      'mstFunc',
      'mstBuff',
      'mstCombineLimit',
      'mstCombineSkill',
      'mstCombineAppendPassiveSkill',
      'mstSkillLv',
      'mstTreasureDeviceLv',
    ].map(table),
  );
  const rules = normalizeRawCombatRules({
    mstClass,
    mstClassRelation,
    mstAttriRelation,
    mstCard,
    mstConstant,
  });
  const classRules = compareCombatRules(rules, {
    classAttackRate: n('NiceClassAttackRate'),
    classRelation: n('NiceClassRelation'),
    attributeRelation: n('NiceAttributeRelation'),
    card: n('NiceCard'),
    constant: n('NiceConstant'),
  });
  const common = {
    niceServants: n('nice_servant'),
    niceCraftEssences: n('nice_equip'),
    niceMysticCodes: n('nice_mystic_code'),
    niceEnums: n('nice_enums'),
  };
  const identity = probeRawNiceIdentity({
    ...common,
    niceItems: n('nice_item'),
    rawServants: mstSvt,
    rawMysticCodes: mstEquip,
    rawMysticCodeSkills: mstEquipSkill,
    rawItems: mstItem,
    rawServantSkills: mstSvtSkill,
    rawServantNoblePhantasms: mstSvtTreasureDevice,
    rawFunctions: mstFunc,
  });
  probeRawNiceVocabulary({
    ...common,
    niceItems: n('nice_item'),
    rawServants: mstSvt,
    rawItems: mstItem,
    rawFunctions: mstFunc,
    rawBuffs: mstBuff,
  });
  const growth = probeRawNiceGrowth({
    ...common,
    rawServants: mstSvt,
    rawLimits: mstSvtLimit,
    rawExperience: mstSvtExp,
  });
  const materials = probeRawNiceMaterials({
    rawServants: mstSvt,
    rawItems: mstItem,
    rawCombineLimits: mstCombineLimit,
    rawCombineSkills: mstCombineSkill,
    rawCombineAppendSkills: mstCombineAppendPassiveSkill,
    niceServants: n('nice_servant'),
  });
  const skillValues = probeRawNiceFunctionValues({
    ...common,
    rawSkillLevels: mstSkillLv,
    rawNoblePhantasmLevels: mstTreasureDeviceLv,
    rawFunctions: mstFunc,
    niceReferencedSkills: [...referenceMap.values()],
  });

  const draft = sourceCertificateSchema.parse({
    format: 'fgo-lab-atlas-source-v1',
    region: 'JP',
    generation: input.generation,
    publishedAt: input.publishedAt,
    observedAt: input.observedAt,
    rawCommit: input.rawCommit,
    rawCommittedAt: new Date(
      await git(input.rawRepo, 'show', '-s', '--format=%cI', input.rawCommit),
    ).toISOString(),
    exporterCommit: input.exporterCommit,
    publisherCommit: input.publisherCommit,
    contractSha256: input.contractSha256,
    masterSchemaVersion: 57,
    canonicalSha256: '0'.repeat(64),
    exports: replay.exports,
    referencedSkills: replay.referencedSkills,
  });
  const master = normalizeAtlasSnapshot({
    version: certifiedSourceVersion(draft),
    combatRules: normalizeNiceCombatRules({
      classAttackRate: n('NiceClassAttackRate'),
      classRelation: n('NiceClassRelation'),
      attributeRelation: n('NiceAttributeRelation'),
      card: n('NiceCard'),
      constant: n('NiceConstant'),
    }),
    servants: n('nice_servant'),
    equips: n('nice_equip'),
    mysticCodes: n('nice_mystic_code'),
    items: n('nice_item'),
    battlePoints: n('nice_battle_point'),
    referencedSkills: [...referenceMap.values()],
  });
  const canonical = JSON.stringify(master);
  const certificate = sourceCertificateSchema.parse({
    ...draft,
    canonicalSha256: hash(canonical),
  });
  normalizeCertifiedAtlasSnapshot({ certificate, exports: nice, referencedSkills: referenceMap });
  return {
    certificate,
    evidence: {
      rawVocabularyChanges: 0,
      jsonVocabularyChanges: 0,
      sourceBodies: replay.exports.length + replay.referencedSkills.length,
      classRuleCells: classRules.comparedCells,
      identityEntities:
        identity.servants + identity.craftEssences + identity.mysticCodes + identity.items,
      growthCells: growth.growthCells,
      materialSteps: materials.steps,
      skillValueCells: skillValues.comparedSkillCells + skillValues.comparedNoblePhantasmCells,
      canonicalBytes: Buffer.byteLength(canonical),
    },
  };
}
