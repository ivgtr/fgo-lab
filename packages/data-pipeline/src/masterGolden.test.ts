import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import golden from '../../test-fixtures/golden/master-normalization-v1.json';
import { masterManifestSchema, masterSnapshotSchema } from '@fgo-lab/master-data';

const root = resolve(import.meta.dirname, '../../..');

describe('published master normalization golden', () => {
  it('matches the current published artifact and normalized Function inventory', async () => {
    const [manifestContent, masterContent] = await Promise.all([
      readFile(resolve(root, 'apps/web/public/master/manifest.json'), 'utf8'),
      readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8'),
    ]);
    const manifest = masterManifestSchema.parse(JSON.parse(manifestContent));
    const master = masterSnapshotSchema.parse(JSON.parse(masterContent));
    const artifact = manifest.files.find((file) => file.key === 'master' && file.required);
    expect(artifact).toMatchObject(golden.artifact);
    expect(manifest.schemaVersion).toBe(golden.masterSchemaVersion);
    expect(master.version).toBe(golden.masterDataVersion);
    expect(master.normalization.attackFunctions).toMatchObject({
      sourceCount: golden.counts.sourceAttackFunctions,
      includedCount: golden.counts.includedAttackFunctions,
    });
    expect(master.normalization.attackFunctions.excluded).toHaveLength(
      golden.counts.excludedAttackFunctions,
    );
    expect(master.servants).toHaveLength(golden.counts.servants);
    expect(master.craftEssences).toHaveLength(golden.counts.craftEssences);
    expect(master.mysticCodes).toHaveLength(golden.counts.mysticCodes);
    expect(master.materials).toHaveLength(golden.counts.materials);

    const functionCounts: Record<string, number> = {};
    for (const servant of master.servants)
      for (const noblePhantasm of servant.noblePhantasms)
        for (const damage of noblePhantasm.damage)
          functionCounts[damage.rawFunctionType] =
            (functionCounts[damage.rawFunctionType] ?? 0) + 1;
    expect(functionCounts).toEqual(golden.normalizedFunctionCounts);
  });
});
