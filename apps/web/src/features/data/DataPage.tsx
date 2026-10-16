import { useMemo, useRef, useState } from 'react';
import {
  APP_VERSION,
  SCHEMA_VERSION,
  type ProfileCollection,
  type UserDataBackup,
} from '@fgo-lab/schema';
import { exportBackup, importBackup } from '../../adapters/share';
import './data.css';

export function DataPage({
  profiles,
  masterVersion,
  onImport,
  onClear,
}: {
  profiles: ProfileCollection;
  masterVersion: string;
  onImport: (profiles: ProfileCollection) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const [message, setMessage] = useState('');
  const previewEpoch = useRef(0);
  const [importPending, setImportPending] = useState(false);
  const [pendingBackup, setPendingBackup] = useState<UserDataBackup>();
  const [preImportBackupSaved, setPreImportBackupSaved] = useState<ProfileCollection>();
  const [selectedFileName, setSelectedFileName] = useState('');
  const backup = useMemo<UserDataBackup>(
    () => ({
      kind: 'fgo-lab-user-backup',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      profiles,
    }),
    [profiles],
  );
  async function downloadBackup(value: UserDataBackup, filename: string) {
    const text = await exportBackup(value);
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
  async function download() {
    try {
      await downloadBackup(backup, 'fgo-lab-backup.json');
      setMessage('バックアップを保存しました');
    } catch {
      setMessage('バックアップを保存できませんでした。保存データは変更していません。');
    }
  }
  const importCounts = pendingBackup
    ? pendingBackup.profiles.profiles.reduce(
        (counts, profile) => ({
          servants: counts.servants + Object.keys(profile.servantBuilds).length,
          targets: counts.targets + Object.keys(profile.servantTargets).length,
          craftEssences: counts.craftEssences + profile.craftEssences.length,
          supports: counts.supports + profile.supportTemplates.length,
          history: counts.history + profile.history.length,
        }),
        { servants: 0, targets: 0, craftEssences: 0, supports: 0, history: 0 },
      )
    : undefined;
  return (
    <section className="data-page">
      <div className="data-intro">
        <h2>この端末の保存データ</h2>
        <p>所持・育成、支援条件、計算履歴をまとめて保存・復元できます。</p>
      </div>
      <button className="primary" onClick={() => void download()}>
        全データをバックアップ
      </button>
      <label className="file">
        <span className="file-heading">バックアップを復元</span>
        <span className="file-choice">ファイルを選ぶ</span>
        <span className="file-name">{selectedFileName || 'JSONファイルを選択してください'}</span>
        <input
          type="file"
          aria-label="バックアップを復元"
          accept="application/json"
          disabled={importPending}
          onChange={(event) => {
            const epoch = ++previewEpoch.current;
            setPendingBackup(undefined);
            setPreImportBackupSaved(undefined);
            const file = event.target.files?.[0];
            setSelectedFileName(file?.name ?? '');
            if (file)
              void file
                .text()
                .then(async (text) => {
                  const parsed = await importBackup(text);
                  if (previewEpoch.current !== epoch) return;
                  setPendingBackup(parsed);
                  setPreImportBackupSaved(undefined);
                  setMessage('形式を検証しました。内容と全置換を確認してください。');
                })
                .catch(() => {
                  if (previewEpoch.current === epoch) setMessage('復元できませんでした');
                });
          }}
        />
      </label>
      {pendingBackup && importCounts && (
        <section aria-label="復元内容のプレビュー" className="notice">
          <h2>全置換のプレビュー</h2>
          <p>
            プロフィール {pendingBackup.profiles.profiles.length}件 / 所持登録{' '}
            {importCounts.servants}件 / 育成目標 {importCounts.targets}件 / 礼装{' '}
            {importCounts.craftEssences}枚 / 支援条件 {importCounts.supports}件 / 履歴{' '}
            {importCounts.history}件
          </p>
          <p>現在の全ユーザーデータを置き換えます。マスターデータは変更しません。</p>
          {preImportBackupSaved && preImportBackupSaved !== profiles && (
            <p>保存データが変わりました。復元前バックアップをもう一度保存してください。</p>
          )}
          <div className="toolbar">
            <button
              onClick={() => {
                const epoch = previewEpoch.current;
                void downloadBackup(backup, 'fgo-lab-before-import.json')
                  .then(() => {
                    if (previewEpoch.current !== epoch) return;
                    setPreImportBackupSaved(backup.profiles);
                    setMessage('復元前バックアップを保存しました');
                  })
                  .catch(() => {
                    if (previewEpoch.current !== epoch) return;
                    setPreImportBackupSaved(undefined);
                    setMessage(
                      '復元前バックアップを保存できませんでした。保存データは変更していません。',
                    );
                  });
              }}
            >
              復元前バックアップを保存
            </button>
            <button
              className="danger"
              disabled={preImportBackupSaved !== profiles || importPending}
              onClick={() => {
                setImportPending(true);
                void onImport(pendingBackup.profiles)
                  .then(() => {
                    setPendingBackup(undefined);
                    setPreImportBackupSaved(undefined);
                    setMessage('検証済みデータへ全置換しました');
                  })
                  .catch(() => setMessage('復元に失敗しました。元データは維持されています。'))
                  .finally(() => setImportPending(false));
              }}
            >
              全置換を実行
            </button>
            <button
              disabled={importPending}
              onClick={() => {
                previewEpoch.current += 1;
                setPendingBackup(undefined);
                setPreImportBackupSaved(undefined);
              }}
            >
              キャンセル
            </button>
          </div>
        </section>
      )}
      <details className="data-technical-details">
        <summary>データの詳細</summary>
        <dl>
          <div>
            <dt>マスターデータ版</dt>
            <dd className="master-version">{masterVersion}</dd>
          </div>
          <div>
            <dt>保存形式の版</dt>
            <dd>{SCHEMA_VERSION}</dd>
          </div>
        </dl>
      </details>
      <details className="data-delete-details">
        <summary>保存データを削除する</summary>
        <p>所持・育成、支援条件、計算履歴をこの端末から削除します。</p>
        <button
          className="danger"
          onClick={() => {
            if (confirm('全ユーザーデータを削除しますか？ マスターデータは残ります。'))
              void onClear().catch(() => setMessage('削除処理に失敗しました。'));
          }}
        >
          全ユーザーデータを削除
        </button>
      </details>
      <p aria-live="polite">{message}</p>
    </section>
  );
}
