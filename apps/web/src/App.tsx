import { useEffect, useMemo, useState } from 'react';
import type { CraftEssenceMaster, MasterDataSnapshot, ServantMaster } from '@fgo-lab/master-data';
import {
  calculateGrowthLedger,
  filterAndSortLedger,
  createProfileCollection,
  defaultServantBuild,
  activeProfile,
  type Clock,
  type IdGenerator,
} from '@fgo-lab/profile-domain';
import { calculateNpDamage } from '@fgo-lab/calc-core';
import { finalizeHistory, inputFingerprint } from '@fgo-lab/workspace-domain';
import type {
  CalcInput,
  CraftEssenceCopy,
  LocalProfile,
  ProfileCollection,
  ServantBuild,
  ServantTarget,
  SupportTemplate,
  UserDataBackup,
} from '@fgo-lab/schema';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import {
  IndexedDbProfileRepository,
  clearUserData,
  fetchMasterCandidate,
  loadActiveMaster,
  stageAndActivate,
} from './adapters/repository';
import { createShareFragment, exportBackup, importBackup, resultCardPng } from './adapters/share';
import { numberFormatter, t } from './i18n';
import { useRanking } from './useRanking';

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
const ENGINE_RELEASE_VALIDATED = import.meta.env['VITE_ENGINE_RELEASE_VALIDATED'] === 'true';
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
        <small>取得した版はchecksum・schema・参照整合性の検証後にだけ有効化します。</small>
      </section>
    </main>
  );
}

