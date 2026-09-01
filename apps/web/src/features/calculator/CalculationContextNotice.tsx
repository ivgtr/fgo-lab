import type { CalculationResult, PortableCalculationRequest } from '@fgo-lab/schema';

type CalculationContextNoticeProps =
  | {
      state: 'current';
      request: PortableCalculationRequest;
      onReset: () => Promise<void>;
    }
  | {
      state: 'historicalOnly';
      request: PortableCalculationRequest;
      result: CalculationResult;
      onUpgrade: () => Promise<void>;
    }
  | {
      state: 'invalid';
      request: PortableCalculationRequest;
      reason: string;
      onReset: () => Promise<void>;
    }
  | {
      state: 'unsupported';
      request: PortableCalculationRequest;
      onReset: () => Promise<void>;
    };

export function CalculationContextNotice(props: CalculationContextNoticeProps) {
  const { request } = props;
  const ranking =
    request.executionIntent.kind === 'resolved' && request.executionIntent.origin === 'ranking'
      ? request.executionIntent
      : null;
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
      >
        <h2>
          {props.state === 'invalid'
            ? '計算条件を復元できません'
            : '現在のエンジンでは実行できません'}
        </h2>
        {props.state === 'invalid' && <p>{props.reason}</p>}
        <VersionMetadata request={request} />
        {ranking && (
          <button type="button" onClick={() => void props.onReset()}>
            通常の計算条件へ戻す
          </button>
        )}
      </section>
    );
  return (
    <section className="notice calculation-context-notice" aria-label="計算条件の版情報">
      {ranking && (
        <>
          <strong>ランキングから引き継いだ計算条件</strong>
          <span>
            開始NP {ranking.initialNpGauge / 100}% ／ 寄与条件{' '}
            {ranking.contribution === 'standard' ? '標準' : '任意スキル補正を除外'}
          </span>
          <button type="button" onClick={() => void props.onReset()}>
            通常の計算条件へ戻す
          </button>
        </>
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
