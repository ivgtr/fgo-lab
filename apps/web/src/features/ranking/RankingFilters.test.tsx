// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../../../../packages/test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { DEFAULT_RANKING_URL_STATE, type RankingFiltersState } from './rankingState';
import { RankingFilters } from './RankingFilters';

afterEach(cleanup);

const master = masterSnapshotSchema.parse(fixture);
const defaultFilters = DEFAULT_RANKING_URL_STATE.filters;

describe('ranking filter commands', () => {
  it('dispatches display-only search, target, metric, and reset commands', () => {
    const onChange = vi.fn<(filters: RankingFiltersState) => void>();
    const onMetricChange = vi.fn();
    const view = render(
      <RankingFilters
        filters={defaultFilters}
        metric="average"
        master={master}
        onChange={onChange}
        onMetricChange={onMetricChange}
      />,
    );

    fireEvent.change(view.getByLabelText('名前検索'), { target: { value: 'fixture' } });
    expect(onChange).toHaveBeenCalledWith({ ...defaultFilters, search: 'fixture' });
    fireEvent.change(view.getByLabelText('並び順'), { target: { value: 'minimum' } });
    expect(onMetricChange).toHaveBeenCalledWith('minimum');

    const active: RankingFiltersState = { ...defaultFilters, target: 'single' };
    view.rerender(
      <RankingFilters
        filters={active}
        metric="minimum"
        master={master}
        onChange={onChange}
        onMetricChange={onMetricChange}
      />,
    );
    fireEvent.click(view.getByRole('button', { name: '絞り込みを解除' }));
    expect(onChange).toHaveBeenLastCalledWith(defaultFilters);
  });
});
