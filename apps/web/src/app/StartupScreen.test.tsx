// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StartupScreen } from './StartupScreen';

afterEach(cleanup);

describe('StartupScreen', () => {
  it('shows indeterminate activity without invented progress values', () => {
    render(<StartupScreen mode="updating" />);

    const progress = screen.getByRole('progressbar', { name: 'データを更新しています' });
    expect(progress.hasAttribute('aria-valuenow')).toBe(false);
    expect(screen.queryByText(/%|MB/)).toBeNull();
  });

  it('keeps the product and update state in one compact region', () => {
    render(<StartupScreen mode="checking" />);

    expect(screen.getByRole('heading', { name: 'FGO Lab' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '利用するデータを準備しています' })).toBeTruthy();
    expect(
      screen.getByRole('progressbar', { name: '利用するデータを準備しています' }),
    ).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('exposes a retry action and optional diagnostic detail on error', () => {
    const retry = vi.fn();
    render(
      <StartupScreen
        mode="error"
        actionLabel="再試行"
        errorDetail="master_data_download_failed"
        onAction={retry}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '再試行' }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByText('master_data_download_failed')).toBeTruthy();
  });
});
