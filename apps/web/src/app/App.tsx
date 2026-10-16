'use client';

import './shell.css';
import type { Route } from 'next';
import { usePathname, useRouter } from 'next/navigation';
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import {
  activeProfile,
  addCraftEssenceCopy,
  addSupportServant,
  addSupportTemplate as appendSupportTemplate,
  removeCraftEssenceCopy,
  removeSupportSource as deleteSupportSource,
  removeSupportTemplate as deleteSupportTemplate,
  updateCraftEssenceCopy,
  updateServantBuild as patchServantBuild,
  updateServantTarget as patchServantTarget,
  toggleSupportEffect as patchSupportEffect,
  updateSupportSkill as patchSupportSkill,
  updateSupportTemplate as patchSupportTemplate,
  type Clock,
  type IdGenerator,
} from '@fgo-lab/profile-domain';
import type {
  CalculationResult,
  CraftEssenceCopy,
  PortableCalculationRequest,
  ServantBuild,
  ServantTarget,
  SupportEffectRef,
  SupportTemplate,
} from '@fgo-lab/schema';
import type { PortableVersionUpgradeResult } from '@fgo-lab/calculation-application';
import { loadActiveAtlasMaster } from '../adapters/atlasRepository';
import { ATLAS_CONTRACT_SHA256 } from '../adapters/atlasContractFingerprint';
import { isAtlasTransportFailure } from '../adapters/atlasSource';
import { IndexedDbProfileRepository } from '../adapters/repository';
import { OldTabBlocksUpgrade } from '../adapters/labDatabase';
import { t } from '../ui/i18n';
import { masterVersionLabel } from '../ui/masterVersion';
import {
  bootstrapApplication,
  refreshAtlasMaster,
  setupApplication,
  type ReadyStartupResult,
} from './startup';
import { StartupScreen } from './StartupScreen';
import { useProfileCollection } from './useProfileCollection';
import { createCalculationMutationGate, type UpdateActiveProfile } from './portableDraft';

export type Page =
  'home' | 'calculate' | 'ranking' | 'servants' | 'ce' | 'support' | 'growth' | 'data';
const pagePaths = {
  home: '/',
  calculate: '/calculator',
  ranking: '/ranking',
  servants: '/servants',
  ce: '/craft-essences',
  support: '/supports',
  growth: '/growth',
  data: '/data',
} as const satisfies Record<Page, string>;
const pagesByPath = new Map<string, Page>(
  Object.entries(pagePaths).map(([page, path]) => [path, page as Page]),
);
const DataPage = lazy(async () => ({
  default: (await import('../features/data/DataPage')).DataPage,
}));
const CalculatorRoute = lazy(async () => ({
  default: (await import('./CalculatorRoute')).CalculatorRoute,
}));
const HomeRoute = lazy(async () => ({
  default: (await import('./HomeRoute')).HomeRoute,
}));
const RankingRoute = lazy(async () => ({
  default: (await import('./RankingRoute')).RankingRoute,
}));
const CraftEssences = lazy(async () => ({
  default: (await import('../features/profile/CraftEssences')).CraftEssences,
}));
const Growth = lazy(async () => ({
  default: (await import('../features/growth/Growth')).Growth,
}));
const Servants = lazy(async () => ({
  default: (await import('../features/profile/Servants')).Servants,
}));
const SupportTemplates = lazy(async () => ({
  default: (await import('../features/profile/SupportTemplates')).SupportTemplates,
}));

function pageFromPathname(pathname: string): Page | null {
  const normalized = pathname === '/' ? pathname : pathname.replace(/\/+$/, '');
  return pagesByPath.get(normalized) ?? null;
}

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
const mainNav: readonly Page[] = [
  'home',
  'calculate',
  'ranking',
  'servants',
  'ce',
  'support',
  'growth',
];
const repository = new IndexedDbProfileRepository();
const clock: Clock = { now: () => new Date() };
const ids: IdGenerator = { next: () => crypto.randomUUID() };

export interface CalculationWorkspace {
  request: PortableCalculationRequest | undefined;
  storedResult: CalculationResult | undefined;
  source: 'share' | 'draft' | 'history' | undefined;
  upgradeAttempt?: Extract<PortableVersionUpgradeResult, { status: 'rejected' }>;
}

