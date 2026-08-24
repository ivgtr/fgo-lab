import { describe, expect, it } from 'vitest';
import { calculationShareSnapshotSchema, SCHEMA_VERSION } from './index';

describe('portable schema boundaries', () => {
  it('rejects profile data in a share snapshot', () => {
    const result = calculationShareSnapshotSchema.safeParse({
      kind: 'fgo-lab-calculation-share',
      schemaVersion: SCHEMA_VERSION,
      profileId: crypto.randomUUID(),
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown future schema versions', () => {
    expect(
      calculationShareSnapshotSchema.safeParse({
        kind: 'fgo-lab-calculation-share',
        schemaVersion: 2,
      }),
    ).toMatchObject({ success: false });
  });
});
