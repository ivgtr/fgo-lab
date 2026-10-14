import { useState } from 'react';
import type { RankingSelection } from '@fgo-lab/schema';
import {
  DEFAULT_RANKING_URL_STATE,
  parseRankingUrlState,
  serializeRankingUrlState,
} from './rankingState';
import { rankingWorkerRequestSchema } from './rankingWorkerProtocol';
// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_RANKING_POLICY_CONDITIONS } from '@fgo-lab/calculation-application';
import { RankingConditions } from './RankingConditions';

afterEach(cleanup);

describe('ranking condition commands', () => {
  it('exposes eight accessible canonical controls including growth basis and dispatches the full policy', () => {
    const onChange = vi.fn();
    const { getAllByRole, getByLabelText, queryByLabelText } = render(
      <RankingConditions conditions={DEFAULT_RANKING_POLICY_CONDITIONS} onChange={onChange} />,
    );
    expect(getAllByRole('combobox')).toHaveLength(8);
    expect((getByLabelText('育成基準') as HTMLSelectElement).value).toBe('common');
    expect(queryByLabelText('特攻')).toBeNull();
    expect(queryByLabelText('フィールド')).toBeNull();
    fireEvent.change(getByLabelText('条件効果'), { target: { value: 'satisfied' } });
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_RANKING_POLICY_CONDITIONS,
      conditionalEffects: 'satisfied',
    });
  });
});

it('keeps owned population independent and changes only illegal bases when returning to all', () => {
  const onChange = vi.fn();
  const { getByLabelText, getByText } = render(
    <RankingConditions
      conditions={{
        ...DEFAULT_RANKING_POLICY_CONDITIONS,
        population: 'owned',
        levelBasis: 'ownedLevel',
        npLevelBasis: { kind: 'owned' },
      }}
      onChange={onChange}
    />,
  );
  expect((getByLabelText('宝具Lv') as HTMLSelectElement).disabled).toBe(false);
  expect(getByText('保有レベル・Fou1000')).toBeTruthy();
  fireEvent.change(getByLabelText('宝具Lv'), { target: { value: '3' } });
  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      population: 'owned',
      levelBasis: 'ownedLevel',
      npLevelBasis: { kind: 'specified', npLevel: 3 },
    }),
  );
  fireEvent.change(getByLabelText('対象'), { target: { value: 'all' } });
  expect(onChange).toHaveBeenLastCalledWith(DEFAULT_RANKING_POLICY_CONDITIONS);
});

it.each([2, 3, 4])(
  'publishes the OC1 correction for NP%d through controls, URL and worker',
  (npLevel) => {
    let selected: RankingSelection = {
      ...DEFAULT_RANKING_POLICY_CONDITIONS,
      initialOvercharge: 3,
      npLevelBasis: { kind: 'specified', npLevel: 5 },
    };
    function Harness() {
      const [conditions, setConditions] = useState(selected);
      selected = conditions;
      return <RankingConditions conditions={conditions} onChange={setConditions} />;
    }
    const view = render(<Harness />);
    expect(view.getByText('初期OC3・スキルLv10')).toBeTruthy();
    fireEvent.change(view.getByLabelText('宝具Lv'), { target: { value: String(npLevel) } });
    expect((view.getByLabelText('初期OC') as HTMLSelectElement).value).toBe('1');
    expect(view.getByText('初期OC1・スキルLv10')).toBeTruthy();
    expect(view.queryByText('初期OC3・スキルLv10')).toBeNull();
    const recovered = parseRankingUrlState(
      serializeRankingUrlState({
        ...DEFAULT_RANKING_URL_STATE,
        conditions: selected,
      }),
    );
    const worker = rankingWorkerRequestSchema.parse({
      kind: 'calculate',
      requestId: 'changed',
      contextId: 'current',
      conditions: recovered.conditions,
    });
    expect(worker).toMatchObject({
      conditions: { initialOvercharge: 1, npLevelBasis: { kind: 'specified', npLevel } },
    });
  },
);