function Setup({
  onComplete,
  startupWarning,
  invalidStoredProfiles,
}: {
  onComplete: (result: ReadyStartupResult) => Promise<void>;
  startupWarning?: string;
  invalidStoredProfiles: boolean;
}) {
  const [state, setState] = useState<'idle' | 'running' | 'error'>('idle');
  const [error, setError] = useState('');
  const [recoveryRequired, setRecoveryRequired] = useState(invalidStoredProfiles);
  const stale = error === 'profile_recovery_stale' || error === 'profile_initialization_stale';
  async function run() {
    if (
      recoveryRequired &&
      !confirm(
        'この端末に保存された全プロフィール、育成状態、計算履歴を削除して新規開始します。元に戻せません。マスターデータは残ります。実行しますか？',
      )
    )
      return;
    setState('running');
    setError('');
    try {
      await onComplete(
        await setupApplication(
          repository,
          clock,
          ids,
          {
            fragment: location.hash,
            now: new Date(),
          },
          recoveryRequired
            ? async (fresh) => {
                const outcome = await repository.replaceInvalidWithFresh(fresh);
                if (outcome.status === 'committed') setRecoveryRequired(false);
                return outcome;
              }
            : undefined,
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof OldTabBlocksUpgrade
          ? '旧バージョンのタブを閉じて、このページを再読み込みしてください。'
          : cause instanceof TypeError && cause.message === 'atlas_controller_upgrade_required'
            ? '旧Service Workerの更新を待っています。このページを再読み込みしてください。'
            : cause instanceof Error
              ? cause.message
              : String(cause),
      );
      setState('error');
    }
  }
  return state === 'running' ? (
    <StartupScreen mode="updating" notice={startupWarning} />
  ) : (
    <StartupScreen
      mode={state === 'error' ? 'error' : 'setup'}
      notice={startupWarning}
      errorDetail={
        state === 'error'
          ? stale
            ? '保存データが他の画面で変更されました。再読み込みしてください。'
            : error
          : undefined
      }
      actionLabel={
        stale
          ? '再読み込み'
          : recoveryRequired
            ? '保存プロフィールを削除して新規開始'
            : state === 'error'
              ? t('setup.retry')
              : t('setup.start')
      }
      onAction={stale ? () => location.reload() : () => void run()}
    />
  );
}

export function App() {
  const pathname = usePathname();
  const router = useRouter();
  const page = pageFromPathname(pathname);
  const [master, setMaster] = useState<MasterDataSnapshot>();
  const [loading, setLoading] = useState(true);
  const [startupWarning, setStartupWarning] = useState('');
  const [invalidStoredProfiles, setInvalidStoredProfiles] = useState(false);
  const [calculationMutation] = useState(createCalculationMutationGate);
  const {
    profiles,
    undoSnapshot,
    initialize: initializeProfiles,
    updateActive,
    importCollection: importProfiles,
    clear: clearProfiles,
    undo: undoLastChange,
  } = useProfileCollection(repository);
  const [calculation, setCalculation] = useState<CalculationWorkspace>({
    request: undefined,
    storedResult: undefined,
    source: undefined,
  });
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [recoveryFocus, setRecoveryFocus] = useState<'result' | 'error' | null>(null);
  const [calculationSessionId, setCalculationSessionId] = useState(() => crypto.randomUUID());
  const [openTargetTab, setOpenTargetTab] = useState(false);
  const updateActiveProfile = useCallback<UpdateActiveProfile>(
    (update, guard) => {
      if (!guard) calculationMutation.begin();
      return updateActive(update, guard);
    },
    [calculationMutation, updateActive],
  );
  useLayoutEffect(() => {
    calculationMutation.begin();
  }, [calculationMutation, pathname]);
  const calculationFinalizer = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    async function bootstrap() {
      const result = await bootstrapApplication(repository, {
        fragment: location.hash,
        now: new Date(),
      });
      calculationMutation.begin();
      const initialized = await initializeProfiles(result.profiles);
      if (initialized.status !== 'initialized') {
        setStartupWarning('保存データが変わったため初期化できません。再読み込みしてください');
        setLoading(false);
        return;
      }
      setMaster(result.master);
      setCalculation(result.calculation);
      setStartupWarning(result.warning);
      setInvalidStoredProfiles(result.state === 'setup-required' && result.invalidStoredProfiles);
      if (result.offline) setOnline(false);
      if (
        result.calculation.source === 'share' &&
        pageFromPathname(location.pathname) !== 'calculate'
      )
        router.replace(`${pagePaths.calculate}${location.hash}` as Route);
      setLoading(false);
    }
    void bootstrap();
  }, [calculationMutation, initializeProfiles, router]);
  useEffect(() => {
    if (
      'serviceWorker' in navigator &&
      process.env.NODE_ENV === 'production' &&
      process.env.NEXT_PUBLIC_E2E !== 'true'
    )
      void navigator.serviceWorker.register('/sw.js');
  }, []);
  useEffect(() => {
    const onOffline = () => setOnline(false);
    addEventListener('offline', onOffline);
    return () => removeEventListener('offline', onOffline);
  }, []);
  useEffect(() => {
    const activeMaster = master;
    if (!activeMaster) return;
    let busy = false;
    let disposed = false;
    const stillCurrent = () => !disposed;
    async function checkAtlas(currentMaster: MasterDataSnapshot) {
      if (busy || !stillCurrent() || !navigator.onLine) return;
      busy = true;
      try {
        const stored = await loadActiveAtlasMaster(ATLAS_CONTRACT_SHA256);
        if (stored.state !== 'ready') throw new Error(`atlas_active_${stored.state}`);
        const next = await refreshAtlasMaster(stored.active, new Date());
        if (!stillCurrent()) return;
        if (next.changed || next.active.snapshot.version !== currentMaster.version) {
          calculationMutation.begin();
          setMaster(next.active.snapshot);
          setCalculation((current) => ({ ...current, storedResult: undefined }));
        }
        setStartupWarning('');
        setOnline(true);
      } catch (cause) {
        if (stillCurrent()) {
          if (isAtlasTransportFailure(cause)) setOnline(false);
          setStartupWarning(
            `Atlas更新の確認に失敗したため検証済みのマスターを使用中: ${cause instanceof Error ? cause.message : String(cause)}`,
          );
        }
      } finally {
        busy = false;
      }
    }
    const onOnline = () => void checkAtlas(activeMaster);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkAtlas(activeMaster);
    };
    const interval = setInterval(() => void checkAtlas(activeMaster), 10 * 60_000);
    addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    if ('serviceWorker' in navigator)
      navigator.serviceWorker.addEventListener('controllerchange', onOnline);
    return () => {
      disposed = true;
      clearInterval(interval);
      removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      if ('serviceWorker' in navigator)
        navigator.serviceWorker.removeEventListener('controllerchange', onOnline);
    };
  }, [master, calculationMutation]);
  useEffect(() => {
    if (page !== 'calculate') return;
    const finalizeOnHistoryNavigation = () => void calculationFinalizer.current?.();
    addEventListener('popstate', finalizeOnHistoryNavigation);
    return () => removeEventListener('popstate', finalizeOnHistoryNavigation);
  }, [page]);
  if (page === null) return null;
  if (loading) return <StartupScreen mode="checking" />;
  if (!master || !profiles)
    return (
      <Setup
        startupWarning={startupWarning}
        invalidStoredProfiles={invalidStoredProfiles}
        onComplete={async (result) => {
          calculationMutation.begin();
          const initialized = await initializeProfiles(result.profiles);
          if (initialized.status !== 'initialized') throw new Error('profile_initialization_stale');
          setMaster(result.master);
          setCalculation(result.calculation);
          setStartupWarning(result.warning);
          setInvalidStoredProfiles(false);
          if (result.offline) setOnline(false);
          if (result.calculation.source === 'share' && page !== 'calculate')
            router.replace(`${pagePaths.calculate}${location.hash}` as Route);
        }}
      />
    );
  const currentMaster = master;
  const profile = activeProfile(profiles);
  async function updateBuild(servantId: string, patch: Partial<ServantBuild>) {
    const now = new Date().toISOString();
    await updateActiveProfile((current) => patchServantBuild(current, servantId, patch, now));
  }
  async function updateTarget(servantId: string, patch: Partial<ServantTarget>) {
    const now = new Date().toISOString();
    await updateActiveProfile((current) => patchServantTarget(current, servantId, patch, now));
  }
  async function addCraftEssence(craftEssenceId: string) {
    const copyId = crypto.randomUUID();
    const now = new Date().toISOString();
    await updateActiveProfile((current) =>
      addCraftEssenceCopy(current, craftEssenceId, copyId, now),
    );
  }
  async function removeCraftEssence(copyId: string) {
    await updateActiveProfile((current) => removeCraftEssenceCopy(current, copyId));
  }
  async function updateCraftEssence(
    copyId: string,
    patch: Pick<Partial<CraftEssenceCopy>, 'level' | 'limitBreak'>,
  ) {
    const now = new Date().toISOString();
    await updateActiveProfile((current) => {
      const copy = current.craftEssences.find((candidate) => candidate.copyId === copyId);
      const masterCe = currentMaster.craftEssences.find(
        (candidate) => candidate.id === copy?.craftEssenceId,
      );
      return masterCe ? updateCraftEssenceCopy(current, masterCe, copyId, patch, now) : current;
    });
  }
  async function addSupportTemplate() {
    const templateId = crypto.randomUUID();
    const now = new Date().toISOString();
    await updateActiveProfile((current) =>
      appendSupportTemplate(current, currentMaster.version, templateId, now),
    );
    return templateId;
  }
  async function addSupportSource(templateId: string, servantId: string) {
    const source = currentMaster.servants.find((candidate) => candidate.id === servantId);
    if (!source) return;
    const now = new Date().toISOString();
    const sourceInstanceId = crypto.randomUUID();
    await updateActiveProfile((current) =>
      addSupportServant(
        current,
        templateId,
        source,
        sourceInstanceId,
        current.servantBuilds[servantId]?.skills ?? {},
        now,
      ),
    );
  }
  async function updateSupportSkill(
    templateId: string,
    sourceInstanceId: string,
    skillId: string,
    patch: { skillLevel?: number; enabled?: boolean },
  ) {
    const now = new Date().toISOString();
    await updateActiveProfile((current) =>
      patchSupportSkill(current, templateId, sourceInstanceId, skillId, patch, now),
    );
  }
  async function updateSupportEffect(
    templateId: string,
    effect: SupportEffectRef,
    selected: boolean,
  ) {
    const now = new Date().toISOString();
    await updateActiveProfile((current) =>
      patchSupportEffect(current, templateId, effect, selected, now),
    );
  }
  async function updateSupportTemplate(
    templateId: string,
    patch: Partial<Pick<SupportTemplate, 'name' | 'lastUsedAt' | 'composition'>>,
  ) {
    const now = new Date().toISOString();
    await updateActiveProfile((current) => patchSupportTemplate(current, templateId, patch, now));
  }
  async function removeSupportTemplate(templateId: string) {
    await updateActiveProfile((current) => deleteSupportTemplate(current, templateId));
  }
  async function removeSupportSource(templateId: string, sourceInstanceId: string) {
    const now = new Date().toISOString();
    await updateActiveProfile((current) =>
      deleteSupportSource(current, templateId, sourceInstanceId, now),
    );
  }
  async function navigate(nextPage: Page, targetTab = false) {
    calculationMutation.begin();
    if (page === 'calculate' && nextPage !== 'calculate') await calculationFinalizer.current?.();
    if (page !== 'calculate' && nextPage === 'calculate')
      setCalculationSessionId(crypto.randomUUID());
    if (nextPage === 'servants') setOpenTargetTab(targetTab);
    router.push(pagePaths[nextPage]);
  }
  return (
    <div className="shell">
      <a className="skip" href="#main">
        本文へ移動
      </a>
      <header className="site-header">
        <div className="site-header-inner">
          <button className="brand" aria-label="FGO Lab" onClick={() => void navigate('home')}>
            <span className="brand-type">
              <strong>FGO</strong>
              <span>LAB</span>
            </span>
          </button>
          <nav className="desktop-nav" aria-label="主要">
            <ul>
              {mainNav.map((id) => (
                <li key={id}>
                  <button
                    aria-current={page === id ? 'page' : undefined}
                    onClick={() => void navigate(id)}
                  >
                    {nav.find(([candidate]) => candidate === id)?.[1]}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <div className="header-tools">
            <button
              className="data-nav"
              aria-current={page === 'data' ? 'page' : undefined}
              onClick={() => void navigate('data')}
            >
              {t('nav.data')}
            </button>
            <span className="header-status" title={currentMaster.version}>
              DB {masterVersionLabel(currentMaster.version)} ·{' '}
              {online ? 'オンライン' : 'オフライン'}
            </span>
            <button
              className="undo-button"
              aria-label="直前の操作を元に戻す"
              disabled={!undoSnapshot}
              onClick={() => {
                calculationMutation.begin();
                void undoLastChange();
              }}
            >
              元に戻す
            </button>
          </div>
        </div>
      </header>
      <main id="main">
        <header className="page-heading">
          <h1>{nav.find(([id]) => id === page)?.[1]}</h1>
        </header>
        {startupWarning && (
          <p className="notice" role="status">
            {startupWarning}
          </p>
        )}
        <Suspense fallback={<p aria-live="polite">画面を読み込んでいます…</p>}>
          {page === 'home' && (
            <HomeRoute
              master={currentMaster}
              profile={profile}
              calculation={calculation}
              navigate={navigate}
            />
          )}{' '}
          {page === 'calculate' && (
            <CalculatorRoute
              master={currentMaster}
              profile={profile}
              calculation={calculation}
              setCalculation={setCalculation}
              calculationSessionId={calculationSessionId}
              setCalculationSessionId={setCalculationSessionId}
              updateActiveProfile={updateActiveProfile}
              updateSupportTemplate={updateSupportTemplate}
              registerFinalizer={(finalizer) => {
                calculationFinalizer.current = finalizer;
              }}
              recoveryFocus={recoveryFocus}
              setRecoveryFocus={setRecoveryFocus}
              calculationMutation={calculationMutation}
            />
          )}{' '}
          {page === 'ranking' && (
            <RankingRoute
              master={currentMaster}
              profile={profile}
              setCalculation={setCalculation}
              setCalculationSessionId={setCalculationSessionId}
              updateActiveProfile={updateActiveProfile}
              replaceRoute={(nextPage) => router.push(pagePaths[nextPage])}
              calculationMutation={calculationMutation}
            />
          )}{' '}
          {page === 'servants' && (
            <Servants
              servants={currentMaster.servants}
              builds={profile.servantBuilds}
              targets={profile.servantTargets}
              onChange={updateBuild}
              onTargetChange={updateTarget}
              initialTab={openTargetTab ? 'target' : 'current'}
            />
          )}{' '}
          {page === 'ce' && (
            <CraftEssences
              copies={profile.craftEssences}
              masters={currentMaster.craftEssences}
              onAdd={addCraftEssence}
              onRemove={removeCraftEssence}
              onUpdate={updateCraftEssence}
            />
          )}{' '}
          {page === 'support' && (
            <SupportTemplates
              templates={profile.supportTemplates}
              servants={currentMaster.servants}
              builds={profile.servantBuilds}
              onAdd={addSupportTemplate}
              onAddSource={addSupportSource}
              onUpdateTemplate={updateSupportTemplate}
              onRemoveTemplate={removeSupportTemplate}
              onRemoveSource={removeSupportSource}
              onUpdateSkill={updateSupportSkill}
              onToggleEffect={updateSupportEffect}
            />
          )}{' '}
          {page === 'growth' && (
            <Growth
              master={currentMaster}
              profile={profile}
              onOpenTargets={() => void navigate('servants', true)}
            />
          )}{' '}
          {page === 'data' && (
            <DataPage
              onClear={async () => {
                calculationMutation.begin();
                await clearProfiles();
                location.reload();
              }}
              profiles={profiles}
              masterVersion={currentMaster.version}
              onImport={async (next) => {
                const token = calculationMutation.begin();
                const importedResult = await importProfiles(next, {
                  isCurrent: () => calculationMutation.isCurrent(token),
                  signal: calculationMutation.signalFor(token),
                });
                if (importedResult.status === 'aborted') throw new Error('profile_import_stale');
                if (!calculationMutation.isCurrent(token)) return;
                const imported = activeProfile(next);
                setCalculation(
                  imported.draft
                    ? {
                        request: imported.draft.request,
                        storedResult: imported.draft.result,
                        source: 'draft',
                      }
                    : {
                        request: undefined,
                        storedResult: undefined,
                        source: undefined,
                      },
                );
                setCalculationSessionId(crypto.randomUUID());
              }}
            />
          )}{' '}
        </Suspense>
      </main>
      <BottomNav page={page} setPage={(next) => void navigate(next)} />
    </div>
  );
}
function BottomNav({ page, setPage }: { page: Page; setPage: (page: Page) => void }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const morePages: readonly [Page, string][] = [
    ['ranking', '火力ランキング'],
    ['ce', '概念礼装'],
    ['support', '支援条件'],
    ['data', 'データ管理'],
  ];
  const selectPage = (next: Page) => {
    setMoreOpen(false);
    setPage(next);
  };
  return (
    <nav className="bottom-nav" aria-label="モバイル主要">
      <button
        aria-current={page === 'home' ? 'page' : undefined}
        onClick={() => selectPage('home')}
      >
        ホーム
      </button>
      <button
        aria-current={page === 'calculate' ? 'page' : undefined}
        onClick={() => selectPage('calculate')}
      >
        計算
      </button>
      <button
        aria-current={page === 'servants' ? 'page' : undefined}
        onClick={() => selectPage('servants')}
      >
        所持
      </button>
      <button
        aria-current={page === 'growth' ? 'page' : undefined}
        onClick={() => selectPage('growth')}
      >
        育成
      </button>
      <button
        aria-current={morePages.some(([candidate]) => candidate === page) ? 'page' : undefined}
        aria-expanded={moreOpen}
        aria-controls="mobile-more-menu"
        onClick={() => setMoreOpen((current) => !current)}
      >
        その他
      </button>
      {moreOpen ? (
        <div id="mobile-more-menu" className="bottom-nav-more" aria-label="その他の機能">
          {morePages.map(([id, label]) => (
            <button key={id} type="button" onClick={() => selectPage(id)}>
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </nav>
  );
}
