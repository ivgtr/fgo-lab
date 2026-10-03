'use client';

import './shell.css';
import type { Route } from 'next';
import { usePathname, useRouter } from 'next/navigation';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
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
  HistoricalCalculationDraft,
  CraftEssenceCopy,
  PortableCalculationRequest,
  ServantBuild,
  ServantTarget,
  SupportEffectRef,
  SupportTemplate,
} from '@fgo-lab/schema';
import type { PortableVersionUpgradeResult } from '@fgo-lab/calculation-application';
import { IndexedDbProfileRepository } from '../adapters/repository';
import { t } from '../ui/i18n';
import { bootstrapApplication, setupApplication, type ReadyStartupResult } from './startup';
import { StartupScreen } from './StartupScreen';
import { useProfileCollection } from './useProfileCollection';
import type { CalculationMutationGate } from './portableDraft';

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
const repository = new IndexedDbProfileRepository();
const clock: Clock = { now: () => new Date() };
const ids: IdGenerator = { next: () => crypto.randomUUID() };

export interface CalculationWorkspace {
  request: PortableCalculationRequest | undefined;
  storedResult: CalculationResult | undefined;
  source: 'share' | 'draft' | 'history' | undefined;
  historical?: HistoricalCalculationDraft | undefined;
  upgradeAttempt?: Extract<PortableVersionUpgradeResult, { status: 'rejected' }>;
}

function Setup({
  onComplete,
  startupWarning,
}: {
  onComplete: (result: ReadyStartupResult) => void;
  startupWarning?: string;
}) {
  const [state, setState] = useState<'idle' | 'running' | 'error'>('idle');
  const [error, setError] = useState('');
  async function run() {
    setState('running');
    setError('');
    try {
      onComplete(
        await setupApplication(repository, clock, ids, {
          baseUrl: '/',
          development: process.env.NODE_ENV !== 'production',
          fragment: location.hash,
          now: new Date(),
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setState('error');
    }
  }
  return state === 'running' ? (
    <StartupScreen mode="updating" notice={startupWarning} />
  ) : (
    <StartupScreen
      mode={state === 'error' ? 'error' : 'setup'}
      notice={startupWarning}
      errorDetail={state === 'error' ? error : undefined}
      actionLabel={state === 'error' ? t('setup.retry') : t('setup.start')}
      onAction={() => void run()}
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
  const {
    profiles,
    undoSnapshot,
    initialize: initializeProfiles,
    updateActive: updateActiveProfile,
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
  const calculationMutationRef = useRef(0);
  const calculationMutation: CalculationMutationGate = {
    begin: () => {
      calculationMutationRef.current += 1;
      return calculationMutationRef.current;
    },
    isCurrent: (token) => calculationMutationRef.current === token,
  };
  const calculationFinalizer = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    async function bootstrap() {
      const result = await bootstrapApplication(repository, {
        baseUrl: '/',
        development: process.env.NODE_ENV !== 'production',
        fragment: location.hash,
        now: new Date(),
      });
      setMaster(result.master);
      initializeProfiles(result.profiles);
      setCalculation(result.calculation);
      setStartupWarning(result.warning);
      if (result.offline) setOnline(false);
      if (
        result.calculation.source === 'share' &&
        pageFromPathname(location.pathname) !== 'calculate'
      )
        router.replace(`${pagePaths.calculate}${location.hash}` as Route);
      setLoading(false);
    }
    void bootstrap();
  }, [initializeProfiles, router]);
  useEffect(() => {
    if (
      'serviceWorker' in navigator &&
      process.env.NODE_ENV === 'production' &&
      process.env.NEXT_PUBLIC_E2E !== 'true'
    )
      void navigator.serviceWorker.register('/sw.js');
  }, []);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    addEventListener('online', update);
    addEventListener('offline', update);
    return () => {
      removeEventListener('online', update);
      removeEventListener('offline', update);
    };
  }, []);
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
        onComplete={(result) => {
          setMaster(result.master);
          initializeProfiles(result.profiles);
          setCalculation(result.calculation);
          setStartupWarning(result.warning);
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
  async function navigate(nextPage: Page) {
    calculationMutation.begin();
    if (page === 'calculate' && nextPage !== 'calculate') await calculationFinalizer.current?.();
    if (page !== 'calculate' && nextPage === 'calculate')
      setCalculationSessionId(crypto.randomUUID());
    router.push(pagePaths[nextPage]);
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
          端末内に自動保存・{online ? 'オンライン' : 'オフライン'}
          {startupWarning && (
            <>
              <br />
              {startupWarning}
            </>
          )}
        </p>
        <button
          disabled={!undoSnapshot}
          onClick={() => {
            calculationMutation.begin();
            void undoLastChange();
          }}
        >
          直前の操作を元に戻す
        </button>
      </aside>
      <main id="main">
        <header>
          <h1>{nav.find(([id]) => id === page)?.[1]}</h1>
        </header>
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
          {page === 'growth' && <Growth master={currentMaster} profile={profile} />}{' '}
          {page === 'data' && (
            <DataPage
              profiles={profiles}
              masterVersion={currentMaster.version}
              onImport={async (next) => {
                calculationMutation.begin();
                await repository.replaceAtomicallyWithBackup(next);
                initializeProfiles(next);
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
                        source: imported.historicalDraft ? 'draft' : undefined,
                        ...(imported.historicalDraft
                          ? { historical: imported.historicalDraft }
                          : {}),
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
