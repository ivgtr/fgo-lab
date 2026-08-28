import type {
  RankingConditions,
  RankingDetail,
  RankingFailure,
  RankingProfileInput,
  RankingRowSummary,
  AttackProfile,
} from '@fgo-lab/calculation-application';
import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import type { VersionContext } from '@fgo-lab/schema';

export type RankingWorkerRequest =
  | {
      kind: 'initialize';
      requestId: string;
      master: MasterDataSnapshot;
      profile: RankingProfileInput;
      versions: VersionContext;
    }
  | {
      kind: 'calculate';
      requestId: string;
      fingerprint: string;
      conditions: RankingConditions;
    }
  | {
      kind: 'detail';
      requestId: string;
      fingerprint: string;
      entryId: string;
      servantId: string;
      attackProfile: AttackProfile;
    };

export type RankingWorkerResponse =
  | { kind: 'ready'; requestId: string }
  | {
      kind: 'result';
      requestId: string;
      fingerprint: string;
      rows: RankingRowSummary[];
      failures: RankingFailure[];
    }
  | {
      kind: 'detail';
      requestId: string;
      fingerprint: string;
      entryId: string;
      detail: RankingDetail | null;
    }
  | {
      kind: 'error';
      stage: 'initialization' | 'summary';
      requestId: string;
      fingerprint: string | null;
      reason: string;
    }
  | {
      kind: 'error';
      stage: 'detail';
      requestId: string;
      fingerprint: string;
      entryId: string;
      reason: string;
    };
