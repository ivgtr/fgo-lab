// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Home } from '../features/home/Home';
import { homeDamageHeadline } from './HomeRoute';

afterEach(cleanup);

describe('HomeRoute damage headline', () => {
  it('presents a nonnumeric calculation as explicitly unavailable instead of zero', () => {
    const result = homeDamageHeadline(undefined, 1);
    expect(result).toBeNull();

    render(
      <Home
        result={result}
        attackerName="test attacker"
        attackerImage={null}
        owned={0}
        hasHistory
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.getByText('計算結果を利用できません')).toBeTruthy();
    expect(screen.queryByText(/^0$/)).toBeNull();
  });
});
