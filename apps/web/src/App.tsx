import { useEffect, useMemo, useState } from 'react';
import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import {
  calculateGrowthLedger,
  createProfileCollection,
  defaultServantBuild,
  activeProfile,
  type Clock,
  type IdGenerator,
} from '@fgo-lab/profile-domain';
import { calculateNpDamage } from '@fgo-lab/calc-core';
import type { CalcInput, ProfileCollection, ServantBuild, UserDataBackup } from '@fgo-lab/schema';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import {
  IndexedDbProfileRepository,
  clearUserData,
  fetchMasterCandidate,
  loadActiveMaster,
  stageAndActivate,
} from './adapters/repository';
import { exportBackup, importBackup } from './adapters/share';
import { numberFormatter, t } from './i18n';

type Page = 'home' | 'calculate' | 'ranking' | 'servants' | 'ce' | 'support' | 'growth' | 'data';
const nav: readonly [Page, ReturnType<typeof t>][] = [
  ['home', t('nav.home')],
  ['calculate', t('nav.calculate')],
  ['ranking', t('nav.ranking')],
  ['servants', t('nav.servants')],
  ['ce', t('nav.ce')],
  ['support', t('nav.support')],
  ['growth', t('nav.growth')],
  ['data', t('nav.data')],
];
const repository = new IndexedDbProfileRepository();
const clock: Clock = { now: () => new Date() };
const ids: IdGenerator = { next: () => crypto.randomUUID() };

function Setup({
  onComplete,
}: {
  onComplete: (master: MasterDataSnapshot, profiles: ProfileCollection) => void;
}) {
  const [state, setState] = useState<'idle' | 'running' | 'error'>('idle');
  const [error, setError] = useState('');
  async function run() {
    setState('running');
    setError('');
    try {
      const candidate = await fetchMasterCandidate(import.meta.env.BASE_URL);
      const manifest = candidate.manifest;
      if (
        !import.meta.env.DEV &&
        (manifest as { artifactKind?: string }).artifactKind === 'diagnostic'
      )
        throw new Error('diagnostic_fixture_cannot_be_activated');
      const master = await stageAndActivate(manifest, candidate.snapshot, new Date());
      const profiles = (await repository.load()) ?? createProfileCollection('マスター', clock, ids);
      await repository.replace(profiles);
      onComplete(master.snapshot, profiles);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setState('error');
    }
  }
  return (
    <main className="setup">
      <section>
        <p className="eyebrow">LOCAL FIRST / JP</p>
        <h1>{t('setup.title')}</h1>
        <p>{t('setup.description')}</p>
        <ol className="steps">
          <li>ローカルDBを作成</li>
          <li>マスターデータを取得・検証</li>
          <li>検索索引を準備</li>
          <li>active版を切替</li>
        </ol>
        {state === 'running' ? (
          <p role="status">{t('setup.running')}…</p>
        ) : (
          <button className="primary" onClick={() => void run()}>
            {state === 'error' ? t('setup.retry') : t('setup.start')}
          </button>
        )}
        {state === 'error' && (
          <p role="alert" className="error">
            {t('setup.error')}: {error}
          </p>
        )}
        <small>
          開発buildでは診断fixtureを使用します。本番buildはproduction masterがない限り進みません。
        </small>
      </section>
    </main>
  );
}

function calcInput(master: MasterDataSnapshot, build: ServantBuild | undefined): CalcInput {
  const servant = master.servants[0]!;
  return {
    attackerId: servant.id,
    attackerLevel: build?.level ?? 90,
    attackerAtk: servant.atkByLevel[String(build?.level ?? 90)] ?? servant.atkByLevel['90'] ?? 0,
    fouAtk: build?.fouAtk ?? 1000,
    craftEssenceId: null,
    craftEssenceAtk: 0,
    npLevel: Math.max(1, build?.npLevel ?? 1),
    overcharge: 1,
    npMultipliers: servant.npMultipliers,
    cardType: servant.npCard,
    classAttackRate: 1,
    classAffinity: 1.5,
    attributeAffinity: 1,
    attackBuff: 0,
    cardBuff: 0,
    npDamageBuff: 0,
    powerMod: 0,
    npSpecialMultiplier: 1,
    specialResistance: 0,
    flatDamage: 0,
    target: { classId: 'lancer', attribute: 'earth', traits: [] },
  };
}

