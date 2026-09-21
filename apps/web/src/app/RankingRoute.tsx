'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import type { LocalProfile } from '@fgo-lab/schema';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { Ranking } from '../features/ranking/Ranking';
import type { CalculationWorkspace, Page } from './App';
import type { UpdateActiveProfile } from './portableDraft';

export function RankingRoute({
  master,
  profile,
  setCalculation,
  setCalculationSessionId,
  updateActiveProfile,
  replaceRoute,
}: {
  master: MasterDataSnapshot;
  profile: LocalProfile;
  setCalculation: Dispatch<SetStateAction<CalculationWorkspace>>;
  setCalculationSessionId: Dispatch<SetStateAction<string>>;
  updateActiveProfile: UpdateActiveProfile;
  replaceRoute: (page: Page) => void;
}) {
  return (
    <Ranking
      master={master}
      profile={{
        servantBuilds: profile.servantBuilds,
      }}
      versions={{
        schemaVersion: SCHEMA_VERSION,
        masterDataVersion: master.version,
        engineVersion: ENGINE_VERSION,
        appVersion: APP_VERSION,
        gameRegion: 'JP',
        masterDataLocale: 'ja-JP',
      }}
      onOpenCalculator={(detail) => {
        void import('./rankingHandoff').then(({ handoffRankingCalculation }) =>
          handoffRankingCalculation({
            detail,
            master,
            setCalculation,
            setCalculationSessionId,
            updateActiveProfile,
            replaceRoute,
          }),
        );
      }}
      onOpenCalculatorForAttackProfile={(target) => {
        void import('./rankingHandoff').then(({ handoffRankingAttackProfileCalculation }) =>
          handoffRankingAttackProfileCalculation({
            ...target,
            master,
            profile: { servantBuilds: profile.servantBuilds },
            setCalculation,
            setCalculationSessionId,
            updateActiveProfile,
            replaceRoute,
          }),
        );
      }}
    />
  );
}
