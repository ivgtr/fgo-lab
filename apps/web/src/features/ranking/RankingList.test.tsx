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
    id: {
      servantLineageId: master.servants[0]!.id,
      terminalActorFormProfileId: {
        servantLineageId: master.servants[0]!.id,
        semantics: {
          skillSlots: [],
          passiveVariantIds: [],
          intrinsicTraits: [],
          baseNoblePhantasmVariantId: 'fixture-np',
          reachableAttackNoblePhantasmVariantIds: ['fixture-np'],
        },
      },
      attackNoblePhantasmVariantId: 'fixture-np',
    },
    noblePhantasmVariant: {
      actorFormId: { actorId: master.servants[0]!.id, limitCount: 0 },
      noblePhantasmId: 'fixture-np',
    },
    noblePhantasmVariantCanonicalId: 'fixture-np',
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
  it('uses the whole row as the detail disclosure without a separate detail button', () => {
    const toggle = vi.fn();
    const { getByRole, queryByRole } = render(
      <RankingList
        rows={[row]}
        openEntryId={null}
        details={{}}
        detailErrors={{}}
        master={master}
        onToggle={toggle}
        onRetryDetail={vi.fn()}
        onOpenCalculator={vi.fn()}
      />,
    );

    const disclosure = getByRole('button', { name: `${row.name}の計算詳細を開く` });
    expect(disclosure.getAttribute('aria-expanded')).toBe('false');
    expect(queryByRole('button', { name: '詳細' })).toBeNull();
    fireEvent.click(disclosure);
    expect(toggle).toHaveBeenCalledWith(row);
  });

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
