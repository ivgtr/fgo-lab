import { numberFormatter } from '../../ui/i18n';
import { MasterImage } from '../../ui/MasterImage';
import './home.css';

type HomeDestination = 'calculate' | 'servants' | 'growth' | 'ranking';

export function Home({
  result,
  attackerName,
  attackerImage,
  owned,
  hasHistory,
  onNavigate,
}: {
  result: number | null;
  attackerName: string;
  attackerImage: string | null;
  owned: number;
  hasHistory: boolean;
  onNavigate: (page: HomeDestination) => void;
}) {
  return (
    <div className="home-grid">
      <section className="primary-module">
        <p className="eyebrow">PRIMARY</p>
        <h2>{hasHistory ? '前回の計算を開く' : '宝具ダメージを比べる'}</h2>
        {hasHistory ? (
          <>
            <p className="hero-number">
              {result === null ? '計算結果を利用できません' : numberFormatter.format(result)}
            </p>
            <div className="entity-summary compact">
              <MasterImage src={attackerImage} alt="" fallback={attackerName} />
              <p>
                <strong>{attackerName}</strong>
                <small>保存済みの最終条件</small>
              </p>
            </div>
          </>
        ) : (
          <>
            <p className="lead">
              攻撃役と対象を選ぶと、NP1〜5の平均・最低・最大を一度に確認できます。
            </p>
            <ol className="start-guide">
              <li>所持状態を登録するか、全DBから攻撃役を選択</li>
              <li>対象クラスと支援条件を設定</li>
              <li>宝具レベル別の結果を比較</li>
            </ol>
          </>
        )}
        <button className="primary" onClick={() => onNavigate('calculate')}>
          {hasHistory ? '前回条件を開く' : '新しい計算を始める'}
        </button>
      </section>
      <section>
        <h2>所持・育成</h2>
        <p>{owned}騎を登録中</p>
        <button onClick={() => onNavigate('servants')}>登録を始める</button>
      </section>
      <section>
        <h2>次の育成</h2>
        <p>目標を設定すると必要素材を集計します。</p>
        <button onClick={() => onNavigate('growth')}>育成計画を見る</button>
      </section>
      <section>
        <h2>火力ランキング</h2>
        <p>同じ条件で攻撃宝具420騎を比較します。</p>
        <button onClick={() => onNavigate('ranking')}>ランキングを見る</button>
      </section>
    </div>
  );
}
