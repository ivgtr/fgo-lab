import './startup-screen.css';

export type StartupScreenMode = 'checking' | 'setup' | 'updating' | 'error';

interface StartupScreenProps {
  mode: StartupScreenMode;
  notice?: string | undefined;
  errorDetail?: string | undefined;
  actionLabel?: string | undefined;
  onAction?: (() => void) | undefined;
}

const statusCopy: Record<StartupScreenMode, { title: string; description: string }> = {
  checking: {
    title: '利用するデータを準備しています',
    description: '最新の状態を確認し、更新がある場合はこのまま適用します。',
  },
  setup: {
    title: '計算に必要なデータを準備します',
    description: '検証済みのデータをこの端末に保存します。',
  },
  updating: {
    title: 'データを更新しています',
    description: '安全に利用できることを確認してから更新を適用します。',
  },
  error: {
    title: 'データを準備できませんでした',
    description: '通信環境を確認して、もう一度お試しください。',
  },
};

export function StartupScreen({
  mode,
  notice,
  errorDetail,
  actionLabel,
  onAction,
}: StartupScreenProps) {
  const copy = statusCopy[mode];
  const busy = mode === 'checking' || mode === 'updating';

  return (
    <main className={`startup-screen startup-screen--${mode}`}>
      <section className="startup-screen__panel" aria-labelledby="startup-screen-title">
        <div className="startup-screen__mark" aria-hidden="true">
          <span>FL</span>
        </div>
        <h1>FGO Lab</h1>

        <div className="startup-screen__status-copy" role={mode === 'error' ? 'alert' : 'status'}>
          <h2 id="startup-screen-title">{copy.title}</h2>
          <p>{copy.description}</p>
        </div>

        {busy && (
          <div className="startup-screen__activity" role="progressbar" aria-label={copy.title}>
            <span />
            <span />
            <span />
          </div>
        )}

        {notice && (
          <p className="startup-screen__notice" role="alert">
            {notice}
          </p>
        )}

        {mode === 'error' && errorDetail && (
          <details className="startup-screen__error-detail">
            <summary>エラーの詳細</summary>
            <code>{errorDetail}</code>
          </details>
        )}

        {actionLabel && onAction && (
          <button className="startup-screen__action" type="button" onClick={onAction}>
            {actionLabel}
          </button>
        )}
      </section>
    </main>
  );
}
