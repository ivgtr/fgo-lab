// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_RANKING_POLICY_CONDITIONS } from '@fgo-lab/calculation-application';
import { RankingConditions } from './RankingConditions';

afterEach(cleanup);

describe('ranking condition commands', () => {
  it('exposes exactly five accessible canonical controls and dispatches the full policy', () => {
    const onChange = vi.fn();
    const { getAllByRole, getByLabelText, queryByLabelText } = render(
      <RankingConditions conditions={DEFAULT_RANKING_POLICY_CONDITIONS} onChange={onChange} />,
    );
    // E2E-A010-POLICY
    expect(getAllByRole('combobox')).toHaveLength(5);
    expect(queryByLabelText('特攻')).toBeNull();
    expect(queryByLabelText('フィールド')).toBeNull();
    fireEvent.change(getByLabelText('条件効果'), { target: { value: 'satisfied' } });
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_RANKING_POLICY_CONDITIONS,
      conditionalEffects: 'satisfied',
    });
  });
});
