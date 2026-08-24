import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  deriveCraftEssenceAtk,
  type CraftEssenceMaster,
  type MasterDataSnapshot,
  type ServantMaster,
} from '@fgo-lab/master-data';
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
import {
  resolveAttackerSkills,
  resolveSupportTemplate,
  type ResolvedSupportTemplate,
} from '@fgo-lab/effect-resolver';
import { finalizeHistory, inputFingerprint } from '@fgo-lab/workspace-domain';
import type {
  CalcInput,
  CalculationSelection,
  CalculationShareSnapshot,
  AttackerSkillSelection,
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
import {
  createShareFragment,
  exportBackup,
  importBackup,
  readShareFragment,
  resultCardPng,
} from './adapters/share';
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

function handleModalKeyboard(event: ReactKeyboardEvent<HTMLDivElement>, close: () => void) {
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ),
  );
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function withEffectResolution(
  result: ReturnType<typeof calculateNpDamage>,
  resolution: ResolvedSupportTemplate | undefined,
  traceStep: 'attacker-effect' | 'support-effect',
) {
  if (!resolution) return result;
  return {
    ...result,
    precision:
      resolution.precision === 'unsupported'
        ? ('unsupported' as const)
        : resolution.precision === 'approximate' || result.precision === 'approximate'
          ? ('approximate' as const)
          : result.precision,
    warnings: [...result.warnings, ...resolution.warnings],
    trace: [
      ...result.trace,
      ...resolution.effects.map((effect) => ({
        step: traceStep,
        detail: `${effect.sourceId}:${effect.skillId}:${effect.effectId}:${effect.reason}`,
      })),
    ],
  };
}

function initialAttackerSkills(
  servant: ServantMaster | undefined,
  source: CalculationSelection['attackerSource'],
  build: ServantBuild | undefined,
): AttackerSkillSelection[] {
  return (servant?.skills ?? []).slice(0, 3).map((skill, index) => ({
    skillId: skill.id,
    skillLevel: source === 'owned' ? (build?.skills[String(index + 1)] ?? 1) : 10,
    enabled: false,
  }));
}

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

function selectionFromShare(shared: CalculationShareSnapshot): CalculationSelection {
  const craftEssence = shared.composition?.craftEssence;
  return {
    attackerSource: 'master',
    craftEssence: craftEssence ? { ...craftEssence, source: 'master', copyId: null } : null,
  };
}

