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
  activateAtlasMaster,
  loadActiveAtlasMaster,
  type AtlasActiveMaster,
} from '../adapters/atlasRepository';
import { generateAtlasMaster } from '../adapters/atlasMasterClient';
import { ATLAS_CONTRACT_SHA256 } from '../adapters/atlasContractFingerprint';
import {
  ATLAS_CERTIFICATE_URL,
  fetchSourceCertificate,
  isAtlasTransportFailure,
} from '../adapters/atlasSource';
import { requireAtlasController } from '../adapters/atlasController';
import { OldTabBlocksUpgrade } from '../adapters/labDatabase';
import { readShareFragment } from '../adapters/share';

interface StartupOptions {
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
  profiles: ProfileCollection | undefined;
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

export async function refreshAtlasMaster(
  previous: AtlasActiveMaster | undefined,
  now: Date,
): Promise<{ active: AtlasActiveMaster; changed: boolean }> {
  await requireAtlasController();
  const candidate = await fetchSourceCertificate(ATLAS_CERTIFICATE_URL, previous?.identity ?? null);
  if (candidate.state === 'unchanged') {
    if (!previous) throw new Error('atlas_startup:unchanged_without_active');
    return { active: previous, changed: false };
  }
  const generated = await generateAtlasMaster(candidate.certificate.certificate);
  const activation = await activateAtlasMaster({
    checked: candidate.certificate,
    snapshot: generated.snapshotBytes,
    contractSha256: ATLAS_CONTRACT_SHA256,
    now,
  });
  if (activation.status === 'committed') return { active: activation.active, changed: true };
  const concurrent = await loadActiveAtlasMaster(ATLAS_CONTRACT_SHA256);
  if (concurrent.state !== 'ready')
    throw new Error(`atlas_startup:activation_${activation.status}`);
  return {
    active: concurrent.active,
    changed: concurrent.active.identity.sha256 !== previous?.identity.sha256,
  };
}

export async function bootstrapApplication(
  profilesRepository: ProfileRepository,
  options: StartupOptions,
): Promise<StartupResult> {
  let warning = '';
  let offline = false;
  try {
    const activeLoad = await loadActiveAtlasMaster(ATLAS_CONTRACT_SHA256);
    let active = activeLoad.state === 'ready' ? activeLoad.active : undefined;
    const profilesLoad = await profilesRepository.load();
    if (profilesLoad.state === 'invalid')
      return emptyResult(
        '保存済みプロフィールを検証できません。削除して新規開始する場合は、確認画面で内容を確認してください。',
        offline,
        true,
      );
    if (activeLoad.state === 'empty' && profilesLoad.state === 'empty')
      return emptyResult('', offline);
    const profiles = profilesLoad.state === 'ready' ? profilesLoad.collection : undefined;
    try {
      active = (await refreshAtlasMaster(active, options.now)).active;
      if (activeLoad.state === 'invalid')
        warning = `保存済みマスターの破損（${activeLoad.reason}）を検出し、Atlasの検証済みマスターへ更新しました。`;
    } catch (cause) {
      warning = active
        ? `Atlas更新の確認に失敗したため検証済みのマスターを使用中: ${errorMessage(cause)}`
        : `Atlasマスターを取得できません: ${errorMessage(cause)}`;
      if (activeLoad.state === 'invalid')
        warning = `保存済みマスターを検証できません（${activeLoad.reason}）。${warning}`;
      offline =
        isAtlasTransportFailure(cause) || (typeof navigator !== 'undefined' && !navigator.onLine);
    }
    if (!active || !profiles) return { ...emptyResult(warning, offline), profiles };

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
    if (cause instanceof OldTabBlocksUpgrade)
      return emptyResult(
        '旧バージョンのタブが保存領域の更新を止めています。ほかのFGO Labタブを閉じて、このページを再読み込みしてください。',
        offline,
      );
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
  const stored = await loadActiveAtlasMaster(ATLAS_CONTRACT_SHA256);
  const { active } = await refreshAtlasMaster(
    stored.state === 'ready' ? stored.active : undefined,
    options.now,
  );
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
    offline: false,
  };
}

function emptyResult(
  warning: string,
  offline: boolean,
  invalidStoredProfiles = false,
): SetupRequiredResult {
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
  if (cause instanceof TypeError && cause.message === 'atlas_controller_upgrade_required')
    return '旧Service Workerの更新を待っています。このページを再読み込みしてください。';
  return cause instanceof Error ? cause.message : String(cause);
}