function calcInput(
  master: MasterDataSnapshot,
  build: ServantBuild | undefined,
  servant = master.servants[0]!,
): CalcInput {
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
  const [calculationSessionId] = useState(() => crypto.randomUUID());
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
  const calculatedResult = calculateNpDamage(input, versions);
  const result = !ENGINE_RELEASE_VALIDATED
    ? {
        ...calculatedResult,
        precision: 'approximate' as const,
        warnings: [...calculatedResult.warnings, 'diagnostic_fixture_not_release_validated'],
      }
    : calculatedResult;
  async function updateBuild(servantId: string, patch: Partial<ServantBuild>) {
    const current = profile.servantBuilds[servantId] ?? defaultServantBuild(servantId, clock);
    const nextBuild = {
      ...current,
      ...patch,
      servantId,
      updatedAt: new Date().toISOString(),
    };
    const nextProfile = {
      ...profile,
      servantBuilds: { ...profile.servantBuilds, [servantId]: nextBuild },
      updatedAt: new Date().toISOString(),
    };
    await persist({
      ...currentProfiles,
      profiles: currentProfiles.profiles.map((item) =>
        item.profileId === profile.profileId ? nextProfile : item,
      ),
    });
  }
  async function replaceProfile(nextProfile: LocalProfile) {
    await persist({
      ...currentProfiles,
      profiles: currentProfiles.profiles.map((item) =>
        item.profileId === nextProfile.profileId ? nextProfile : item,
      ),
    });
  }
  async function updateTarget(servantId: string, patch: Partial<ServantTarget>) {
    const timestamp = new Date().toISOString();
    const servantBuild = profile.servantBuilds[servantId];
    const current = profile.servantTargets[servantId] ?? {
      servantId,
      level: servantBuild?.level ?? 1,
      ascension: servantBuild?.ascension ?? 0,
      fouAtk: servantBuild?.fouAtk ?? 0,
      skills: servantBuild?.skills ?? {},
      appends: servantBuild?.appends ?? {},
      planned: true,
      updatedAt: timestamp,
    };
    await replaceProfile({
      ...profile,
      servantTargets: {
        ...profile.servantTargets,
        [servantId]: { ...current, ...patch, servantId, updatedAt: timestamp },
      },
      updatedAt: timestamp,
    });
  }
  async function addCraftEssence(craftEssenceId: string) {
    const copy: CraftEssenceCopy = {
      copyId: crypto.randomUUID(),
      craftEssenceId,
      level: 1,
      limitBreak: 0,
      updatedAt: new Date().toISOString(),
    };
    await replaceProfile({ ...profile, craftEssences: [...profile.craftEssences, copy] });
  }
  async function removeCraftEssence(copyId: string) {
    await replaceProfile({
      ...profile,
      craftEssences: profile.craftEssences.filter((copy) => copy.copyId !== copyId),
    });
  }
  async function addSupportTemplate() {
    const template: SupportTemplate = {
      templateId: crypto.randomUUID(),
      name: `支援条件 ${String(profile.supportTemplates.length + 1)}`,
      masterDataVersion: currentMaster.version,
      effects: [],
      updatedAt: new Date().toISOString(),
      lastUsedAt: null,
    };
    await replaceProfile({
      ...profile,
      supportTemplates: [...profile.supportTemplates, template],
    });
  }
  async function finalizeCurrentCalculation() {
    const fingerprint = await inputFingerprint(
      input,
      currentMaster.version,
      ENGINE_VERSION,
      async (data) => crypto.subtle.digest('SHA-256', new Uint8Array(data)),
    );
    await replaceProfile(
      finalizeHistory(profile, {
        sessionId: calculationSessionId,
        input,
        result,
        fingerprint,
        now: new Date().toISOString(),
        historyId: crypto.randomUUID(),
      }),
    );
  }
  async function navigate(nextPage: Page) {
    if (page === 'calculate' && nextPage !== 'calculate') await finalizeCurrentCalculation();
    setPage(nextPage);
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
                <button
                  aria-current={page === id ? 'page' : undefined}
                  onClick={() => void navigate(id)}
                >
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
            attackerName={servant.name}
            owned={build?.npLevel ? 1 : 0}
            hasHistory={profile.history.length > 0}
            onNavigate={(next) => void navigate(next)}
          />
        )}{' '}
        {page === 'calculate' && (
          <Calculator
            input={input}
            result={result}
            attackerName={servant.name}
            onFinalize={finalizeCurrentCalculation}
          />
        )}{' '}
        {page === 'servants' && (
          <Servants
            servants={currentMaster.servants}
            builds={profile.servantBuilds}
            targets={profile.servantTargets}
            onChange={updateBuild}
            onTargetChange={updateTarget}
          />
        )}{' '}
        {page === 'ce' && (
          <CraftEssences
            copies={profile.craftEssences}
            masters={currentMaster.craftEssences}
            onAdd={addCraftEssence}
            onRemove={removeCraftEssence}
          />
        )}{' '}
        {page === 'support' && (
          <SupportTemplates templates={profile.supportTemplates} onAdd={addSupportTemplate} />
        )}{' '}
        {page === 'ranking' && (
          <Ranking
            candidates={currentMaster.servants.map((candidate) => ({
              servantId: candidate.id,
              name: candidate.name,
              input: calcInput(currentMaster, profile.servantBuilds[candidate.id], candidate),
              classId: candidate.classId,
              rarity: candidate.rarity,
              npCard: candidate.npCard,
              npTarget: candidate.npTarget,
              owned: (profile.servantBuilds[candidate.id]?.npLevel ?? 0) > 0,
            }))}
            versions={versions}
          />
        )}{' '}
        {page === 'growth' && <Growth master={currentMaster} profile={profile} />}{' '}
        {page === 'data' && (
          <DataPage
            profiles={currentProfiles}
            masterVersion={currentMaster.version}
            onImport={(next) => void persist(next)}
          />
        )}{' '}
      </main>
      <BottomNav page={page} setPage={(next) => void navigate(next)} />
    </div>
  );
}
function Home({
  result,
  attackerName,
  owned,
  hasHistory,
  onNavigate,
}: {
  result: number;
  attackerName: string;
  owned: number;
  hasHistory: boolean;
  onNavigate: (page: Page) => void;
}) {
  return (
    <div className="home-grid">
      <section className="primary-module">
        <p className="eyebrow">PRIMARY</p>
        <h2>{hasHistory ? '前回の計算' : '最初の計算を始める'}</h2>
        <p className="hero-number">{numberFormatter.format(result)}</p>
        <p>
          {hasHistory ? `${attackerName}・保存済みの最終条件` : `${attackerName}・NP1の初期条件`}
        </p>
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
  attackerName,
  onFinalize,
}: {
  input: CalcInput;
  result: ReturnType<typeof calculateNpDamage>;
  attackerName: string;
  onFinalize: () => Promise<void>;
}) {
  const [message, setMessage] = useState('');
  const snapshot = {
    kind: 'fgo-lab-calculation-share' as const,
    schemaVersion: 1 as const,
    sharedAt: new Date().toISOString(),
    input,
    result,
  };
  async function copyUrl() {
    try {
      await onFinalize();
      const url = new URL(location.href);
      url.hash = createShareFragment(snapshot);
      await navigator.clipboard.writeText(url.toString());
      setMessage('共有URLをコピーしました');
    } catch (cause) {
      setMessage(
        cause instanceof RangeError
          ? 'URLが長いため共有専用JSONまたは画像を使用してください'
          : 'URLをコピーできませんでした',
      );
    }
  }
  async function saveImage() {
    try {
      await onFinalize();
      const url = URL.createObjectURL(await resultCardPng(snapshot));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'fgo-lab-result.png';
      link.click();
      URL.revokeObjectURL(url);
      setMessage('結果画像を保存しました');
    } catch {
      setMessage('画像を保存できません。結果カードをスクリーンショットしてください。');
    }
  }
  return (
    <div className="worksheet">
      <section>
        <h2>計算条件</h2>
        <dl className="input-list">
          <div>
            <dt>攻撃役</dt>
            <dd>
              {attackerName} Lv.{input.attackerLevel}
            </dd>
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
          特殊Functionの差分検証が完了するまで、結果精度はapproximateとして表示します。
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
        <div className="toolbar">
          <button onClick={() => void saveImage()}>画像として保存</button>
          <button onClick={() => void copyUrl()}>URLをコピー</button>
        </div>
        <p aria-live="polite">{message}</p>
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
  servants,
  builds,
  targets,
  onChange,
  onTargetChange,
}: {
  servants: ServantMaster[];
  builds: Record<string, ServantBuild>;
  targets: Record<string, ServantTarget>;
  onChange: (servantId: string, patch: Partial<ServantBuild>) => Promise<void>;
  onTargetChange: (servantId: string, patch: Partial<ServantTarget>) => Promise<void>;
}) {
  const [tab, setTab] = useState<'current' | 'target'>('current');
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<'all' | 'owned' | 'unowned'>('all');
  const [selectedId, setSelectedId] = useState(servants[0]?.id ?? '');
  const visible = servants.filter((candidate) => {
    const owned = (builds[candidate.id]?.npLevel ?? 0) > 0;
    return (
      candidate.name.toLocaleLowerCase('ja').includes(search.toLocaleLowerCase('ja')) &&
      (scope === 'all' || (scope === 'owned' ? owned : !owned))
    );
  });
  const selected = servants.find((candidate) => candidate.id === selectedId) ?? visible[0];
  const build = selected ? builds[selected.id] : undefined;
  const target = selected ? targets[selected.id] : undefined;
  return (
    <div className="master-detail">
      <section>
        <label>
          検索
          <input
            type="search"
            placeholder="名称・クラス"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div className="toolbar" aria-label="所持状態フィルター">
          {(['all', 'owned', 'unowned'] as const).map((value) => (
            <button key={value} aria-pressed={scope === value} onClick={() => setScope(value)}>
              {value === 'all' ? '全件' : value === 'owned' ? '所持のみ' : '未所持のみ'}
            </button>
          ))}
        </div>
        <p>{visible.length}騎</p>
        <div className="servant-list" role="list" aria-label="サーヴァント一覧">
          {visible.map((candidate) => (
            <button
              role="listitem"
              key={candidate.id}
              className="list-row"
              aria-current={selected?.id === candidate.id ? 'true' : undefined}
              onClick={() => setSelectedId(candidate.id)}
            >
              <strong>{candidate.name}</strong>
              <span>
                {builds[candidate.id]?.npLevel
                  ? `NP${String(builds[candidate.id]?.npLevel)}`
                  : 'NP0・未所持'}
              </span>
            </button>
          ))}
        </div>
      </section>
      <section>
        {!selected ? (
          <p>条件に一致するサーヴァントはいません。</p>
        ) : (
          <>
            <div role="tablist">
              <button
                role="tab"
                aria-selected={tab === 'current'}
                onClick={() => setTab('current')}
              >
                現在値
              </button>
              <button role="tab" aria-selected={tab === 'target'} onClick={() => setTab('target')}>
                育成目標
              </button>
            </div>
            <h2>{selected.name}</h2>
            {tab === 'current' && (
              <label>
                宝具Lv
                <select
                  value={build?.npLevel ?? 0}
                  onChange={(event) =>
                    void onChange(selected.id, { npLevel: Number(event.target.value) })
                  }
                >
                  {[0, 1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>
                      {value === 0 ? 'NP0・未所持' : `NP${value}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              レベル
              <input
                type="number"
                min="1"
                max="120"
                value={
                  tab === 'current' ? (build?.level ?? 1) : (target?.level ?? build?.level ?? 1)
                }
                onChange={(event) =>
                  void (tab === 'current'
                    ? onChange(selected.id, { level: Number(event.target.value) })
                    : onTargetChange(selected.id, {
                        level: Number(event.target.value),
                        planned: true,
                      }))
                }
              />
            </label>
            <label>
              スキル1
              <input
                type="number"
                min="1"
                max="10"
                value={
                  tab === 'current' ? (build?.skills['1'] ?? 1) : (target?.skills['1'] ?? 1)
                }
                onChange={(event) => {
                  const level = Number(event.target.value);
                  if (tab === 'current')
                    void onChange(selected.id, {
                      skills: { ...build?.skills, '1': level },
                    });
                  else
                    void onTargetChange(selected.id, {
                      skills: { ...target?.skills, '1': level },
                      planned: true,
                    });
                }}
              />
            </label>
            <div className="toolbar">
              {[90, 100, 120].map((level) => (
                <button
                  key={level}
                  onClick={() =>
                    void (tab === 'current'
                      ? onChange(selected.id, { level })
                      : onTargetChange(selected.id, { level, planned: true }))
                  }
                >
                  Lv{level}
                </button>
              ))}
              <button
                onClick={() =>
                  void (tab === 'current'
                    ? onChange(selected.id, { skills: { ...build?.skills, '1': 10 } })
                    : onTargetChange(selected.id, {
                        skills: { ...target?.skills, '1': 10 },
                        planned: true,
                      }))
                }
              >
                スキル全て10
              </button>
            </div>
            {tab === 'target' && (
              <label>
                <input
                  type="checkbox"
                  checked={target?.planned ?? false}
                  onChange={(event) =>
                    void onTargetChange(selected.id, { planned: event.target.checked })
                  }
                />
                育成計画へ含める
              </label>
            )}
            <p aria-live="polite">妥当な変更は端末内へ自動保存されます。</p>
          </>
        )}
      </section>
    </div>
  );
}
function CraftEssences({
  copies,
  masters,
  onAdd,
  onRemove,
}: {
  copies: CraftEssenceCopy[];
  masters: CraftEssenceMaster[];
  onAdd: (craftEssenceId: string) => Promise<void>;
  onRemove: (copyId: string) => Promise<void>;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState('');
  const names = new Map(masters.map((master) => [master.id, master.name]));
  const candidates = masters
    .filter((master) =>
      master.name.toLocaleLowerCase('ja').includes(search.toLocaleLowerCase('ja')),
    )
    .slice(0, 100);
  return (
    <section>
      <h2>登録済み {copies.length}枚</h2>
      <button className="primary" onClick={() => setDialogOpen(true)}>
        DBから礼装を登録
      </button>
      <ul className="plain-list" aria-label="登録済み概念礼装">
        {copies.map((copy, index) => (
          <li key={copy.copyId}>
            <span>
              <strong>{names.get(copy.craftEssenceId) ?? copy.craftEssenceId}</strong> {index + 1}
              枚目 / Lv.{copy.level} / 未凸
            </span>
            <button onClick={() => void onRemove(copy.copyId)}>登録解除</button>
          </li>
        ))}
      </ul>
      {dialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ce-dialog-title"
          className="dialog"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setDialogOpen(false);
          }}
        >
          <div className="dialog-panel">
            <h2 id="ce-dialog-title">概念礼装を検索</h2>
            <label>
              礼装名
              <input value={search} onChange={(event) => setSearch(event.target.value)} autoFocus />
            </label>
            <ul className="plain-list" aria-label="概念礼装DB検索結果">
              {candidates.map((master) => (
                <li key={master.id}>
                  <span>{master.name}</span>
                  <button
                    onClick={() => {
                      void onAdd(master.id);
                      setDialogOpen(false);
                    }}
                  >
                    登録
                  </button>
                </li>
              ))}
            </ul>
            <button onClick={() => setDialogOpen(false)}>閉じる</button>
          </div>
        </div>
      )}
    </section>
  );
}
function SupportTemplates({
  templates,
  onAdd,
}: {
  templates: SupportTemplate[];
  onAdd: () => Promise<void>;
}) {
  return (
    <section>
      <button className="primary" onClick={() => void onAdd()}>
        支援条件を作成
      </button>
      {templates.length === 0 ? (
        <p>保存済みの支援条件はありません。</p>
      ) : (
        <ul className="plain-list" aria-label="保存済み支援条件">
          {templates.map((template) => (
            <li key={template.templateId}>
              <strong>{template.name}</strong>
              <span>
                {template.effects.length}効果 / DB {template.masterDataVersion}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
function Ranking({
  candidates,
  versions,
}: {
  candidates: {
    servantId: string;
    name: string;
    input: CalcInput;
    classId: string;
    rarity: number;
    npCard: string;
    npTarget: string;
    owned: boolean;
  }[];
  versions: Parameters<typeof calculateNpDamage>[1];
}) {
  const ranking = useRanking(candidates, versions);
  const [classId, setClassId] = useState('any');
  const [card, setCard] = useState('any');
  const [target, setTarget] = useState('any');
  const [rarity, setRarity] = useState('any');
  const [scope, setScope] = useState<'all' | 'owned'>('all');
  const rows = ranking.rows.filter(
    (row) =>
      (classId === 'any' || row.classId === classId) &&
      (card === 'any' || row.npCard === card) &&
      (target === 'any' || row.npTarget === target) &&
      (rarity === 'any' || row.rarity === Number(rarity)) &&
      (scope === 'all' || row.owned),
  );
  return (
    <section>
      <div className="toolbar">
        <label>
          対象範囲
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value as 'all' | 'owned')}
          >
            <option value="all">全サーヴァント</option>
            <option value="owned">所持サーヴァント</option>
          </select>
        </label>
        <label>
          クラス
          <select value={classId} onChange={(event) => setClassId(event.target.value)}>
            <option value="any">すべて</option>
            <option value="saber">Saber</option>
          </select>
        </label>
        <label>
          宝具カード
          <select value={card} onChange={(event) => setCard(event.target.value)}>
            <option value="any">すべて</option>
            <option value="buster">Buster</option>
            <option value="arts">Arts</option>
            <option value="quick">Quick</option>
          </select>
        </label>
        <label>
          宝具範囲
          <select value={target} onChange={(event) => setTarget(event.target.value)}>
            <option value="any">すべて</option>
            <option value="single">単体</option>
            <option value="all">全体</option>
          </select>
        </label>
        <label>
          レアリティ
          <select value={rarity} onChange={(event) => setRarity(event.target.value)}>
            <option value="any">すべて</option>
            {[5, 4, 3, 2, 1, 0].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
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
          {rows.map((row, index) => (
            <tr key={row.servantId}>
              <td>{index + 1}</td>
              <th>{row.name}</th>
              <td className="average">{numberFormatter.format(row.average)}</td>
              <td>{row.precision}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p role="status" className="notice">
        {ranking.loading
          ? 'Workerで計算中…'
          : `${String(rows.length)}件表示 / ${String(ranking.rows.length)}件をWorkerで計算・unsupported ${String(ranking.unsupported.length)}件`}
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
  const [search, setSearch] = useState('');
  const [order, setOrder] = useState<'game' | 'amount' | 'name'>('game');
  const [selectedId, setSelectedId] = useState<string>();
  const ledger = calculateGrowthLedger(
    master.servants,
    master.materials,
    profile.servantBuilds,
    profile.servantTargets,
  );
  const visible = filterAndSortLedger(ledger, search, 'all', order);
  const selected = ledger.find((entry) => entry.material.id === selectedId) ?? visible[0];
  const servantNames = new Map(master.servants.map((servant) => [servant.id, servant.name]));
  return (
    <section>
      <p className="notice">種火条件: 星5・クラス一致・成功ボーナスなし</p>
      {ledger.length === 0 ? (
        <Empty title="計画中の育成目標はありません" action="所持・育成で目標を設定" />
      ) : (
        <>
          <div className="toolbar">
            <label>
              素材名検索
              <input value={search} onChange={(event) => setSearch(event.target.value)} />
            </label>
            <label>
              並び順
              <select
                value={order}
                onChange={(event) => setOrder(event.target.value as typeof order)}
              >
                <option value="game">ゲーム内順</option>
                <option value="amount">必要数順</option>
                <option value="name">素材名順</option>
              </select>
            </label>
          </div>
          <div className="growth-layout">
            <table>
              <caption>必要素材台帳</caption>
              <thead>
                <tr>
                  <th>素材</th>
                  <th>必要数</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((entry) => (
                  <tr
                    key={entry.material.id}
                    aria-current={selected?.material.id === entry.material.id ? 'true' : undefined}
                  >
                    <th>
                      <button onClick={() => setSelectedId(entry.material.id)}>
                        {entry.material.name}
                      </button>
                    </th>
                    <td>{entry.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <aside className="usage-detail" aria-label="素材の使用先">
              <h2>{selected?.material.name ?? '素材を選択'}</h2>
              <ul className="plain-list">
                {selected?.usages.map((usage) => (
                  <li key={`${usage.servantId}:${usage.purpose}`}>
                    <span>
                      {servantNames.get(usage.servantId) ?? usage.servantId}
                      <br />
                      <small>{usage.purpose}</small>
                    </span>
                    <strong>{usage.amount}</strong>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </>
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
