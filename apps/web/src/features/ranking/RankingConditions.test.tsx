// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_RANKING_POLICY_CONDITIONS } from '@fgo-lab/calculation-application';
import { RankingConditions } from './RankingConditions';

afterEach(cleanup);

describe('ranking condition commands', () => {
  it('exposes exactly six accessible canonical controls and dispatches the full policy', () => {
    const onChange = vi.fn();
    const { getAllByRole, getByLabelText, queryByLabelText } = render(
      <RankingConditions conditions={DEFAULT_RANKING_POLICY_CONDITIONS} onChange={onChange} />,
    );
    // E2E-A010-POLICY
    expect(getAllByRole('combobox')).toHaveLength(6);
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
