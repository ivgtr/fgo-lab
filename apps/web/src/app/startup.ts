import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import {
  activeProfile,
  createProfileCollection,
  type Clock,
  type IdGenerator,
  type ProfileRepository,
  type ProfileWriteResult,
} from '@fgo-lab/profile-domain';
import type {
  CalculationResult,
  LocalProfile,
  PortableCalculationRequest,
  ProfileCollection,
} from '@fgo-lab/schema';
import {
  fetchMasterCandidate,
  fetchMasterManifest,
  fetchMasterSnapshot,
  loadActiveMaster,
  stageAndActivate,
  type ActiveMaster,
} from '../adapters/repository';
import { readShareFragment } from '../adapters/share';

interface StartupOptions {
  baseUrl: string;
  development: boolean;
  fragment: string;
  now: Date;
}

interface StartupBase {
  calculation: {
    request: PortableCalculationRequest | undefined;
    storedResult: CalculationResult | undefined;
    source: 'share' | 'draft' | undefined;
  };
  warning: string;
  offline: boolean;
}

export interface ReadyStartupResult extends StartupBase {
  state: 'ready';
  master: MasterDataSnapshot;
  profiles: ProfileCollection;
}

interface SetupRequiredResult extends StartupBase {
  state: 'setup-required';
  master: undefined;
  profiles: undefined;
  invalidStoredProfiles: boolean;
}

export type StartupResult = ReadyStartupResult | SetupRequiredResult;

function startupCalculation(
  shared: ReturnType<typeof readShareFragment>,
  profile: LocalProfile,
): Promise<StartupBase['calculation']> {
  if (shared)
    return Promise.resolve({
      request: shared.request,
      storedResult: shared.result,
      source: 'share',
    });
  if (profile.draft)
    return Promise.resolve({
      request: profile.draft.request,
      storedResult: profile.draft.result,
      source: 'draft',
    });
  return Promise.resolve({
    request: undefined,
    storedResult: undefined,
    source: undefined,
  });
}

async function activateCurrentMaster(options: StartupOptions) {
  const candidate = await fetchMasterCandidate(options.baseUrl);
  if (!options.development && candidate.manifest.artifactKind === 'diagnostic')
    throw new Error('diagnostic_fixture_cannot_be_activated');
  return {
    active: await stageAndActivate(candidate.manifest, candidate.snapshotBytes, options.now),
    fromOfflineCache: candidate.fromOfflineCache,
  };
}

export async function bootstrapApplication(
  profilesRepository: ProfileRepository,
  options: StartupOptions,
): Promise<StartupResult> {
  let warning = '';
  let offline = false;
  try {
    const activeLoad = await loadActiveMaster();
    let active = activeLoad.state === 'ready' ? activeLoad.active : undefined;
    const profilesLoad = await profilesRepository.load();
    if (profilesLoad.state === 'invalid')
      return emptyResult(
        '保存済みプロフィールを検証できません。削除して新規開始する場合は、確認画面で内容を確認してください。',
        offline,
        true,
      );
    const profiles = profilesLoad.state === 'ready' ? profilesLoad.collection : undefined;
    if (activeLoad.state === 'discarded') {
      try {
        const current = await activateCurrentMaster(options);
        offline = current.fromOfflineCache;
        active = current.active;
        warning = '互換性のない旧マスターデータを削除し、現行版へ更新しました。';
      } catch (cause) {
        warning = `互換性のない旧マスターデータを削除しました。再セットアップが必要です: ${errorMessage(cause)}`;
      }
    } else if (active) {
      try {
        const manifestCandidate = await fetchMasterManifest(options.baseUrl);
        offline = manifestCandidate.fromOfflineCache;
        assertActivatable(manifestCandidate.manifest.artifactKind, options.development);
        if (manifestCandidate.manifest.masterDataVersion !== active.manifest.masterDataVersion) {
          const snapshotCandidate = await fetchMasterSnapshot(
            options.baseUrl,
            manifestCandidate.manifest,
          );
          offline ||= snapshotCandidate.fromOfflineCache;
          active = await stageAndActivate(
            manifestCandidate.manifest,
            snapshotCandidate.snapshotBytes,
            options.now,
          );
        }
      } catch (cause) {
        warning = `更新に失敗したため互換性確認済みの ${active.manifest.masterDataVersion} を使用中: ${errorMessage(cause)}`;
      }
    }
    if (!active || !profiles) return emptyResult(warning, offline);

    let shared: ReturnType<typeof readShareFragment> = null;
    try {
      const candidate = readShareFragment(options.fragment);
      if (candidate) {
        const { validateCalculationShareSnapshot } = await import('../adapters/shareValidation');
        shared = validateCalculationShareSnapshot(candidate, active.snapshot);
      }
    } catch (cause) {
      warning = `共有URLを復元できませんでした: ${errorMessage(cause)}`;
    }
    const profile = activeProfile(profiles);
    return {
      state: 'ready',
      master: active.snapshot,
      profiles,
      calculation: await startupCalculation(shared, profile),
      warning,
      offline,
    };
  } catch (cause) {
    return emptyResult(
      `保存データを検証できなかったため、安全なセットアップ画面で起動しました: ${errorMessage(cause)}`,
      offline,
    );
  }
}

export async function setupApplication(
  profilesRepository: ProfileRepository,
  clock: Clock,
  ids: IdGenerator,
  options: StartupOptions,
  replaceInvalidWithFresh?: (collection: ProfileCollection) => Promise<ProfileWriteResult>,
): Promise<ReadyStartupResult> {
  const { active, fromOfflineCache } = await activateCurrentMaster(options);
  const profilesLoad = await profilesRepository.load();
  if (replaceInvalidWithFresh && profilesLoad.state !== 'invalid')
    throw new Error('profile_recovery_stale');
  let profiles: ProfileCollection;
  if (profilesLoad.state === 'ready') {
    profiles = profilesLoad.collection;
  } else {
    profiles = createProfileCollection('マスター', clock, ids);
    let initialized: ProfileWriteResult;
    if (profilesLoad.state === 'invalid') {
      if (!replaceInvalidWithFresh) throw new Error(profilesLoad.reason);
      initialized = await replaceInvalidWithFresh(profiles);
    } else {
      initialized = await profilesRepository.replace(profiles, { requireEmpty: true });
    }
    if (initialized.status !== 'committed') throw new Error('profile_initialization_stale');
  }
  let warning = '';
  let shared: ReturnType<typeof readShareFragment> = null;
  try {
    const candidate = readShareFragment(options.fragment);
    if (candidate) {
      const { validateCalculationShareSnapshot } = await import('../adapters/shareValidation');
      shared = validateCalculationShareSnapshot(candidate, active.snapshot);
    }
  } catch (cause) {
    warning = `共有URLを復元できませんでした: ${errorMessage(cause)}`;
  }
  const profile = activeProfile(profiles);
  return {
    state: 'ready',
    master: active.snapshot,
    profiles,
    calculation: await startupCalculation(shared, profile),
    warning,
    offline: fromOfflineCache,
  };
}

function assertActivatable(
  artifactKind: ActiveMaster['manifest']['artifactKind'],
  development: boolean,
) {
  if (!development && artifactKind === 'diagnostic')
    throw new Error('diagnostic_fixture_cannot_be_activated');
}

function emptyResult(
  warning: string,
  offline: boolean,
  invalidStoredProfiles = false,
): StartupResult {
  return {
    state: 'setup-required',
    master: undefined,
    profiles: undefined,
    invalidStoredProfiles,
    calculation: { request: undefined, storedResult: undefined, source: undefined },
    warning,
    offline,
  };
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
