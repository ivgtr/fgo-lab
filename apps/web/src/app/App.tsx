import './shell.css';
import { useEffect, useState } from 'react';
import { getPrimaryNpPresentation, type MasterDataSnapshot } from '@fgo-lab/master-data';
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
import { finalizeHistory, scenarioFingerprint } from '@fgo-lab/workspace-domain';
import type {
  CalculationScenario,
  DamageResolutionInput,
  CalculationShareSnapshot,
  CraftEssenceCopy,
  ServantBuild,
  ServantTarget,
  SupportEffectRef,
  SupportTemplate,
} from '@fgo-lab/schema';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import {
  calculateScenario,
  createDefaultResolvedScenario,
  resolveCalculationInput,
} from '@fgo-lab/calculation-application';
import { IndexedDbProfileRepository } from '../adapters/repository';
import { t } from '../ui/i18n';
import {
  completeCalculationEditorState,
  createDefaultDamageResolutionInput,
  damageResolutionInputFromScenario,
  scenarioFromDamageResolutionInput,
  selectionFromScenario,
} from '../features/calculator/calculation';
import { bootstrapApplication, setupApplication, type ReadyStartupResult } from './startup';
import { DataPage } from '../features/data/DataPage';
import { Calculator } from '../features/calculator/Calculator';
import { CraftEssences } from '../features/profile/CraftEssences';
import { Growth } from '../features/growth/Growth';
import { Home } from '../features/home/Home';
import { Ranking } from '../features/ranking/Ranking';
import { Servants } from '../features/profile/Servants';
import { SupportTemplates } from '../features/profile/SupportTemplates';
import { useProfileCollection } from './useProfileCollection';

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

