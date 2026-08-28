// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import fixture from '../../../../../packages/test-fixtures/master/fixture.json';
import type { RankingPresentedRow } from './rankingPresentation';
import { RankingList } from './RankingList';

afterEach(cleanup);

const master = masterSnapshotSchema.parse(fixture);
const row: RankingPresentedRow = {
  entryId: `${master.servants[0]!.id}:single`,
  servantId: master.servants[0]!.id,
  name: master.servants[0]!.name,
  imageKey: null,
  classId: master.servants[0]!.classId,
  rarity: master.servants[0]!.rarity,
  npCard: 'buster',
  npTarget: 'single',
  noblePhantasmVariant: {
    actorFormId: { actorId: master.servants[0]!.id, limitCount: 0 },
    noblePhantasmId: 'fixture-np',
  },
  attackProfile: {
    servantLineageId: master.servants[0]!.id,
    terminalFormProfileId: {
      servantLineageId: master.servants[0]!.id,
      representativeFormId: { actorId: master.servants[0]!.id, limitCount: 0 },
    },
    noblePhantasmVariant: {
      actorFormId: { actorId: master.servants[0]!.id, limitCount: 0 },
      noblePhantasmId: 'fixture-np',
    },
    targetScope: 'single',
    cardType: 'buster',
    terminalFormLabel: null,
  },
  noblePhantasmName: '検証用宝具',
  minimum: 80,
  average: 100,
  maximum: 120,
  precision: 'exact',
  appliedEffectCount: 1,
  supportEffectCount: 0,
  supportSourceCount: 0,
  specialAttackApplied: false,
  level: 90,
  npLevel: 1,
  owned: false,
  rank: 1,
  primaryDamage: 100,
};

describe('ranking row detail state', () => {
  it('renders a typed detail error and retries the same servant instead of loading forever', () => {
    const retry = vi.fn();
    const { getByRole, queryByText } = render(
      <RankingList
        rows={[row]}
        openEntryId={row.entryId}
        details={{}}
        detailErrors={{ [row.entryId]: 'detail_fixture_failure' }}
        master={master}
        onToggle={vi.fn()}
        onRetryDetail={retry}
        onOpenCalculator={vi.fn()}
      />,
    );

    expect(queryByText('詳細を読み込み中…')).toBeNull();
    expect(getByRole('alert').textContent).toContain('detail_fixture_failure');
    fireEvent.click(getByRole('button', { name: '再試行' }));
    expect(retry).toHaveBeenCalledWith(row);
  });
});
