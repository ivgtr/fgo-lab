import { useMemo, useState } from 'react';
import {
  APP_VERSION,
  SCHEMA_VERSION,
  type ProfileCollection,
  type UserDataBackup,
} from '@fgo-lab/schema';
import { clearUserData } from '../../adapters/repository';
import { exportBackup, importBackup } from '../../adapters/share';
import './data.css';

export function DataPage({
  profiles,
  masterVersion,
  onImport,
}: {
  profiles: ProfileCollection;
  masterVersion: string;
  onImport: (profiles: ProfileCollection) => Promise<void>;
}) {
  const [message, setMessage] = useState('');
  const [pendingBackup, setPendingBackup] = useState<UserDataBackup>();
  const [preImportBackupSaved, setPreImportBackupSaved] = useState(false);
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
  function downloadBackup(value: UserDataBackup, filename: string) {
    const url = URL.createObjectURL(new Blob([exportBackup(value)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
  function download() {
    downloadBackup(backup, 'fgo-lab-backup.json');
    setMessage('バックアップを保存しました');
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
    <section>
      <dl>
        <div>
          <dt>マスターデータ版</dt>
          <dd>{masterVersion}</dd>
        </div>
        <div>
          <dt>schema版</dt>
          <dd>{SCHEMA_VERSION}</dd>
        </div>
      </dl>
      <button className="primary" onClick={download}>
        全データをバックアップ
      </button>
      <label className="file">
        バックアップを復元
        <input
          type="file"
          accept="application/json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file)
              void file
                .text()
                .then((text) => {
                  const parsed = importBackup(text);
                  setPendingBackup(parsed);
                  setPreImportBackupSaved(false);
                  setMessage('形式を検証しました。内容と全置換を確認してください。');
                })
                .catch(() => setMessage('復元できませんでした'));
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
          <div className="toolbar">
            <button
              onClick={() => {
                downloadBackup(backup, 'fgo-lab-before-import.json');
                setPreImportBackupSaved(true);
                setMessage('復元前バックアップを保存しました');
              }}
            >
              復元前バックアップを保存
            </button>
            <button
              className="danger"
              disabled={!preImportBackupSaved}
              onClick={() => {
                void onImport(pendingBackup.profiles)
                  .then(() => {
                    setPendingBackup(undefined);
                    setPreImportBackupSaved(false);
                    setMessage('検証済みデータへ全置換しました');
                  })
                  .catch(() => setMessage('復元に失敗しました。元データは維持されています。'));
              }}
            >
              全置換を実行
            </button>
            <button onClick={() => setPendingBackup(undefined)}>キャンセル</button>
          </div>
        </section>
      )}
      <button
        className="danger"
        onClick={() => {
          if (confirm('全ユーザーデータを削除しますか？ マスターデータは残ります。'))
            void clearUserData().then(() => location.reload());
        }}
      >
        全ユーザーデータを削除
      </button>
      <p aria-live="polite">{message}</p>
    </section>
  );
}