interface CalculationWorkspace {
  scenario: CalculationScenario | undefined;
  shared: CalculationShareSnapshot | undefined;
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
          baseUrl: import.meta.env.BASE_URL,
          development: import.meta.env.DEV,
          fragment: location.hash,
          now: new Date(),
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setState('error');
    }
  }
  return (
    <main className="setup">
      <section>
        <h1>{t('setup.title')}</h1>
        <p>{t('setup.description')}</p>
        <ol className="steps">
          <li>ローカルDBを作成</li>
          <li>マスターデータを取得・検証</li>
          <li>検索索引を準備</li>
          <li>active版を切替</li>
        </ol>
        {startupWarning && <p role="alert">{startupWarning}</p>}
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

export function App() {
  const [master, setMaster] = useState<MasterDataSnapshot>();
  const [loading, setLoading] = useState(true);
  const [startupWarning, setStartupWarning] = useState('');
  const [page, setPage] = useState<Page>('home');
  const {
    profiles,
    undoSnapshot,
    initialize: initializeProfiles,
    replace: replaceProfiles,
    updateActive: updateActiveProfile,
    undo: undoLastChange,
  } = useProfileCollection(repository);
  const [calculation, setCalculation] = useState<CalculationWorkspace>({
    scenario: undefined,
    shared: undefined,
  });
  const [rankingSupportId, setRankingSupportId] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [calculationSessionId, setCalculationSessionId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    async function bootstrap() {
      const result = await bootstrapApplication(repository, {
        baseUrl: import.meta.env.BASE_URL,
        development: import.meta.env.DEV,
        fragment: location.hash,
        now: new Date(),
      });
      setMaster(result.master);
      initializeProfiles(result.profiles);
      setCalculation(result.calculation);
      setStartupWarning(result.warning);
      if (result.offline) setOnline(false);
      if (result.calculation.shared) setPage('calculate');
      setLoading(false);
    }
    void bootstrap();
  }, [initializeProfiles]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    addEventListener('online', update);
    addEventListener('offline', update);
    return () => {
      removeEventListener('online', update);
      removeEventListener('offline', update);
    };
  }, []);
  if (loading)
    return (
      <main className="setup">
        <p role="status">起動時のデータ更新を確認しています…</p>
      </main>
    );
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
          if (result.calculation.shared) setPage('calculate');
        }}
      />
    );
  const currentMaster = master;
  const profile = activeProfile(profiles);
  const rankingSupport = profile.supportTemplates.find(
    (template) => template.templateId === rankingSupportId,
  );
  const defaultServant = currentMaster.servants[0]!;
  const defaultBuild = profile.servantBuilds[defaultServant.id];
  const currentScenario =
    calculation.scenario ??
    createDefaultResolvedScenario(currentMaster, defaultBuild, defaultServant);
  const baseInput = damageResolutionInputFromScenario(currentScenario, currentMaster);
  const selectedAttacker =
    currentMaster.servants.find((candidate) => candidate.id === baseInput.attackerId) ??
    defaultServant;
  const selectedBuild = profile.servantBuilds[selectedAttacker.id];
  const currentSelection = completeCalculationEditorState(
    selectionFromScenario(currentScenario),
    selectedAttacker,
    profile.servantBuilds[baseInput.attackerId],
  );
  const calculationSupportTemplate = profile.supportTemplates.find(
    (template) => template.templateId === currentSelection.support?.sourceTemplateId,
  );
  const versions = {
    schemaVersion: SCHEMA_VERSION,
    masterDataVersion: currentMaster.version,
    engineVersion: ENGINE_VERSION,
    appVersion: APP_VERSION,
    gameRegion: 'JP' as const,
    masterDataLocale: 'ja-JP' as const,
  };
  const resolvedCalculation = calculateScenario(currentScenario, currentMaster, versions);
  const input = resolvedCalculation.input;
  const result = resolvedCalculation.result;
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
    skillLevel: number,
  ) {
    const now = new Date().toISOString();
    await updateActiveProfile((current) =>
      patchSupportSkill(current, templateId, sourceInstanceId, skillId, skillLevel, now),
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
  async function saveCalculationDraft(
    nextInput: DamageResolutionInput,
    selection = currentSelection,
  ) {
    const scenario = scenarioFromDamageResolutionInput(nextInput, selection);
    setCalculation({ scenario, shared: undefined });
    const nextCalculation = calculateScenario(scenario, currentMaster, versions);
    const fingerprint = await scenarioFingerprint(
      scenario,
      currentMaster.version,
      ENGINE_VERSION,
      async (data) => crypto.subtle.digest('SHA-256', new Uint8Array(data)),
    );
    const now = new Date().toISOString();
    await updateActiveProfile((current) => ({
      ...current,
      draft: {
        profileId: current.profileId,
        calculationSessionId,
        scenario,
        result: nextCalculation.result,
        scenarioFingerprint: fingerprint,
        updatedAt: now,
      },
      updatedAt: now,
    }));
  }
  async function finalizeCurrentCalculation() {
    const fingerprint = await scenarioFingerprint(
      currentScenario,
      currentMaster.version,
      ENGINE_VERSION,
      async (data) => crypto.subtle.digest('SHA-256', new Uint8Array(data)),
    );
    const now = new Date().toISOString();
    const historyId = crypto.randomUUID();
    await updateActiveProfile((current) =>
      finalizeHistory(current, {
        sessionId: calculationSessionId,
        scenario: currentScenario,
        result,
        fingerprint,
        now,
        historyId,
      }),
    );
  }
  async function navigate(nextPage: Page) {
    if (page === 'calculate' && nextPage !== 'calculate') await finalizeCurrentCalculation();
    if (page !== 'calculate' && nextPage === 'calculate')
      setCalculationSessionId(crypto.randomUUID());
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
          端末内に自動保存・{online ? 'オンライン' : 'オフライン'}
          {startupWarning && (
            <>
              <br />
              {startupWarning}
            </>
          )}
        </p>
        <button disabled={!undoSnapshot} onClick={() => void undoLastChange()}>
          直前の操作を元に戻す
        </button>
      </aside>
      <main id="main">
        <header>
          <h1>{nav.find(([id]) => id === page)?.[1]}</h1>
        </header>
        {page === 'home' && (
          <Home
            result={
              result.status === 'calculated' ? (result.rows[input.npLevel - 1]?.average ?? 0) : 0
            }
            attackerName={selectedAttacker.name}
            attackerImage={selectedAttacker.imageKey}
            owned={selectedBuild?.npLevel ? 1 : 0}
            hasHistory={profile.history.length > 0}
            onNavigate={(next) => void navigate(next)}
          />
        )}{' '}
        {page === 'calculate' && (
          <Calculator
            input={baseInput}
            resolvedInput={input}
            resolvedEffects={resolvedCalculation.effects}
            effectWarnings={resolvedCalculation.effectWarnings}
            result={result}
            scenario={currentScenario}
            servants={currentMaster.servants}
            builds={profile.servantBuilds}
            craftEssenceCopies={profile.craftEssences}
            craftEssences={currentMaster.craftEssences}
            selection={currentSelection}
            supportTemplates={profile.supportTemplates}
            selectedSupport={calculationSupportTemplate}
            onInputChange={saveCalculationDraft}
            onCompositionChange={(nextInput, nextSelection) =>
              saveCalculationDraft(nextInput, nextSelection)
            }
            onSupportSelect={async (template) => {
              if (!template) {
                await saveCalculationDraft(baseInput, {
                  ...currentSelection,
                  support: null,
                });
                return;
              }
              const lastUsedAt = new Date().toISOString();
              await updateSupportTemplate(template.templateId, { lastUsedAt });
              await saveCalculationDraft(baseInput, {
                ...currentSelection,
                support: {
                  sourceTemplateId: template.templateId,
                  composition: structuredClone(template.composition),
                },
              });
            }}
            onSupportSave={async (mode) => {
              if (!currentSelection.support) return;
              if (mode === 'source' && currentSelection.support.sourceTemplateId) {
                await updateSupportTemplate(currentSelection.support.sourceTemplateId, {
                  composition: structuredClone(currentSelection.support.composition),
                });
                return;
              }
              const templateId = crypto.randomUUID();
              const now = new Date().toISOString();
              await updateActiveProfile((current) =>
                patchSupportTemplate(
                  appendSupportTemplate(current, currentMaster.version, templateId, now),
                  templateId,
                  { composition: structuredClone(currentSelection.support!.composition) },
                  now,
                ),
              );
              await saveCalculationDraft(baseInput, {
                ...currentSelection,
                support: { ...currentSelection.support, sourceTemplateId: templateId },
              });
            }}
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
        {page === 'ranking' && (
          <Ranking
            candidates={currentMaster.servants
              .filter((candidate) => candidate.noblePhantasms.length > 0)
              .map((candidate) => {
                const np = getPrimaryNpPresentation(candidate);
                if (!np) throw new TypeError(`attack_np_missing:${candidate.id}`);
                const input = createDefaultDamageResolutionInput(
                  currentMaster,
                  profile.servantBuilds[candidate.id],
                  candidate,
                );
                const resolved = resolveCalculationInput(
                  input,
                  {
                    attackerSource: 'master',
                    effectMode: 'resolved',
                    attackerSkills: [],
                    craftEssence: null,
                    support: rankingSupport
                      ? {
                          sourceTemplateId: rankingSupport.templateId,
                          composition: rankingSupport.composition,
                        }
                      : null,
                  },
                  currentMaster,
                );
                return {
                  servantId: candidate.id,
                  name: candidate.name,
                  input: resolved.input,
                  resolutionUnsupported: resolved.precision === 'unsupported',
                  resolutionEvidenceKeys: resolved.evidenceKeys,
                  resolutionWarnings: resolved.warnings,
                  classId: candidate.classId,
                  rarity: candidate.rarity,
                  npCard: np.card,
                  npTarget: np.target,
                  owned: (profile.servantBuilds[candidate.id]?.npLevel ?? 0) > 0,
                };
              })}
            versions={versions}
            supportTemplates={profile.supportTemplates}
            servants={currentMaster.servants}
            selectedSupport={rankingSupport}
            onSupportSelect={async (template) => {
              setRankingSupportId(template?.templateId ?? null);
              if (template)
                await updateSupportTemplate(template.templateId, {
                  lastUsedAt: new Date().toISOString(),
                });
            }}
          />
        )}{' '}
        {page === 'growth' && <Growth master={currentMaster} profile={profile} />}{' '}
        {page === 'data' && (
          <DataPage
            profiles={profiles}
            masterVersion={currentMaster.version}
            onImport={replaceProfiles}
          />
        )}{' '}
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