export function App() {
  const [master, setMaster] = useState<MasterDataSnapshot>();
  const [profiles, setProfiles] = useState<ProfileCollection>();
  const [loading, setLoading] = useState(true);
  const [startupWarning, setStartupWarning] = useState('');
  const [page, setPage] = useState<Page>('home');
  const [undoSnapshot, setUndoSnapshot] = useState<ProfileCollection>();
  const [calculatorInput, setCalculatorInput] = useState<CalcInput>();
  const [calculationSelection, setCalculationSelection] = useState<CalculationSelection>();
  const [selectedSupport, setSelectedSupport] = useState<SupportTemplate>();
  const [sharedSnapshot, setSharedSnapshot] = useState<CalculationShareSnapshot>();
  const [online, setOnline] = useState(navigator.onLine);
  const [calculationSessionId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    async function bootstrap() {
      let active = await loadActiveMaster();
      const saved = await repository.load();
      if (active) {
        try {
          const candidate = await fetchMasterCandidate(import.meta.env.BASE_URL);
          if (candidate.fromOfflineCache) setOnline(false);
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
        let shared: CalculationShareSnapshot | null = null;
        try {
          shared = readShareFragment(location.hash);
        } catch (cause) {
          setStartupWarning(
            `共有URLを復元できませんでした: ${cause instanceof Error ? cause.message : String(cause)}`,
          );
        }
        const savedProfile = activeProfile(saved);
        setMaster(active.snapshot);
        setProfiles(saved);
        setSharedSnapshot(shared ?? undefined);
        setCalculatorInput(shared?.input ?? savedProfile.draft?.input);
        setCalculationSelection(
          shared ? selectionFromShare(shared) : savedProfile.draft?.selection,
        );
        setSelectedSupport(shared ? undefined : (savedProfile.draft?.supportTemplate ?? undefined));
        if (shared) setPage('calculate');
      }
      setLoading(false);
    }
    void bootstrap();
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
  async function persist(next: ProfileCollection, rememberForUndo = true) {
    await repository.replace(next);
    if (rememberForUndo && profiles) setUndoSnapshot(profiles);
    setProfiles(next);
  }
  async function undoLastChange() {
    if (!undoSnapshot) return;
    await repository.replace(undoSnapshot);
    setProfiles(undoSnapshot);
    setUndoSnapshot(undefined);
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
          try {
            const shared = readShareFragment(location.hash);
            if (shared) {
              setSharedSnapshot(shared);
              setCalculatorInput(shared.input);
              setCalculationSelection(selectionFromShare(shared));
              setPage('calculate');
            }
          } catch (cause) {
            setStartupWarning(
              `共有URLを復元できませんでした: ${cause instanceof Error ? cause.message : String(cause)}`,
            );
          }
        }}
      />
    );
  const currentProfiles = profiles;
  const currentMaster = master;
  const profile = activeProfile(currentProfiles);
  const servant = currentMaster.servants[0]!;
  const build = profile.servantBuilds[servant.id];
  const baseInput = calculatorInput ?? calcInput(currentMaster, build);
  const selectionBase =
    calculationSelection ??
    ({
      attackerSource: profile.servantBuilds[baseInput.attackerId]?.npLevel ? 'owned' : 'master',
      craftEssence: null,
    } satisfies CalculationSelection);
  const selectedAttacker = currentMaster.servants.find(
    (candidate) => candidate.id === baseInput.attackerId,
  );
  const currentSelection: CalculationSelection = {
    ...selectionBase,
    attackerSkills:
      selectionBase.attackerSkills ??
      initialAttackerSkills(
        selectedAttacker,
        selectionBase.attackerSource,
        profile.servantBuilds[baseInput.attackerId],
      ),
  };
  const versions = {
    schemaVersion: SCHEMA_VERSION,
    masterDataVersion: currentMaster.version,
    engineVersion: ENGINE_VERSION,
    appVersion: APP_VERSION,
    gameRegion: 'JP' as const,
    masterDataLocale: 'ja-JP' as const,
  };
  const attackerSkillResolution = resolveAttackerSkills(
    baseInput,
    currentSelection.attackerSkills ?? [],
    currentMaster.servants,
  );
  const supportResolution = selectedSupport
    ? resolveSupportTemplate(attackerSkillResolution.input, selectedSupport, currentMaster.servants)
    : undefined;
  const input = supportResolution?.input ?? attackerSkillResolution.input;
  const calculatedResult = withEffectResolution(
    withEffectResolution(
      calculateNpDamage(input, versions),
      attackerSkillResolution,
      'attacker-effect',
    ),
    supportResolution,
    'support-effect',
  );
  const compatibleSharedSnapshot =
    sharedSnapshot?.result.versions.masterDataVersion === currentMaster.version &&
    sharedSnapshot.result.versions.engineVersion === ENGINE_VERSION;
  const localResult = !ENGINE_RELEASE_VALIDATED
    ? {
        ...calculatedResult,
        precision: 'approximate' as const,
        warnings: [...calculatedResult.warnings, 'diagnostic_fixture_not_release_validated'],
      }
    : calculatedResult;
  const result = sharedSnapshot && !compatibleSharedSnapshot ? sharedSnapshot.result : localResult;
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
  async function updateCraftEssence(
    copyId: string,
    patch: Pick<Partial<CraftEssenceCopy>, 'level' | 'limitBreak'>,
  ) {
    const current = profile.craftEssences.find((copy) => copy.copyId === copyId);
    if (!current) return;
    const masterCe = currentMaster.craftEssences.find(
      (candidate) => candidate.id === current.craftEssenceId,
    );
    if (!masterCe) return;
    const limitBreak = patch.limitBreak ?? current.limitBreak;
    const maximum = masterCe.maxLevelByLimitBreak[limitBreak] ?? 100;
    const level = Math.min(patch.level ?? current.level, maximum);
    await replaceProfile({
      ...profile,
      craftEssences: profile.craftEssences.map((copy) =>
        copy.copyId === copyId
          ? { ...copy, level, limitBreak, updatedAt: new Date().toISOString() }
          : copy,
      ),
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
  async function addSupportSource(templateId: string, servantId: string) {
    const source = currentMaster.servants.find((candidate) => candidate.id === servantId);
    if (!source) return;
    const timestamp = new Date().toISOString();
    await replaceProfile({
      ...profile,
      supportTemplates: profile.supportTemplates.map((template) => {
        if (template.templateId !== templateId) return template;
        const existing = new Set(
          template.effects.map((effect) => `${effect.sourceId}:${effect.effectId}`),
        );
        const additions = source.skills.flatMap((skill, index) =>
          existing.has(`${source.id}:${skill.id}`)
            ? []
            : [
                {
                  sourceType: 'servant' as const,
                  sourceId: source.id,
                  effectId: skill.id,
                  skillLevel: 10,
                  targetRole: 'ATTACKER' as const,
                  enabled: false,
                  order: template.effects.length + index,
                },
              ],
        );
        return { ...template, effects: [...template.effects, ...additions], updatedAt: timestamp };
      }),
      updatedAt: timestamp,
    });
  }
  async function updateSupportEffect(
    templateId: string,
    sourceId: string,
    effectId: string,
    patch: Partial<Pick<SupportTemplate['effects'][number], 'enabled' | 'skillLevel'>>,
  ) {
    const timestamp = new Date().toISOString();
    await replaceProfile({
      ...profile,
      supportTemplates: profile.supportTemplates.map((template) =>
        template.templateId === templateId
          ? {
              ...template,
              effects: template.effects.map((effect) =>
                effect.sourceId === sourceId && effect.effectId === effectId
                  ? { ...effect, ...patch }
                  : effect,
              ),
              updatedAt: timestamp,
            }
          : template,
      ),
      updatedAt: timestamp,
    });
  }
  async function saveCalculationDraft(
    nextInput: CalcInput,
    supportTemplate = selectedSupport,
    selection = currentSelection,
  ) {
    setCalculatorInput(nextInput);
    setCalculationSelection(selection);
    setSelectedSupport(supportTemplate);
    setSharedSnapshot(undefined);
    const nextResolution = supportTemplate
      ? resolveSupportTemplate(
          resolveAttackerSkills(nextInput, selection.attackerSkills ?? [], currentMaster.servants)
            .input,
          supportTemplate,
          currentMaster.servants,
        )
      : undefined;
    const nextAttackerResolution = resolveAttackerSkills(
      nextInput,
      selection.attackerSkills ?? [],
      currentMaster.servants,
    );
    const resolvedInput = nextResolution?.input ?? nextAttackerResolution.input;
    const nextCalculated = withEffectResolution(
      withEffectResolution(
        calculateNpDamage(resolvedInput, versions),
        nextAttackerResolution,
        'attacker-effect',
      ),
      nextResolution,
      'support-effect',
    );
    const nextResult = !ENGINE_RELEASE_VALIDATED
      ? {
          ...nextCalculated,
          precision: 'approximate' as const,
          warnings: [...nextCalculated.warnings, 'diagnostic_fixture_not_release_validated'],
        }
      : nextCalculated;
    const fingerprint = await inputFingerprint(
      resolvedInput,
      currentMaster.version,
      ENGINE_VERSION,
      async (data) => crypto.subtle.digest('SHA-256', new Uint8Array(data)),
    );
    await replaceProfile({
      ...profile,
      draft: {
        profileId: profile.profileId,
        calculationSessionId,
        input: nextInput,
        result: nextResult,
        inputFingerprint: fingerprint,
        supportTemplate: supportTemplate ?? null,
        selection,
        updatedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    });
  }
  async function finalizeCurrentCalculation(currentInput = input, currentResult = result) {
    const fingerprint = await inputFingerprint(
      currentInput,
      currentMaster.version,
      ENGINE_VERSION,
      async (data) => crypto.subtle.digest('SHA-256', new Uint8Array(data)),
    );
    await replaceProfile(
      finalizeHistory(profile, {
        sessionId: calculationSessionId,
        input: currentInput,
        result: currentResult,
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
          <p className="eyebrow">非公式・非営利 / JP DATA</p>
          <h1>{nav.find(([id]) => id === page)?.[1]}</h1>
        </header>
        {page === 'home' && (
          <Home
            result={result.results[input.npLevel - 1]?.average ?? 0}
            attackerName={servant.name}
            attackerImage={servant.imageKey}
            owned={build?.npLevel ? 1 : 0}
            hasHistory={profile.history.length > 0}
            onNavigate={(next) => void navigate(next)}
          />
        )}{' '}
        {page === 'calculate' && (
          <Calculator
            input={baseInput}
            resolvedInput={input}
            result={result}
            servants={currentMaster.servants}
            builds={profile.servantBuilds}
            craftEssenceCopies={profile.craftEssences}
            craftEssences={currentMaster.craftEssences}
            selection={currentSelection}
            supportTemplates={profile.supportTemplates}
            selectedSupport={selectedSupport}
            sharedVersionMismatch={Boolean(sharedSnapshot && !compatibleSharedSnapshot)}
            onInputChange={saveCalculationDraft}
            onCompositionChange={(nextInput, nextSelection) =>
              saveCalculationDraft(nextInput, selectedSupport, nextSelection)
            }
            onSupportSelect={(template) => saveCalculationDraft(baseInput, template)}
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
            onAdd={addSupportTemplate}
            onAddSource={addSupportSource}
            onUpdateEffect={updateSupportEffect}
          />
        )}{' '}
        {page === 'ranking' && (
          <Ranking
            candidates={currentMaster.servants
              .filter((candidate) => candidate.hasAttackNp)
              .map((candidate) => ({
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
            onImport={(next) => persist(next)}
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
  attackerImage,
  owned,
  hasHistory,
  onNavigate,
}: {
  result: number;
  attackerName: string;
  attackerImage: string | null;
  owned: number;
  hasHistory: boolean;
  onNavigate: (page: Page) => void;
}) {
  return (
    <div className="home-grid">
      <section className="primary-module">
        <p className="eyebrow">PRIMARY</p>
        <h2>{hasHistory ? '前回の計算を開く' : '宝具ダメージを比べる'}</h2>
        {hasHistory ? (
          <>
            <p className="hero-number">{numberFormatter.format(result)}</p>
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
function Calculator({
  input,
  resolvedInput,
  result,
  servants,
  builds,
  craftEssenceCopies,
  craftEssences,
  selection,
  supportTemplates,
  selectedSupport,
  sharedVersionMismatch,
  onInputChange,
  onCompositionChange,
  onSupportSelect,
  onFinalize,
}: {
  input: CalcInput;
  resolvedInput: CalcInput;
  result: ReturnType<typeof calculateNpDamage>;
  servants: ServantMaster[];
  builds: Record<string, ServantBuild>;
  craftEssenceCopies: CraftEssenceCopy[];
  craftEssences: CraftEssenceMaster[];
  selection: CalculationSelection;
  supportTemplates: SupportTemplate[];
  selectedSupport: SupportTemplate | undefined;
  sharedVersionMismatch: boolean;
  onInputChange: (input: CalcInput) => Promise<void>;
  onCompositionChange: (input: CalcInput, selection: CalculationSelection) => Promise<void>;
  onSupportSelect: (template: SupportTemplate | undefined) => Promise<void>;
  onFinalize: (input: CalcInput, result: ReturnType<typeof calculateNpDamage>) => Promise<void>;
}) {
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState<'quick' | 'direct'>('quick');
  const [supportDialogOpen, setSupportDialogOpen] = useState(false);
  const [supportSearch, setSupportSearch] = useState('');
  const [attackerDialogOpen, setAttackerDialogOpen] = useState(false);
  const [attackerSource, setAttackerSource] = useState<'owned' | 'master'>(
    selection.attackerSource,
  );
  const [attackerSearch, setAttackerSearch] = useState('');
  const [craftEssenceDialogOpen, setCraftEssenceDialogOpen] = useState(false);
  const [craftEssenceSource, setCraftEssenceSource] = useState<'registered' | 'master'>(
    selection.craftEssence?.source ?? 'registered',
  );
  const [craftEssenceSearch, setCraftEssenceSearch] = useState('');
  const attackerTriggerRef = useRef<HTMLButtonElement>(null);
  const craftEssenceTriggerRef = useRef<HTMLButtonElement>(null);
  const resultCardRef = useRef<HTMLElement>(null);
  const attacker = servants.find((candidate) => candidate.id === input.attackerId);
  const selectedCraftEssence = craftEssences.find(
    (candidate) => candidate.id === input.craftEssenceId,
  );
  const selectedCraftEssenceCopy = selection.craftEssence?.copyId
    ? craftEssenceCopies.find((copy) => copy.copyId === selection.craftEssence?.copyId)
    : undefined;
  const normalizedAttackerSearch = attackerSearch.trim().toLocaleLowerCase('ja');
  const visibleAttackers = servants
    .filter((candidate) => attackerSource === 'master' || Boolean(builds[candidate.id]?.npLevel))
    .filter((candidate) =>
      [candidate.name, candidate.classId, candidate.id]
        .join(' ')
        .toLocaleLowerCase('ja')
        .includes(normalizedAttackerSearch),
    )
    .slice(0, 100);
  const normalizedCraftEssenceSearch = craftEssenceSearch.trim().toLocaleLowerCase('ja');
  const visibleCraftEssences =
    craftEssenceSource === 'registered'
      ? craftEssenceCopies
          .map((copy) => ({
            copy,
            master: craftEssences.find((candidate) => candidate.id === copy.craftEssenceId),
          }))
          .filter((entry): entry is { copy: CraftEssenceCopy; master: CraftEssenceMaster } =>
            Boolean(entry.master),
          )
          .filter(({ master }) =>
            [master.name, master.id]
              .join(' ')
              .toLocaleLowerCase('ja')
              .includes(normalizedCraftEssenceSearch),
          )
          .slice(0, 100)
      : craftEssences
          .filter((candidate) =>
            [candidate.name, candidate.id]
              .join(' ')
              .toLocaleLowerCase('ja')
              .includes(normalizedCraftEssenceSearch),
          )
          .slice(0, 100)
          .map((master) => ({ master, copy: undefined }));
  const selectedSupportResolution = selectedSupport
    ? resolveSupportTemplate(input, selectedSupport, servants)
    : undefined;
  const selectedAttackerSkillResolution = resolveAttackerSkills(
    input,
    selection.attackerSkills ?? [],
    servants,
  );
  const enabledAttackerSkills = (selection.attackerSkills ?? []).filter((skill) => skill.enabled);
  const targetSummary = [input.target.classId, input.target.attribute, ...input.target.traits].join(
    '・',
  );
  const craftEssenceSummary =
    selectedCraftEssence && selection.craftEssence
      ? `${selectedCraftEssence.name} Lv.${selection.craftEssence.level}`
      : '礼装なし';
  const supportSummary = selectedSupport
    ? `${selectedSupport.name}（${selectedSupport.effects.filter((effect) => effect.enabled).length}スキル）`
    : '支援なし';
  const visibleSupportTemplates = supportTemplates.filter((template) => {
    const sourceNames = template.effects.map(
      (effect) => servants.find((servant) => servant.id === effect.sourceId)?.name ?? '',
    );
    return [template.name, ...sourceNames]
      .join(' ')
      .toLocaleLowerCase('ja')
      .includes(supportSearch.toLocaleLowerCase('ja'));
  });
  function change(patch: Partial<CalcInput>) {
    void onInputChange({ ...input, ...patch });
  }
  function selectAttacker(candidate: ServantMaster, source: 'owned' | 'master') {
    const saved = source === 'owned' ? builds[candidate.id] : undefined;
    const level = saved?.level ?? 90;
    void onCompositionChange(
      {
        ...input,
        attackerId: candidate.id,
        attackerLevel: level,
        attackerAtk:
          candidate.atkByLevel[String(level)] ?? candidate.atkByLevel['90'] ?? input.attackerAtk,
        fouAtk: saved?.fouAtk ?? 1000,
        npLevel: Math.max(1, saved?.npLevel ?? 1),
        npMultipliers: candidate.npMultipliers,
        cardType: candidate.npCard,
      },
      {
        ...selection,
        attackerSource: source,
        attackerSkills: initialAttackerSkills(candidate, source, saved),
      },
    );
    closeAttackerDialog();
  }
  function selectCraftEssence(
    master: CraftEssenceMaster,
    source: 'registered' | 'master',
    copy?: CraftEssenceCopy,
  ) {
    const level = copy?.level ?? 1;
    const limitBreak = copy?.limitBreak ?? 0;
    void onCompositionChange(
      {
        ...input,
        craftEssenceId: master.id,
        craftEssenceAtk: deriveCraftEssenceAtk(master, level, limitBreak),
      },
      {
        ...selection,
        craftEssence: {
          source,
          craftEssenceId: master.id,
          copyId: copy?.copyId ?? null,
          level,
          limitBreak,
        },
      },
    );
    closeCraftEssenceDialog();
  }
  function changeCraftEssenceState(patch: Partial<{ level: number; limitBreak: number }>) {
    const current = selection.craftEssence;
    if (!current || !selectedCraftEssence) return;
    const limitBreak = Math.max(0, Math.min(4, patch.limitBreak ?? current.limitBreak));
    const maximum =
      selectedCraftEssence.maxLevelByLimitBreak[limitBreak] ??
      selectedCraftEssence.maxLevelByLimitBreak[4];
    const level = Math.max(1, Math.min(maximum, patch.level ?? current.level));
    void onCompositionChange(
      {
        ...input,
        craftEssenceAtk: deriveCraftEssenceAtk(selectedCraftEssence, level, limitBreak),
      },
      { ...selection, craftEssence: { ...current, level, limitBreak } },
    );
  }
  function clearCraftEssence() {
    void onCompositionChange(
      { ...input, craftEssenceId: null, craftEssenceAtk: 0 },
      { ...selection, craftEssence: null },
    );
  }
  function changeAttackerSkill(
    skillId: string,
    patch: Partial<Pick<AttackerSkillSelection, 'enabled' | 'skillLevel'>>,
  ) {
    const attackerSkills = (selection.attackerSkills ?? []).map((skill) =>
      skill.skillId === skillId ? { ...skill, ...patch } : skill,
    );
    void onCompositionChange(input, { ...selection, attackerSkills });
  }
  function closeAttackerDialog() {
    setAttackerDialogOpen(false);
    requestAnimationFrame(() => attackerTriggerRef.current?.focus());
  }
  function closeCraftEssenceDialog() {
    setCraftEssenceDialogOpen(false);
    requestAnimationFrame(() => craftEssenceTriggerRef.current?.focus());
  }
  const snapshot = {
    kind: 'fgo-lab-calculation-share' as const,
    schemaVersion: 1 as const,
    sharedAt: new Date().toISOString(),
    input: resolvedInput,
    result,
    composition: {
      craftEssence: selection.craftEssence
        ? {
            craftEssenceId: selection.craftEssence.craftEssenceId,
            level: selection.craftEssence.level,
            limitBreak: selection.craftEssence.limitBreak,
          }
        : null,
    },
  };
  async function copyUrl() {
    try {
      await onFinalize(resolvedInput, result);
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
      if (!resultCardRef.current) throw new Error('result_card_missing');
      await onFinalize(resolvedInput, result);
      const url = URL.createObjectURL(await resultCardPng(resultCardRef.current));
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
  function saveShareJson() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'fgo-lab-calculation.json';
    link.click();
    URL.revokeObjectURL(url);
    setMessage('共有専用JSONを保存しました');
  }
  return (
    <div className="worksheet">
      <section>
        <div className="section-heading">
          <div>
            <p className="eyebrow">CONDITIONS</p>
            <h2>計算条件</h2>
          </div>
          <span className="badge">{result.precision}</span>
        </div>
        <button
          ref={attackerTriggerRef}
          className="entity-summary entity-picker-trigger"
          onClick={() => {
            setAttackerSource(selection.attackerSource);
            setAttackerDialogOpen(true);
          }}
          aria-label="攻撃役を変更"
        >
          <MasterImage src={attacker?.imageKey ?? null} alt="" fallback={attacker?.name ?? '?'} />
          <p>
            <strong>{attacker?.name ?? input.attackerId}</strong>
            <small>
              {attacker?.classId}・{attacker?.npTarget === 'all' ? '全体' : '単体'}
              {attacker?.npCard.toUpperCase()}宝具
            </small>
            <small>
              {selection.attackerSource === 'owned' ? '所持・育成管理の保存値' : '全DBの仮想設定'}
            </small>
          </p>
          <span className="picker-action">変更</span>
        </button>
        <div role="tablist" aria-label="入力方法">
          <button role="tab" aria-selected={mode === 'quick'} onClick={() => setMode('quick')}>
            クイック操作
          </button>
          <button role="tab" aria-selected={mode === 'direct'} onClick={() => setMode('direct')}>
            直接入力
          </button>
        </div>
        <div className="form-grid">
          <label>
            サーヴァントLv
            <input
              type="number"
              min="1"
              max="120"
              value={input.attackerLevel}
              onChange={(event) => {
                const level = Number(event.target.value);
                change({
                  attackerLevel: level,
                  attackerAtk: attacker?.atkByLevel[String(level)] ?? input.attackerAtk,
                });
              }}
            />
            {selection.attackerSource === 'owned' && builds[input.attackerId]?.npLevel ? (
              <button
                type="button"
                className="inline-action"
                onClick={() => attacker && selectAttacker(attacker, 'owned')}
              >
                保存値へ戻す
              </button>
            ) : null}
          </label>
          <label>
            宝具Lv
            <select
              value={input.npLevel}
              onChange={(event) => change({ npLevel: Number(event.target.value) })}
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  NP{value}
                </option>
              ))}
            </select>
          </label>
          <label>
            OC
            <select
              value={input.overcharge}
              onChange={(event) => change({ overcharge: Number(event.target.value) })}
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <div className="picker-field form-grid-wide">
            <span>概念礼装</span>
            {selectedCraftEssence && selection.craftEssence ? (
              <div className="selected-equipment">
                <button
                  ref={craftEssenceTriggerRef}
                  className="entity-summary compact entity-picker-trigger"
                  onClick={() => {
                    setCraftEssenceSource(selection.craftEssence?.source ?? 'registered');
                    setCraftEssenceDialogOpen(true);
                  }}
                  aria-label="概念礼装を変更"
                >
                  <MasterImage
                    src={selectedCraftEssence.imageKey}
                    alt=""
                    fallback={selectedCraftEssence.name}
                  />
                  <span className="list-row-main">
                    <strong>{selectedCraftEssence.name}</strong>
                    <small>
                      {selection.craftEssence.source === 'registered'
                        ? '登録コピー'
                        : '全DBの仮想設定'}
                      ・Lv{selection.craftEssence.level}・ATK {input.craftEssenceAtk}
                    </small>
                  </span>
                  <span className="picker-action">変更</span>
                </button>
                <div className="equipment-controls">
                  <label>
                    礼装Lv
                    <input
                      type="number"
                      min="1"
                      max={
                        selectedCraftEssence.maxLevelByLimitBreak[selection.craftEssence.limitBreak]
                      }
                      value={selection.craftEssence.level}
                      onChange={(event) =>
                        changeCraftEssenceState({ level: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    限界突破
                    <select
                      value={selection.craftEssence.limitBreak}
                      onChange={(event) =>
                        changeCraftEssenceState({ limitBreak: Number(event.target.value) })
                      }
                    >
                      {[0, 1, 2, 3, 4].map((value) => (
                        <option key={value} value={value}>
                          {value === 4 ? '最大解放' : `${value}回`}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedCraftEssenceCopy ? (
                    <button
                      type="button"
                      onClick={() =>
                        selectCraftEssence(
                          selectedCraftEssence,
                          'registered',
                          selectedCraftEssenceCopy,
                        )
                      }
                    >
                      保存値へ戻す
                    </button>
                  ) : null}
                  <button type="button" onClick={clearCraftEssence}>
                    外す
                  </button>
                </div>
              </div>
            ) : (
              <button
                ref={craftEssenceTriggerRef}
                className="empty-picker"
                onClick={() => {
                  setCraftEssenceSource(craftEssenceCopies.length ? 'registered' : 'master');
                  setCraftEssenceDialogOpen(true);
                }}
              >
                礼装なし・選択する
              </button>
            )}
          </div>
          <label>
            敵クラス
            <input
              value={input.target.classId}
              onChange={(event) =>
                change({ target: { ...input.target, classId: event.target.value } })
              }
            />
          </label>
          <label>
            敵属性
            <select
              value={input.target.attribute}
              onChange={(event) =>
                change({
                  target: {
                    ...input.target,
                    attribute: event.target.value as CalcInput['target']['attribute'],
                  },
                })
              }
            >
              {['man', 'earth', 'sky', 'star', 'beast', 'unknown'].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            敵特性（カンマ区切り）
            <input
              value={input.target.traits.join(',')}
              onChange={(event) =>
                change({
                  target: {
                    ...input.target,
                    traits: event.target.value
                      .split(',')
                      .map((value) => value.trim())
                      .filter(Boolean),
                  },
                })
              }
            />
          </label>
          {mode === 'direct' &&
            (
              [
                ['攻撃力補正', 'attackBuff'],
                ['カード性能補正', 'cardBuff'],
                ['宝具威力補正', 'npDamageBuff'],
                ['特攻付与', 'powerMod'],
                ['特殊威力', 'npSpecialMultiplier'],
                ['特殊耐性', 'specialResistance'],
              ] as const
            ).map(([label, key]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  step="0.01"
                  value={input[key]}
                  onChange={(event) => change({ [key]: Number(event.target.value) })}
                />
              </label>
            ))}
        </div>
        <section className="attacker-skills" aria-label="攻撃役の自身スキル">
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">SELF SKILLS</p>
              <h3>攻撃役の自身スキル</h3>
            </div>
            <small>変更はこの計算だけ</small>
          </div>
          {(selection.attackerSkills ?? []).length === 0 ? (
            <p className="notice">展開できる自身スキルがありません。</p>
          ) : (
            <ul className="plain-list attacker-skill-list">
              {(selection.attackerSkills ?? []).map((selectedSkill, index) => {
                const skill = attacker?.skills.find(
                  (candidate) => candidate.id === selectedSkill.skillId,
                );
                if (!skill) return null;
                const savedLevel =
                  selection.attackerSource === 'owned'
                    ? (builds[input.attackerId]?.skills[String(index + 1)] ?? 1)
                    : 10;
                const modified = selectedSkill.skillLevel !== savedLevel;
                const effects = selectedAttackerSkillResolution.effects.filter(
                  (effect) => effect.skillId === skill.id,
                );
                const state = modified
                  ? 'modified'
                  : selection.attackerSource === 'owned'
                    ? 'saved'
                    : 'added';
                const stateLabel =
                  state === 'modified' ? '一時変更' : state === 'saved' ? '保存値' : '仮想値';
                const effectSummary = skill.effects.map((effect) => {
                  const resolved = effects.find((candidate) => candidate.effectId === effect.id);
                  if (!selectedSkill.enabled) return effect.label;
                  if (resolved?.applied && resolved.value !== null)
                    return `${effect.label} ${resolved.value.toLocaleString('ja-JP', {
                      style: 'percent',
                      signDisplay: 'always',
                      maximumFractionDigits: 1,
                    })}`;
                  if (resolved?.reason === 'not_np_damage_relevant')
                    return `${effect.label}（宝具火力外）`;
                  if (resolved?.reason === 'card_type_mismatch')
                    return `${effect.label}（カード不一致）`;
                  return `${effect.label}（未対応）`;
                });
                return (
                  <li key={skill.id} className="attacker-skill-row" data-state={state}>
                    <MasterImage
                      src={skill.imageKey}
                      alt=""
                      fallback={skill.name}
                      className="skill-icon"
                    />
                    <div className="attacker-skill-copy">
                      <div>
                        <strong>
                          スキル{index + 1}：{skill.name}
                        </strong>
                        <small className={`skill-state skill-state-${state}`}>{stateLabel}</small>
                      </div>
                      <p>{effectSummary.join('・')}</p>
                      {modified ? (
                        <button
                          type="button"
                          className="skill-reset"
                          onClick={() => changeAttackerSkill(skill.id, { skillLevel: savedLevel })}
                        >
                          {selection.attackerSource === 'owned'
                            ? `保存Lv${savedLevel}へ戻す`
                            : `既定Lv${savedLevel}へ戻す`}
                        </button>
                      ) : null}
                    </div>
                    <label className="skill-level-control">
                      <span>Lv</span>
                      <select
                        value={selectedSkill.skillLevel}
                        onChange={(event) =>
                          changeAttackerSkill(skill.id, {
                            skillLevel: Number(event.target.value),
                          })
                        }
                        aria-label={`${skill.name}のスキルレベル`}
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="skill-toggle">
                      <input
                        type="checkbox"
                        checked={selectedSkill.enabled}
                        onChange={(event) =>
                          changeAttackerSkill(skill.id, { enabled: event.target.checked })
                        }
                        aria-label={`${skill.name}を使用`}
                      />
                      適用
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {selectedAttackerSkillResolution.warnings.map((warning) => (
            <p className="notice" key={warning}>
              未解決: {warning}
            </p>
          ))}
        </section>
        <section className="support-composition" aria-label="支援・バフ">
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">SUPPORT</p>
              <h3>支援・バフ</h3>
            </div>
            <button onClick={() => setSupportDialogOpen(true)}>支援条件を呼び出す</button>
          </div>
          {!selectedSupport ? (
            <p className="notice">保存済み支援条件はまだ適用されていません。</p>
          ) : (
            <>
              <div className="selected-support-head">
                <span>
                  <small>使用中の支援条件</small>
                  <strong>{selectedSupport.name}</strong>
                </span>
                <button onClick={() => void onSupportSelect(undefined)}>解除</button>
              </div>
              <ul className="plain-list support-effect-list">
                {selectedSupportResolution?.effects.map((effect) => (
                  <li key={`${effect.sourceId}:${effect.skillId}:${effect.effectId}`}>
                    <span className="list-row-main">
                      <strong>
                        {effect.sourceName}・{effect.skillName}
                      </strong>
                      <small>{effect.label}</small>
                    </span>
                    <span className={effect.applied ? 'effect-applied' : 'effect-inactive'}>
                      {effect.applied && effect.value !== null
                        ? `+${effect.value.toLocaleString('ja-JP', {
                            style: 'percent',
                            maximumFractionDigits: 1,
                          })}`
                        : effect.reason === 'not_np_damage_relevant'
                          ? '宝具火力外'
                          : '未適用'}
                    </span>
                  </li>
                ))}
              </ul>
              {selectedSupportResolution?.warnings.map((warning) => (
                <p className="notice" key={warning}>
                  未解決: {warning}
                </p>
              ))}
            </>
          )}
        </section>
        {sharedVersionMismatch && (
          <p role="status" className="notice">
            対応するデータ版またはエンジン版がないため、共有時の履歴結果を表示しています。入力を変更すると現行版で新規計算します。
          </p>
        )}
        <p className="notice">
          特殊Functionの差分検証が完了するまで、結果精度はapproximateとして表示します。
        </p>
      </section>
      <div className="result-column">
        <article
          ref={resultCardRef}
          className="result-card"
          data-share-card
          aria-label="共有対象の計算結果"
        >
          <header className="result-card-head">
            <div className="result-card-title">
              <div>
                <p className="eyebrow">RESULT</p>
                <h2>宝具ダメージ</h2>
              </div>
              <span>平均・最低・最大</span>
            </div>
            <div className="result-subject">
              <MasterImage
                src={attacker?.imageKey ?? null}
                alt=""
                fallback={attacker?.name ?? input.attackerId}
              />
              <span>
                <strong>{attacker?.name ?? input.attackerId}</strong>
                <small>
                  Lv.{input.attackerLevel}・NP{input.npLevel}・{craftEssenceSummary}
                </small>
              </span>
            </div>
          </header>
          <dl className="result-conditions">
            <div>
              <dt>攻撃対象</dt>
              <dd>{targetSummary}</dd>
            </div>
            <div>
              <dt>自身スキル</dt>
              <dd>
                {enabledAttackerSkills.length ? `${enabledAttackerSkills.length}件適用` : 'なし'}
              </dd>
            </div>
            <div>
              <dt>支援</dt>
              <dd>{supportSummary}</dd>
            </div>
          </dl>
          <table className="np-result-table">
            <caption className="visually-hidden">宝具レベル別のダメージ</caption>
            <thead>
              <tr>
                <th>宝具Lv</th>
                <th className="average">平均</th>
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
                    {row.npLevel === input.npLevel && <small>現在</small>}
                  </th>
                  <td className="average">{numberFormatter.format(row.average)}</td>
                  <td>{numberFormatter.format(row.minimum)}</td>
                  <td>{numberFormatter.format(row.maximum)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <footer className="result-card-foot">
            <span className={`precision precision-${result.precision}`}>{result.precision}</span>
            <small>FGO Lab・DB {result.versions.masterDataVersion}</small>
          </footer>
        </article>
        <div className="result-actions">
          <button className="primary" onClick={() => void copyUrl()}>
            URLをコピー
          </button>
          <button onClick={() => void saveImage()}>画像として保存</button>
          <button aria-label="共有専用JSONを保存" onClick={saveShareJson}>
            共有専用JSON
          </button>
        </div>
        <p aria-live="polite">{message}</p>
        <details className="result-details">
          <summary>計算内訳・仮定・警告</summary>
          <ul>
            {result.assumptions.map((item) => (
              <li key={item}>{item}</li>
            ))}
            {result.warnings.map((item) => (
              <li key={item}>警告: {item}</li>
            ))}
          </ul>
        </details>
      </div>
      {attackerDialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="attacker-picker-title"
          className="dialog"
          onKeyDown={(event) => handleModalKeyboard(event, closeAttackerDialog)}
        >
          <div className="dialog-panel picker-dialog-panel">
            <div className="section-heading">
              <h2 id="attacker-picker-title">攻撃役を選択</h2>
              <button onClick={closeAttackerDialog}>閉じる</button>
            </div>
            <div role="tablist" aria-label="攻撃役の選択元" className="source-tabs">
              <button
                role="tab"
                aria-selected={attackerSource === 'owned'}
                onClick={() => setAttackerSource('owned')}
              >
                所持・育成管理
              </button>
              <button
                role="tab"
                aria-selected={attackerSource === 'master'}
                onClick={() => setAttackerSource('master')}
              >
                全DB
              </button>
            </div>
            <label>
              名前・クラス
              <input
                type="search"
                value={attackerSearch}
                onChange={(event) => setAttackerSearch(event.target.value)}
                autoFocus
              />
            </label>
            {visibleAttackers.length === 0 ? (
              <p className="empty">一致する攻撃役はありません。</p>
            ) : (
              <ul className="plain-list picker-result-list">
                {visibleAttackers.map((candidate) => {
                  const saved = builds[candidate.id];
                  return (
                    <li key={candidate.id}>
                      <button
                        className="list-row"
                        onClick={() => selectAttacker(candidate, attackerSource)}
                      >
                        <MasterImage src={candidate.imageKey} alt="" fallback={candidate.name} />
                        <span className="list-row-main">
                          <strong>{candidate.name}</strong>
                          <small>
                            {candidate.classId}・
                            {attackerSource === 'owned' && saved
                              ? `Lv${saved.level} / NP${saved.npLevel} / フォウ${saved.fouAtk}`
                              : 'Lv90 / NP1 / フォウ1000（仮想）'}
                          </small>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {visibleAttackers.length === 100 ? (
              <p className="notice">
                先頭100件を表示中です。名前またはクラスで絞り込んでください。
              </p>
            ) : null}
          </div>
        </div>
      )}
      {craftEssenceDialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="calculation-ce-picker-title"
          className="dialog"
          onKeyDown={(event) => handleModalKeyboard(event, closeCraftEssenceDialog)}
        >
          <div className="dialog-panel picker-dialog-panel">
            <div className="section-heading">
              <h2 id="calculation-ce-picker-title">概念礼装を選択</h2>
              <button onClick={closeCraftEssenceDialog}>閉じる</button>
            </div>
            <div role="tablist" aria-label="概念礼装の選択元" className="source-tabs">
              <button
                role="tab"
                aria-selected={craftEssenceSource === 'registered'}
                onClick={() => setCraftEssenceSource('registered')}
              >
                登録済みコピー
              </button>
              <button
                role="tab"
                aria-selected={craftEssenceSource === 'master'}
                onClick={() => setCraftEssenceSource('master')}
              >
                全DB
              </button>
            </div>
            <label>
              礼装名
              <input
                type="search"
                value={craftEssenceSearch}
                onChange={(event) => setCraftEssenceSearch(event.target.value)}
                autoFocus
              />
            </label>
            {visibleCraftEssences.length === 0 ? (
              <p className="empty">
                {craftEssenceSource === 'registered'
                  ? '登録済みの概念礼装はありません。全DBから仮想礼装を選択できます。'
                  : '一致する概念礼装はありません。'}
              </p>
            ) : (
              <ul className="plain-list picker-result-list">
                {visibleCraftEssences.map(({ master, copy }) => (
                  <li key={copy?.copyId ?? master.id}>
                    <button
                      className="list-row"
                      onClick={() => selectCraftEssence(master, craftEssenceSource, copy)}
                    >
                      <MasterImage src={master.imageKey} alt="" fallback={master.name} />
                      <span className="list-row-main">
                        <strong>{master.name}</strong>
                        <small>
                          {copy
                            ? `登録コピー・Lv${copy.level}・${copy.limitBreak === 4 ? '最大解放' : `${copy.limitBreak}回突破`}・ATK ${deriveCraftEssenceAtk(master, copy.level, copy.limitBreak)}`
                            : `Lv1・未突破（仮想）・ATK ${deriveCraftEssenceAtk(master, 1, 0)}`}
                        </small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {visibleCraftEssences.length === 100 ? (
              <p className="notice">先頭100件を表示中です。礼装名で絞り込んでください。</p>
            ) : null}
          </div>
        </div>
      )}
      {supportDialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="support-template-picker-title"
          className="dialog"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setSupportDialogOpen(false);
          }}
        >
          <div className="dialog-panel">
            <h2 id="support-template-picker-title">保存済み支援条件</h2>
            <label>
              条件名・サーヴァント名
              <input
                type="search"
                value={supportSearch}
                onChange={(event) => setSupportSearch(event.target.value)}
                autoFocus
              />
            </label>
            {visibleSupportTemplates.length === 0 ? (
              <p>一致する支援条件はありません。</p>
            ) : (
              <ul className="plain-list template-picker-list">
                {visibleSupportTemplates.map((template) => {
                  const sourceIds = [...new Set(template.effects.map((effect) => effect.sourceId))];
                  return (
                    <li key={template.templateId}>
                      <span className="list-row-main">
                        <strong>{template.name}</strong>
                        <small>
                          {sourceIds.length}騎・使用中
                          {template.effects.filter((effect) => effect.enabled).length}スキル
                        </small>
                      </span>
                      <button
                        onClick={() => {
                          void onSupportSelect(template);
                          setSupportDialogOpen(false);
                        }}
                      >
                        呼び出す
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <button onClick={() => setSupportDialogOpen(false)}>閉じる</button>
          </div>
        </div>
      )}
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
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const visible = servants.filter((candidate) => {
    const owned = (builds[candidate.id]?.npLevel ?? 0) > 0;
    const normalizedSearch = search.toLocaleLowerCase('ja');
    return (
      (candidate.name.toLocaleLowerCase('ja').includes(normalizedSearch) ||
        candidate.classId.toLocaleLowerCase('ja').includes(normalizedSearch)) &&
      (scope === 'all' || (scope === 'owned' ? owned : !owned))
    );
  });
  const selected = servants.find((candidate) => candidate.id === selectedId) ?? visible[0];
  const build = selected ? builds[selected.id] : undefined;
  const target = selected ? targets[selected.id] : undefined;
  return (
    <div className={`master-detail${mobileDetailOpen ? ' mobile-detail-open' : ''}`}>
      <section className="overview-pane">
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
              onClick={() => {
                setSelectedId(candidate.id);
                setMobileDetailOpen(true);
              }}
            >
              <MasterImage src={candidate.imageKey} alt="" fallback={candidate.name} />
              <span className="list-row-main">
                <strong>{candidate.name}</strong>
                <small>
                  {candidate.classId}・{candidate.npTarget === 'all' ? '全体' : '単体'}
                  {candidate.npCard.toUpperCase()}
                </small>
              </span>
              <span className="list-row-state">
                <strong>
                  {builds[candidate.id]?.npLevel
                    ? `NP${String(builds[candidate.id]?.npLevel)}`
                    : 'NP0'}
                </strong>
                <small>
                  {builds[candidate.id]?.npLevel
                    ? `Lv.${String(builds[candidate.id]?.level)}`
                    : '未所持'}
                </small>
              </span>
            </button>
          ))}
        </div>
      </section>
      <section className="detail-editor">
        <button className="mobile-back" onClick={() => setMobileDetailOpen(false)}>
          ← 一覧へ戻る
        </button>
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
            <div className="entity-summary detail-hero">
              <MasterImage
                src={selected.imageKey}
                alt=""
                fallback={selected.name}
                className="large"
              />
              <p>
                <strong>{selected.name}</strong>
                <small>
                  {selected.classId}・{selected.npTarget === 'all' ? '全体' : '単体'}
                  {selected.npCard.toUpperCase()}宝具
                </small>
              </p>
            </div>
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
              再臨段階
              <select
                value={tab === 'current' ? (build?.ascension ?? 0) : (target?.ascension ?? 0)}
                onChange={(event) =>
                  void (tab === 'current'
                    ? onChange(selected.id, { ascension: Number(event.target.value) })
                    : onTargetChange(selected.id, {
                        ascension: Number(event.target.value),
                        planned: true,
                      }))
                }
              >
                {[0, 1, 2, 3, 4].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              ATKフォウ
              <input
                type="number"
                min="0"
                max="5000"
                step="10"
                value={tab === 'current' ? (build?.fouAtk ?? 0) : (target?.fouAtk ?? 0)}
                onChange={(event) =>
                  void (tab === 'current'
                    ? onChange(selected.id, { fouAtk: Number(event.target.value) })
                    : onTargetChange(selected.id, {
                        fouAtk: Number(event.target.value),
                        planned: true,
                      }))
                }
              />
            </label>
            {[1, 2, 3].map((slot) => {
              const key = String(slot);
              const skill = selected.skills[slot - 1];
              return (
                <label key={`skill:${key}`} className="skill-field">
                  <span className="field-identity">
                    <MasterImage
                      src={skill?.imageKey ?? null}
                      alt=""
                      fallback={skill?.name ?? String(slot)}
                      className="skill-icon"
                    />
                    <span>
                      <strong>{skill?.name ?? `スキル${String(slot)}`}</strong>
                      <small>スキル{slot}</small>
                    </span>
                  </span>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={
                      tab === 'current' ? (build?.skills[key] ?? 1) : (target?.skills[key] ?? 1)
                    }
                    onChange={(event) => {
                      const level = Number(event.target.value);
                      if (tab === 'current')
                        void onChange(selected.id, {
                          skills: { ...build?.skills, [key]: level },
                        });
                      else
                        void onTargetChange(selected.id, {
                          skills: { ...target?.skills, [key]: level },
                          planned: true,
                        });
                    }}
                  />
                </label>
              );
            })}
            <details>
              <summary>アペンドスキル</summary>
              <div className="form-grid">
                {[1, 2, 3, 4, 5].map((slot) => {
                  const key = String(slot);
                  return (
                    <label key={`append:${key}`}>
                      アペンド{slot}
                      <input
                        type="number"
                        min="0"
                        max="10"
                        value={
                          tab === 'current'
                            ? (build?.appends[key] ?? 0)
                            : (target?.appends[key] ?? 0)
                        }
                        onChange={(event) => {
                          const level = Number(event.target.value);
                          if (tab === 'current')
                            void onChange(selected.id, {
                              appends: { ...build?.appends, [key]: level },
                            });
                          else
                            void onTargetChange(selected.id, {
                              appends: { ...target?.appends, [key]: level },
                              planned: true,
                            });
                        }}
                      />
                    </label>
                  );
                })}
              </div>
            </details>
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
                    ? onChange(selected.id, {
                        skills: { ...build?.skills, '1': 10, '2': 10, '3': 10 },
                      })
                    : onTargetChange(selected.id, {
                        skills: { ...target?.skills, '1': 10, '2': 10, '3': 10 },
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
  onUpdate,
}: {
  copies: CraftEssenceCopy[];
  masters: CraftEssenceMaster[];
  onAdd: (craftEssenceId: string) => Promise<void>;
  onRemove: (copyId: string) => Promise<void>;
  onUpdate: (
    copyId: string,
    patch: Pick<Partial<CraftEssenceCopy>, 'level' | 'limitBreak'>,
  ) => Promise<void>;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState('');
  const names = new Map(masters.map((master) => [master.id, master.name]));
  const masterById = new Map(masters.map((master) => [master.id, master]));
  const orderedCopies = [...copies].sort(
    (a, b) =>
      (names.get(a.craftEssenceId) ?? a.craftEssenceId).localeCompare(
        names.get(b.craftEssenceId) ?? b.craftEssenceId,
        'ja',
      ) || a.copyId.localeCompare(b.copyId),
  );
  const candidates = masters
    .filter((master) =>
      master.name.toLocaleLowerCase('ja').includes(search.toLocaleLowerCase('ja')),
    )
    .slice(0, 100);
  return (
    <section className="ranking-page">
      <h2>登録済み {copies.length}枚</h2>
      <button className="primary" onClick={() => setDialogOpen(true)}>
        DBから礼装を登録
      </button>
      <ul className="plain-list" aria-label="登録済み概念礼装">
        {orderedCopies.map((copy) => {
          const master = masterById.get(copy.craftEssenceId);
          const label = names.get(copy.craftEssenceId) ?? copy.craftEssenceId;
          return (
            <li key={copy.copyId}>
              <MasterImage src={master?.imageKey ?? null} alt="" fallback={label} />
              <span className="list-row-main">
                <strong>{label}</strong>
                <small>
                  {master
                    ? `ATK ${String(deriveCraftEssenceAtk(master, copy.level, copy.limitBreak))}`
                    : ''}
                </small>
              </span>
              <label>
                Lv
                <input
                  aria-label={`${label}のレベル`}
                  type="number"
                  min="1"
                  max={master?.maxLevelByLimitBreak[copy.limitBreak] ?? 100}
                  value={copy.level}
                  onChange={(event) =>
                    void onUpdate(copy.copyId, { level: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                限界突破
                <select
                  aria-label={`${label}の限界突破`}
                  value={copy.limitBreak}
                  onChange={(event) =>
                    void onUpdate(copy.copyId, { limitBreak: Number(event.target.value) })
                  }
                >
                  {[0, 1, 2, 3, 4].map((value) => (
                    <option key={value} value={value}>
                      {value === 4 ? '最大解放' : `${String(value)}回`}
                    </option>
                  ))}
                </select>
              </label>
              <button onClick={() => void onRemove(copy.copyId)}>登録解除</button>
            </li>
          );
        })}
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
  servants,
  onAdd,
  onAddSource,
  onUpdateEffect,
}: {
  templates: SupportTemplate[];
  servants: ServantMaster[];
  onAdd: () => Promise<void>;
  onAddSource: (templateId: string, servantId: string) => Promise<void>;
  onUpdateEffect: (
    templateId: string,
    sourceId: string,
    effectId: string,
    patch: Partial<Pick<SupportTemplate['effects'][number], 'enabled' | 'skillLevel'>>,
  ) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState(templates[0]?.templateId ?? '');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = templates.find((template) => template.templateId === selectedId) ?? templates[0];
  const servantById = new Map(servants.map((servant) => [servant.id, servant]));
  const sources = selected ? [...new Set(selected.effects.map((effect) => effect.sourceId))] : [];
  const candidates = servants
    .filter(
      (servant) =>
        servant.skills.length > 0 &&
        servant.name.toLocaleLowerCase('ja').includes(search.toLocaleLowerCase('ja')),
    )
    .slice(0, 100);
  return (
    <section>
      <button
        className="primary"
        onClick={() =>
          void onAdd().then(() => {
            setSelectedId('');
          })
        }
      >
        支援条件を作成
      </button>
      {templates.length === 0 ? (
        <p>保存済みの支援条件はありません。</p>
      ) : (
        <>
          <label>
            保存済み支援条件
            <select
              value={selected?.templateId ?? ''}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {templates.map((template) => (
                <option key={template.templateId} value={template.templateId}>
                  {template.name}（{template.effects.filter((effect) => effect.enabled).length}
                  スキル使用）
                </option>
              ))}
            </select>
          </label>
          {selected && (
            <section aria-label="支援条件の編集">
              <h2>{selected.name}</h2>
              <p>
                支援元 {sources.length}騎 / 使用中{' '}
                {selected.effects.filter((effect) => effect.enabled).length}スキル / DB{' '}
                {selected.masterDataVersion}
              </p>
              <button onClick={() => setDialogOpen(true)}>支援元を追加</button>
              {sources.map((sourceId) => {
                const source = servantById.get(sourceId);
                const effects = selected.effects.filter((effect) => effect.sourceId === sourceId);
                return (
                  <section key={sourceId} className="support-source">
                    <h3>{source?.name ?? sourceId}</h3>
                    <ul className="plain-list">
                      {effects.map((effect) => {
                        const skill = source?.skills.find(
                          (candidate) => candidate.id === effect.effectId,
                        );
                        return (
                          <li key={effect.effectId}>
                            <label>
                              <input
                                type="checkbox"
                                checked={effect.enabled}
                                onChange={(event) =>
                                  void onUpdateEffect(
                                    selected.templateId,
                                    sourceId,
                                    effect.effectId,
                                    {
                                      enabled: event.target.checked,
                                    },
                                  )
                                }
                              />
                              {skill?.name ?? effect.effectId}を使用
                            </label>
                            <label>
                              Lv
                              <select
                                aria-label={`${skill?.name ?? effect.effectId}のスキルレベル`}
                                value={effect.skillLevel}
                                onChange={(event) =>
                                  void onUpdateEffect(
                                    selected.templateId,
                                    sourceId,
                                    effect.effectId,
                                    {
                                      skillLevel: Number(event.target.value),
                                    },
                                  )
                                }
                              >
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
                                  <option key={value} value={value}>
                                    {value}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <small>
                              {skill?.detail}
                              {skill?.effects.map(
                                (item) => ` / ${item.label}・対象:${item.target}`,
                              )}
                            </small>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </section>
          )}
        </>
      )}
      {dialogOpen && selected && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="support-source-title"
          className="dialog"
        >
          <div className="dialog-panel">
            <h2 id="support-source-title">支援元サーヴァントを検索</h2>
            <label>
              サーヴァント名
              <input value={search} onChange={(event) => setSearch(event.target.value)} autoFocus />
            </label>
            <ul className="plain-list">
              {candidates.map((servant) => (
                <li key={servant.id}>
                  <span>
                    {servant.name} / {servant.skills.length}スキル
                  </span>
                  <button
                    onClick={() => {
                      void onAddSource(selected.templateId, servant.id);
                      setDialogOpen(false);
                    }}
                  >
                    追加
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
  const classes = [...new Set(candidates.map((candidate) => candidate.classId))].sort((a, b) =>
    a.localeCompare(b),
  );
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
            {classes.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
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
      <div className="ranking-table-scroll" role="region" tabIndex={0} aria-label="ランキング表">
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
      </div>
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
  const [category, setCategory] = useState('all');
  const [selectedId, setSelectedId] = useState<string>();
  const ledger = calculateGrowthLedger(
    master.servants,
    master.materials,
    profile.servantBuilds,
    profile.servantTargets,
  );
  const visible = filterAndSortLedger(ledger, search, category, order);
  const selected = ledger.find((entry) => entry.material.id === selectedId) ?? visible[0];
  const servantById = new Map(master.servants.map((servant) => [servant.id, servant]));
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
              カテゴリ
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="all">すべて</option>
                {[...new Set(ledger.map((entry) => entry.material.category))].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
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
                        <MasterImage
                          src={entry.material.imageKey}
                          alt=""
                          fallback={entry.material.name}
                          className="material-icon"
                        />
                        <span>
                          <strong>{entry.material.name}</strong>
                          <small>{entry.material.category}</small>
                        </span>
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
                    <MasterImage
                      src={servantById.get(usage.servantId)?.imageKey ?? null}
                      alt=""
                      fallback={servantById.get(usage.servantId)?.name ?? usage.servantId}
                    />
                    <span className="list-row-main">
                      <strong>{servantById.get(usage.servantId)?.name ?? usage.servantId}</strong>
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
  onImport: (profiles: ProfileCollection) => Promise<void>;
}) {
  const [message, setMessage] = useState('');
  const [pendingBackup, setPendingBackup] = useState<UserDataBackup>();
  const [preImportBackupSaved, setPreImportBackupSaved] = useState(false);
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
  function downloadBackup(value: UserDataBackup, filename: string) {
    const url = URL.createObjectURL(new Blob([exportBackup(value)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
  function download() {
    downloadBackup(backup, 'fgo-lab-backup.json');
    setMessage('バックアップを保存しました');
  }
  const importCounts = pendingBackup
    ? pendingBackup.profiles.profiles.reduce(
        (counts, profile) => ({
          servants: counts.servants + Object.keys(profile.servantBuilds).length,
          targets: counts.targets + Object.keys(profile.servantTargets).length,
          craftEssences: counts.craftEssences + profile.craftEssences.length,
          supports: counts.supports + profile.supportTemplates.length,
          history: counts.history + profile.history.length,
        }),
        { servants: 0, targets: 0, craftEssences: 0, supports: 0, history: 0 },
      )
    : undefined;
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
                  setPendingBackup(parsed);
                  setPreImportBackupSaved(false);
                  setMessage('形式を検証しました。内容と全置換を確認してください。');
                })
                .catch(() => setMessage('復元できませんでした'));
          }}
        />
      </label>
      {pendingBackup && importCounts && (
        <section aria-label="復元内容のプレビュー" className="notice">
          <h2>全置換のプレビュー</h2>
          <p>
            プロフィール {pendingBackup.profiles.profiles.length}件 / 所持登録{' '}
            {importCounts.servants}件 / 育成目標 {importCounts.targets}件 / 礼装{' '}
            {importCounts.craftEssences}枚 / 支援条件 {importCounts.supports}件 / 履歴{' '}
            {importCounts.history}件
          </p>
          <p>現在の全ユーザーデータを置き換えます。マスターデータは変更しません。</p>
          <div className="toolbar">
            <button
              onClick={() => {
                downloadBackup(backup, 'fgo-lab-before-import.json');
                setPreImportBackupSaved(true);
                setMessage('復元前バックアップを保存しました');
              }}
            >
              復元前バックアップを保存
            </button>
            <button
              className="danger"
              disabled={!preImportBackupSaved}
              onClick={() => {
                void onImport(pendingBackup.profiles)
                  .then(() => {
                    setPendingBackup(undefined);
                    setPreImportBackupSaved(false);
                    setMessage('検証済みデータへ全置換しました');
                  })
                  .catch(() => setMessage('復元に失敗しました。元データは維持されています。'));
              }}
            >
              全置換を実行
            </button>
            <button onClick={() => setPendingBackup(undefined)}>キャンセル</button>
          </div>
        </section>
      )}
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
function MasterImage({
  src,
  alt,
  fallback,
  className = '',
}: {
  src: string | null;
  alt: string;
  fallback: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={`image-frame ${className}`.trim()} aria-hidden={alt ? undefined : 'true'}>
      {src && !failed ? (
        <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span>{fallback.slice(0, 1)}</span>
      )}
    </span>
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
