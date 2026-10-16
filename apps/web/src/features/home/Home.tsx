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
  hasGrowthTargets,
  onNavigate,
  onOpenTargets,
}: {
  result: number | null;
  attackerName: string;
  attackerImage: string | null;
  owned: number;
  hasHistory: boolean;
  hasGrowthTargets: boolean;
  onNavigate: (page: HomeDestination) => void;
  onOpenTargets: () => void;
}) {
  return (
    <div className="home-grid">
      <section className="primary-module">
        <h2>{hasHistory ? '前回の計算' : '宝具ダメージ計算'}</h2>
        {hasHistory ? (
          <>
            <div className="entity-summary compact">
              <MasterImage src={attackerImage} alt="" fallback={attackerName} />
              <p>
                <strong>{attackerName}</strong>
                <small>保存した条件</small>
              </p>
            </div>
            <p className="hero-number">
              {result === null ? '計算結果を利用できません' : numberFormatter.format(result)}
              {result !== null && <small>平均ダメージ</small>}
            </p>
          </>
        ) : (
          <p className="home-measures">NP1〜5 · 最低 / 平均 / 最大</p>
        )}
        <button className="primary" onClick={() => onNavigate('calculate')}>
          {hasHistory ? '前回条件を開く' : '新しい計算を始める'}
        </button>
      </section>
      <section>
        <h2>
          所持・育成 <span>{owned}騎</span>
        </h2>
        <button onClick={() => onNavigate('servants')}>
          {owned > 0 ? '所持一覧を見る' : '所持を登録する'}
        </button>
      </section>
      <section>
        <h2>育成計画</h2>
        <button onClick={hasGrowthTargets ? () => onNavigate('growth') : onOpenTargets}>
          {hasGrowthTargets ? '必要素材を見る' : '育成目標を設定する'}
        </button>
      </section>
      <section>
        <h2>火力ランキング</h2>
        <button onClick={() => onNavigate('ranking')}>ランキングを見る</button>
      </section>
    </div>
  );
}