export function App() {
  const [master, setMaster] = useState<MasterDataSnapshot>();
  const [profiles, setProfiles] = useState<ProfileCollection>();
  const [loading, setLoading] = useState(true);
  const [startupWarning, setStartupWarning] = useState('');
  const [page, setPage] = useState<Page>('home');
  useEffect(() => {
    async function bootstrap() {
      let active = await loadActiveMaster();
      const saved = await repository.load();
      if (active) {
        try {
          const candidate = await fetchMasterCandidate(import.meta.env.BASE_URL);
          if (!import.meta.env.DEV && candidate.manifest.artifactKind === 'diagnostic')
            throw new Error('diagnostic_fixture_cannot_be_activated');
          if (candidate.manifest.masterDataVersion !== active.manifest.masterDataVersion)
            active = await stageAndActivate(candidate.manifest, candidate.snapshot, new Date());
        } catch (cause) {
          setStartupWarning(
            `更新に失敗したため互換性確認済みの ${active.manifest.masterDataVersion} を使用中: ${cause instanceof Error ? cause.message : String(cause)}`,
          );
        }
      }
      if (active && saved) {
        setMaster(active.snapshot);
        setProfiles(saved);
      }
      setLoading(false);
    }
    void bootstrap();
  }, []);
  async function persist(next: ProfileCollection) {
    setProfiles(next);
    await repository.replace(next);
  }
  if (loading)
    return (
      <main className="setup">
        <p role="status">起動時のデータ更新を確認しています…</p>
      </main>
    );
  if (!master || !profiles)
    return (
      <Setup
        onComplete={(nextMaster, nextProfiles) => {
          setMaster(nextMaster);
          setProfiles(nextProfiles);
        }}
      />
    );
  const currentProfiles = profiles;
  const currentMaster = master;
  const profile = activeProfile(currentProfiles);
  const servant = currentMaster.servants[0]!;
  const build = profile.servantBuilds[servant.id];
  const input = calcInput(currentMaster, build);
  const versions = {
    schemaVersion: SCHEMA_VERSION,
    masterDataVersion: currentMaster.version,
    engineVersion: ENGINE_VERSION,
    appVersion: APP_VERSION,
    gameRegion: 'JP' as const,
    masterDataLocale: 'ja-JP' as const,
  };
  const result = calculateNpDamage(input, versions);
  async function updateBuild(patch: Partial<ServantBuild>) {
    const current = build ?? defaultServantBuild(servant.id, clock);
    const nextBuild = {
      ...current,
      ...patch,
      servantId: servant.id,
      updatedAt: new Date().toISOString(),
    };
    const nextProfile = {
      ...profile,
      servantBuilds: { ...profile.servantBuilds, [servant.id]: nextBuild },
      updatedAt: new Date().toISOString(),
    };
    await persist({
      ...currentProfiles,
      profiles: currentProfiles.profiles.map((item) =>
        item.profileId === profile.profileId ? nextProfile : item,
      ),
    });
  }
  return (
    <div className="shell">
      <a className="skip" href="#main">
        本文へ移動
      </a>
      <aside>
        <div className="brand">
          <span>FL</span>
          <strong>{t('app.name')}</strong>
        </div>
        <nav aria-label="主要">
          <ul>
            {nav.map(([id, label]) => (
              <li key={id}>
                <button aria-current={page === id ? 'page' : undefined} onClick={() => setPage(id)}>
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <p className="utility">
          DB {currentMaster.version}
          <br />
          端末内に自動保存
          {startupWarning && (
            <>
              <br />
              {startupWarning}
            </>
          )}
        </p>
      </aside>
      <main id="main">
        <header>
          <p className="eyebrow">非公式・非営利 / JP DATA</p>
          <h1>{nav.find(([id]) => id === page)?.[1]}</h1>
        </header>
        {page === 'home' && (
          <Home
            result={result.results[input.npLevel - 1]?.average ?? 0}
            owned={build?.npLevel ? 1 : 0}
            onNavigate={setPage}
          />
        )}{' '}
        {page === 'calculate' && <Calculator input={input} result={result} />}{' '}
        {page === 'servants' && (
          <Servants name={servant.name} build={build} onChange={updateBuild} />
        )}{' '}
        {page === 'ce' && <CraftEssences count={profile.craftEssences.length} />}{' '}
        {page === 'support' && <Empty title="支援条件" action="支援条件を作成" />}{' '}
        {page === 'ranking' && <Ranking name={servant.name} average={result.results[0]!.average} />}{' '}
        {page === 'growth' && <Growth master={currentMaster} profile={profile} />}{' '}
        {page === 'data' && (
          <DataPage
            profiles={currentProfiles}
            masterVersion={currentMaster.version}
            onImport={(next) => void persist(next)}
          />
        )}{' '}
      </main>
      <BottomNav page={page} setPage={setPage} />
    </div>
  );
}
function Home({
  result,
  owned,
  onNavigate,
}: {
  result: number;
  owned: number;
  onNavigate: (page: Page) => void;
}) {
  return (
    <div className="home-grid">
      <section className="primary-module">
        <p className="eyebrow">PRIMARY</p>
        <h2>前回の計算</h2>
        <p className="hero-number">{numberFormatter.format(result)}</p>
        <p>検証用セイバー・NP1平均</p>
        <button className="primary" onClick={() => onNavigate('calculate')}>
          条件を開く
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
    </div>
  );
}
function Calculator({
  input,
  result,
}: {
  input: CalcInput;
  result: ReturnType<typeof calculateNpDamage>;
}) {
  return (
    <div className="worksheet">
      <section>
        <h2>計算条件</h2>
        <dl className="input-list">
          <div>
            <dt>攻撃役</dt>
            <dd>検証用セイバー Lv.{input.attackerLevel}</dd>
          </div>
          <div>
            <dt>攻撃対象</dt>
            <dd>Lancer / Earth</dd>
          </div>
          <div>
            <dt>計算精度</dt>
            <dd>
              <span className="badge">{result.precision}</span>
            </dd>
          </div>
        </dl>
        <p className="notice">
          診断fixtureの標準式です。production masterが揃うまでexactとして公開しません。
        </p>
      </section>
      <section data-share-card>
        <h2>宝具ダメージ</h2>
        <table>
          <caption>宝具レベル別のダメージ</caption>
          <thead>
            <tr>
              <th>宝具Lv</th>
              <th>平均</th>
              <th>最低</th>
              <th>最大</th>
            </tr>
          </thead>
          <tbody>
            {result.results.map((row) => (
              <tr
                key={row.npLevel}
                aria-current={row.npLevel === input.npLevel ? 'true' : undefined}
              >
                <th>
                  NP{row.npLevel}
                  {row.npLevel === input.npLevel && <small> 現在</small>}
                </th>
                <td className="average">{numberFormatter.format(row.average)}</td>
                <td>{numberFormatter.format(row.minimum)}</td>
                <td>{numberFormatter.format(row.maximum)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <details>
          <summary>計算内訳・仮定</summary>
          <ul>
            {result.assumptions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      </section>
    </div>
  );
}
function Servants({
  name,
  build,
  onChange,
}: {
  name: string;
  build: ServantBuild | undefined;
  onChange: (patch: Partial<ServantBuild>) => Promise<void>;
}) {
  return (
    <div className="master-detail">
      <section>
        <label>
          検索
          <input type="search" placeholder="名称・クラス" />
        </label>
        <button className="list-row" aria-current="true">
          <strong>{name}</strong>
          <span>{build?.npLevel ? `NP${build.npLevel}` : 'NP0・未所持'}</span>
        </button>
      </section>
      <section>
        <div role="tablist">
          <button role="tab" aria-selected="true">
            現在値
          </button>
          <button role="tab" aria-selected="false">
            育成目標
          </button>
        </div>
        <h2>{name}</h2>
        <label>
          宝具Lv
          <select
            value={build?.npLevel ?? 0}
            onChange={(event) => void onChange({ npLevel: Number(event.target.value) })}
          >
            {[0, 1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {value === 0 ? 'NP0・未所持' : `NP${value}`}
              </option>
            ))}
          </select>
        </label>
        <label>
          レベル
          <input
            type="number"
            min="1"
            max="120"
            value={build?.level ?? 1}
            onChange={(event) => void onChange({ level: Number(event.target.value) })}
          />
        </label>
        <p aria-live="polite">妥当な変更は端末内へ自動保存されます。</p>
      </section>
    </div>
  );
}
function CraftEssences({ count }: { count: number }) {
  return <Empty title={`登録済み ${count}枚`} action="DBから礼装を登録" />;
}
function Ranking({ name, average }: { name: string; average: number }) {
  return (
    <section>
      <div className="toolbar">
        <label>
          対象範囲
          <select>
            <option>全サーヴァント</option>
            <option>所持サーヴァント</option>
          </select>
        </label>
        <label>
          クラス
          <select>
            <option>すべて</option>
            <option>Saber</option>
          </select>
        </label>
      </div>
      <table>
        <caption>共通条件の平均ダメージ順</caption>
        <thead>
          <tr>
            <th>順位</th>
            <th>サーヴァント</th>
            <th>平均</th>
            <th>状態</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1</td>
            <th>{name}</th>
            <td className="average">{numberFormatter.format(average)}</td>
            <td>exact</td>
          </tr>
        </tbody>
      </table>
      <p className="notice">
        production masterではWorkerで全攻撃宝具を計算し、unsupportedを別枠にします。
      </p>
    </section>
  );
}
function Growth({
  master,
  profile,
}: {
  master: MasterDataSnapshot;
  profile: ReturnType<typeof activeProfile>;
}) {
  const ledger = calculateGrowthLedger(
    master.servants,
    master.materials,
    profile.servantBuilds,
    profile.servantTargets,
  );
  return (
    <section>
      <p className="notice">種火条件: 星5・クラス一致・成功ボーナスなし</p>
      {ledger.length === 0 ? (
        <Empty title="計画中の育成目標はありません" action="所持・育成で目標を設定" />
      ) : (
        <table>
          <caption>必要素材台帳</caption>
          <thead>
            <tr>
              <th>素材</th>
              <th>必要数</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((entry) => (
              <tr key={entry.material.id}>
                <th>{entry.material.name}</th>
                <td>{entry.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
function DataPage({
  profiles,
  masterVersion,
  onImport,
}: {
  profiles: ProfileCollection;
  masterVersion: string;
  onImport: (profiles: ProfileCollection) => void;
}) {
  const [message, setMessage] = useState('');
  const backup = useMemo<UserDataBackup>(
    () => ({
      kind: 'fgo-lab-user-backup',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      profiles,
    }),
    [profiles],
  );
  function download() {
    const url = URL.createObjectURL(new Blob([exportBackup(backup)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'fgo-lab-backup.json';
    link.click();
    URL.revokeObjectURL(url);
    setMessage('バックアップを保存しました');
  }
  return (
    <section>
      <dl>
        <div>
          <dt>マスターデータ版</dt>
          <dd>{masterVersion}</dd>
        </div>
        <div>
          <dt>schema版</dt>
          <dd>1</dd>
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
                  onImport(parsed.profiles);
                  setMessage('検証後に復元しました');
                })
                .catch(() => setMessage('復元できませんでした'));
          }}
        />
      </label>
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
function Empty({ title, action }: { title: string; action: string }) {
  return (
    <section className="empty">
      <h2>{title}</h2>
      <p>この機能の保存境界と空状態は準備済みです。</p>
      <button>{action}</button>
    </section>
  );
}
function BottomNav({ page, setPage }: { page: Page; setPage: (page: Page) => void }) {
  return (
    <nav className="bottom-nav" aria-label="モバイル主要">
      <button aria-current={page === 'home' ? 'page' : undefined} onClick={() => setPage('home')}>
        ホーム
      </button>
      <button
        aria-current={page === 'calculate' ? 'page' : undefined}
        onClick={() => setPage('calculate')}
      >
        計算
      </button>
      <button
        aria-current={page === 'servants' ? 'page' : undefined}
        onClick={() => setPage('servants')}
      >
        所持
      </button>
      <button
        aria-current={page === 'growth' ? 'page' : undefined}
        onClick={() => setPage('growth')}
      >
        育成
      </button>
      <button aria-current={page === 'data' ? 'page' : undefined} onClick={() => setPage('data')}>
        データ
      </button>
    </nav>
  );
}
