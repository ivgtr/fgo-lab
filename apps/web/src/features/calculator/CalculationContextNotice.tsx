import type { CalculationResult, PortableCalculationRequest } from '@fgo-lab/schema';
import type { PortableVersionUpgradeResult } from '@fgo-lab/calculation-application';

type CalculationContextNoticeProps =
  | {
      state: 'current';
      request: PortableCalculationRequest;
      onReset: () => Promise<void>;
      resetPending?: boolean | undefined;
      resetError?: string | undefined;
    }
  | {
      state: 'historicalOnly';
      request: PortableCalculationRequest;
      result: CalculationResult;
      upgradeAttempt?: Extract<PortableVersionUpgradeResult, { status: 'rejected' }>;
      onUpgrade: () => Promise<void>;
    }
  | {
      state: 'invalid';
      request: PortableCalculationRequest;
      reason: string;
      onReset: () => Promise<void>;
      resetPending?: boolean | undefined;
      resetError?: string | undefined;
    }
  | {
      state: 'unsupported';
      request: PortableCalculationRequest;
      onReset: () => Promise<void>;
      resetPending?: boolean | undefined;
      resetError?: string | undefined;
    };

export function CalculationContextNotice(props: CalculationContextNoticeProps) {
  const { request } = props;
  const ranking = request.executionIntent.kind === 'ranking' ? request.executionIntent : null;
  if (props.state === 'historicalOnly')
    return (
      <section className="notice calculation-context-notice" aria-labelledby="historical-title">
        <h2 id="historical-title">履歴値・再計算されていません</h2>
        <VersionMetadata request={request} />
        {props.result.status === 'calculated' && (
          <ol>
            {props.result.rows.map((row) => (
              <li key={row.npLevel}>
                NP{row.npLevel}: {row.average.toLocaleString('ja-JP')}
              </li>
            ))}
          </ol>
        )}
        <p>再計算すると結果が変わる場合があります。元の履歴値は上書きしません。</p>
        {props.upgradeAttempt && (
          <div role="alert" tabIndex={-1} data-calculation-error-summary>
            <h3>現在のバージョンで再計算できませんでした</h3>
            <p>
              {props.upgradeAttempt.failure.status === 'invalid'
                ? props.upgradeAttempt.failure.reason
                : '現在のエンジンではこの計算条件を実行できません'}
            </p>
            <VersionMetadata request={props.upgradeAttempt.attemptedRequest} />
            <p>元の履歴値を保持しています。条件を確認して再試行できます。</p>
          </div>
        )}
        <button type="button" onClick={() => void props.onUpgrade()}>
          現在のバージョンで再計算
        </button>
      </section>
    );
  if (props.state === 'invalid' || props.state === 'unsupported')
    return (
      <section
        className="notice calculation-context-notice"
        role="alert"
        tabIndex={-1}
        data-calculation-error-summary
        aria-busy={props.resetPending || undefined}
      >
        <h2>
          {props.state === 'invalid'
            ? '計算条件を復元できません'
            : '現在のエンジンでは実行できません'}
        </h2>
        {props.state === 'invalid' && <p>{props.reason}</p>}
        {props.resetError && (
          <p role="alert" data-calculation-reset-error>
            {props.resetError}
          </p>
        )}
        <VersionMetadata request={request} />
        {ranking && (
          <button type="button" disabled={props.resetPending} onClick={() => void props.onReset()}>
            通常の計算条件へ戻す
          </button>
        )}
      </section>
    );
  return (
    <section
      className="notice calculation-context-notice"
      aria-label="計算条件の版情報"
      aria-live="polite"
      aria-busy={props.resetPending || undefined}
      {...(props.resetError ? { 'data-calculation-error-summary': true, tabIndex: -1 } : {})}
    >
      {ranking && (
        <>
          <strong>ランキングから引き継いだ計算条件</strong>
          <span>
            開始NP {ranking.initialNpGauge / 100}% ／ 自己バフ:{' '}
            {ranking.policy.selfBuffs === 'included' ? '込み' : '除外'} ／ 条件効果:{' '}
            {ranking.policy.conditionalEffects === 'satisfied' ? '成立込み' : '通常のみ'}
          </span>
          <button type="button" disabled={props.resetPending} onClick={() => void props.onReset()}>
            通常の計算条件へ戻す
          </button>
        </>
      )}
      {props.resetError && (
        <p role="alert" data-calculation-reset-error>
          {props.resetError}
        </p>
      )}
      <VersionMetadata request={request} />
    </section>
  );
}

function VersionMetadata({ request }: { request: PortableCalculationRequest }) {
  return (
    <small>
      マスター {request.versionContext.masterDataVersion} ／ エンジン{' '}
      {request.versionContext.engineVersion}
    </small>
  );
}
