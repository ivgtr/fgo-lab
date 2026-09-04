import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import {
  activeProfile,
  createProfileCollection,
  type Clock,
  type IdGenerator,
  type ProfileRepository,
} from '@fgo-lab/profile-domain';
import type {
  CalculationResult,
  CalculationShareSnapshot,
  PortableCalculationRequest,
  ProfileCollection,
} from '@fgo-lab/schema';
import {
  fetchMasterCandidate,
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
}

export type StartupResult = ReadyStartupResult | SetupRequiredResult;

async function activateCurrentMaster(options: StartupOptions) {
  const candidate = await fetchMasterCandidate(options.baseUrl);
  if (!options.development && candidate.manifest.artifactKind === 'diagnostic')
    throw new Error('diagnostic_fixture_cannot_be_activated');
  return {
    active: await stageAndActivate(candidate.manifest, candidate.snapshot, options.now),
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
    if (profilesLoad.state === 'invalid') throw new Error(profilesLoad.reason);
    const profiles = profilesLoad.state === 'ready' ? profilesLoad.collection : undefined;
    if (profilesLoad.state === 'ready' && profilesLoad.discardedCalculationSnapshots)
      warning =
        '保存済みの育成データを引き継ぎ、旧形式の支援条件・計算下書き・履歴を削除しました。';
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
        const candidate = await fetchMasterCandidate(options.baseUrl);
        offline = candidate.fromOfflineCache;
        assertActivatable(candidate.manifest.artifactKind, options.development);
        if (candidate.manifest.masterDataVersion !== active.manifest.masterDataVersion)
          active = await stageAndActivate(candidate.manifest, candidate.snapshot, options.now);
      } catch (cause) {
        warning = `更新に失敗したため互換性確認済みの ${active.manifest.masterDataVersion} を使用中: ${errorMessage(cause)}`;
      }
    }
    if (!active || !profiles) return emptyResult(warning, offline);

    let shared: CalculationShareSnapshot | null = null;
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
      calculation: {
        request: shared?.request ?? profile.draft?.request,
        storedResult: shared?.result ?? profile.draft?.result,
        source: shared ? 'share' : profile.draft ? 'draft' : undefined,
      },
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
): Promise<ReadyStartupResult> {
  const { active, fromOfflineCache } = await activateCurrentMaster(options);
  const profilesLoad = await profilesRepository.load();
  if (profilesLoad.state === 'invalid') throw new Error(profilesLoad.reason);
  const profiles =
    profilesLoad.state === 'ready'
      ? profilesLoad.collection
      : createProfileCollection('マスター', clock, ids);
  await profilesRepository.replace(profiles);
  let warning =
    profilesLoad.state === 'ready' && profilesLoad.discardedCalculationSnapshots
      ? '保存済みの育成データを引き継ぎ、旧形式の支援条件・計算下書き・履歴を削除しました。'
      : '';
  let shared: CalculationShareSnapshot | null = null;
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
    calculation: {
      request: shared?.request ?? profile.draft?.request,
      storedResult: shared?.result ?? profile.draft?.result,
      source: shared ? 'share' : profile.draft ? 'draft' : undefined,
    },
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

function emptyResult(warning: string, offline: boolean): StartupResult {
  return {
    state: 'setup-required',
    master: undefined,
    profiles: undefined,
    calculation: { request: undefined, storedResult: undefined, source: undefined },
    warning,
    offline,
  };
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
