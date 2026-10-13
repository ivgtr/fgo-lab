import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { ATLAS_EXPORT_KEYS } from '@fgo-lab/master-data';
import { attestReplayBytes } from './replayAttestation';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(): { observedDirectory: string; replayDirectory: string } {
  const root = mkdtempSync(join(tmpdir(), 'fgo-replay-attestation-'));
  roots.push(root);
  const observedDirectory = join(root, 'observed');
  const replayDirectory = join(root, 'replay');
  for (const directory of [observedDirectory, replayDirectory]) {
    mkdirSync(directory);
    mkdirSync(join(directory, 'referenced_skills'));
    for (const key of ATLAS_EXPORT_KEYS)
      writeFileSync(
        join(directory, `${key}.json`),
        key === 'nice_servant' ? '[{"functions":[{"funcId":1,"svals":[{"SkillID":7}]}]}]' : '[]',
      );
    writeFileSync(join(directory, 'referenced_skills', '7.json'), '{"id":7,"functions":[]}');
  }
  return { observedDirectory, replayDirectory };
}

it('attests the complete referenced skill closure and rejects a changed body', async () => {
  const input = fixture();
  const result = await attestReplayBytes(input);
  expect(result.exports).toHaveLength(ATLAS_EXPORT_KEYS.length);
  expect(result.referencedSkills.map((item) => item.id)).toEqual([7]);

  writeFileSync(
    join(input.replayDirectory, 'referenced_skills', '7.json'),
    '{"id":7,"functions":[] }',
  );
  await expect(attestReplayBytes(input)).rejects.toThrow('byte_mismatch:7.json');
});

it('rejects a reference file not reachable from the observed bulk exports', async () => {
  const input = fixture();
  for (const directory of [input.observedDirectory, input.replayDirectory])
    writeFileSync(join(directory, 'referenced_skills', '8.json'), '{"id":8,"functions":[]}');
  await expect(attestReplayBytes(input)).rejects.toThrow('extra_reference');
});
