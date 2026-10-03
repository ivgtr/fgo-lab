// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { APP_VERSION, SCHEMA_VERSION, type ProfileCollection } from '@fgo-lab/schema';
import { createProfileCollection } from '@fgo-lab/profile-domain';
import { DataPage } from './DataPage';

const now = '2026-10-03T00:00:00.000Z';
const profiles = createProfileCollection(
  'original',
  { now: () => new Date(now) },
  {
    next: () => '00000000-0000-4000-8000-000000000001',
  },
);
function textFor(value: ProfileCollection) {
  return JSON.stringify({
    kind: 'fgo-lab-user-backup',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now,
    appVersion: APP_VERSION,
    profiles: value,
  });
}
function fileWith(text: () => Promise<string>) {
  const file = new File([], 'backup.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: text });
  return file;
}
function setup(current = profiles, onImport = vi.fn(() => Promise.resolve())) {
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  vi.stubGlobal(
    'URL',
    Object.assign(class extends URL {}, {
      createObjectURL: vi.fn(() => 'blob:backup'),
      revokeObjectURL: vi.fn(),
    }),
  );
  const onClear = vi.fn(() => Promise.resolve());
  const props = { profiles: current, masterVersion: 'fixture', onImport, onClear };
  const view = render(<DataPage {...props} />);
  const input = view.getByLabelText('バックアップを復元');
  return { view, input, props, onImport, onClear, click };
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('keeps the latest selected backup when an earlier file read finishes later', async () => {
  const test = setup();
  let resolveOld!: (text: string) => void;
  const old = new Promise<string>((resolve) => {
    resolveOld = resolve;
  });
  fireEvent.change(test.input, { target: { files: [fileWith(() => old)] } });
  const newest = {
    ...profiles,
    profiles: [
      ...profiles.profiles,
      {
        ...profiles.profiles[0]!,
        profileId: '00000000-0000-4000-8000-000000000002',
        name: 'second',
      },
    ],
  };
  fireEvent.change(test.input, {
    target: { files: [fileWith(() => Promise.resolve(textFor(newest)))] },
  });
  await waitFor(() =>
    expect(test.view.getByLabelText('復元内容のプレビュー').textContent).toContain(
      'プロフィール 2件',
    ),
  );
  await act(async () => {
    resolveOld(textFor(profiles));
    await old;
  });
  expect(test.view.getByLabelText('復元内容のプレビュー').textContent).toContain(
    'プロフィール 2件',
  );
  expect(test.onImport).not.toHaveBeenCalled();
});

it('requires a backup of the current profile after an edit changes the original data', async () => {
  const test = setup();
  fireEvent.change(test.input, {
    target: { files: [fileWith(() => Promise.resolve(textFor(profiles)))] },
  });
  await waitFor(() => expect(test.view.getByText('復元前バックアップを保存')).toBeTruthy());
  fireEvent.click(test.view.getByText('復元前バックアップを保存'));
  const replace = test.view.getByRole('button', { name: '全置換を実行' });
  await waitFor(() => expect((replace as HTMLButtonElement).disabled).toBe(false));
  const edited = { ...profiles, profiles: [{ ...profiles.profiles[0]!, name: 'edited' }] };
  test.view.rerender(<DataPage {...test.props} profiles={edited} />);
  expect((replace as HTMLButtonElement).disabled).toBe(true);
  expect(test.view.getByText(/保存データが変わりました/)).toBeTruthy();
  expect(test.onImport).not.toHaveBeenCalled();
});

it('keeps import disabled when the current backup cannot be validated', async () => {
  const invalid = { ...profiles, activeProfileId: '00000000-0000-4000-8000-000000000099' };
  const test = setup(invalid);
  fireEvent.change(test.input, {
    target: { files: [fileWith(() => Promise.resolve(textFor(profiles)))] },
  });
  await waitFor(() => expect(test.view.getByText('復元前バックアップを保存')).toBeTruthy());
  fireEvent.click(test.view.getByText('復元前バックアップを保存'));
  await waitFor(() =>
    expect(test.view.getByText(/復元前バックアップを保存できませんでした/)).toBeTruthy(),
  );
  expect(
    (test.view.getByRole('button', { name: '全置換を実行' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(test.click).not.toHaveBeenCalled();
  expect(test.onImport).not.toHaveBeenCalled();
});

it('retains the import preview and original data on durable failure', async () => {
  const onImport = vi.fn().mockRejectedValue(new Error('storage failed'));
  const test = setup(profiles, onImport);
  const original = structuredClone(profiles);
  fireEvent.change(test.input, {
    target: { files: [fileWith(() => Promise.resolve(textFor(profiles)))] },
  });
  await waitFor(() => expect(test.view.getByText('復元前バックアップを保存')).toBeTruthy());
  fireEvent.click(test.view.getByText('復元前バックアップを保存'));
  const replace = test.view.getByRole('button', { name: '全置換を実行' });
  await waitFor(() => expect((replace as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(replace);
  await waitFor(() =>
    expect(test.view.getByText('復元に失敗しました。元データは維持されています。')).toBeTruthy(),
  );
  expect(test.view.getByLabelText('復元内容のプレビュー')).toBeTruthy();
  expect(onImport).toHaveBeenCalledOnce();
  expect(profiles).toEqual(original);
  expect(test.onClear).not.toHaveBeenCalled();
});
