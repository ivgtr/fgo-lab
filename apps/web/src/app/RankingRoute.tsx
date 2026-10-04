'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useState } from 'react';
import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import type { LocalProfile } from '@fgo-lab/schema';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { Ranking } from '../features/ranking/Ranking';
import type { CalculationWorkspace, Page } from './App';
import type { CalculationMutationGate, UpdateActiveProfile } from './portableDraft';

export function RankingRoute({
  master,
  profile,
  setCalculation,
  setCalculationSessionId,
  updateActiveProfile,
  replaceRoute,
  calculationMutation,
}: {
  master: MasterDataSnapshot;
  profile: LocalProfile;
  setCalculation: Dispatch<SetStateAction<CalculationWorkspace>>;
  setCalculationSessionId: Dispatch<SetStateAction<string>>;
  updateActiveProfile: UpdateActiveProfile;
  replaceRoute: (page: Page) => void;
  calculationMutation: CalculationMutationGate;
}) {
  const [handoffFailure, setHandoffFailure] = useState<{
    message: string;
    recovery: 'editSavedBuild' | 'reload';
  } | null>(null);
  const comparisonChanged = useCallback(() => {
    calculationMutation.begin();
    setHandoffFailure(null);
  }, [calculationMutation]);
  return (
    <>
      {handoffFailure ? (
        <p role="alert" className="notice">
          {handoffFailure.message}{' '}
          {handoffFailure.recovery === 'editSavedBuild' ? (
            <button type="button" onClick={() => replaceRoute('servants')}>
              保存育成を編集
            </button>
          ) : (
            <button type="button" onClick={() => window.location.reload()}>
              ページを再読み込み
            </button>
          )}
        </p>
      ) : null}
      <Ranking
        onComparisonChange={comparisonChanged}
        onEditSavedBuild={() => replaceRoute('servants')}
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
          const mutationToken = calculationMutation.begin();
          setHandoffFailure(null);
          void import('./rankingHandoff')
            .then(({ handoffRankingCalculation }) =>
              handoffRankingCalculation({
                detail,
                master,
                setCalculation,
                setCalculationSessionId,
                updateActiveProfile,
                replaceRoute,
                calculationMutation,
                mutationToken,
              }),
            )
            .then((outcome) => {
              if (!calculationMutation.isCurrent(mutationToken)) return;
              if (outcome.status === 'invalid')
                setHandoffFailure({
                  message: '計算条件が無効なため、計算機を開けません。',
                  recovery: 'reload',
                });
            })
            .catch(() => {
              if (!calculationMutation.isCurrent(mutationToken)) return;
              setHandoffFailure({
                message:
                  '計算機への引継ぎに失敗しました。ページを再読み込みして保存状態を確認してください。',
                recovery: 'reload',
              });
            });
        }}
        onOpenCalculatorForAttackProfile={(target) => {
          const mutationToken = calculationMutation.begin();
          setHandoffFailure(null);
          void import('./rankingHandoff')
            .then(({ handoffRankingAttackProfileCalculation }) =>
              handoffRankingAttackProfileCalculation({
                ...target,
                master,
                profile: { servantBuilds: profile.servantBuilds },
                setCalculation,
                setCalculationSessionId,
                updateActiveProfile,
                replaceRoute,
                calculationMutation,
                mutationToken,
              }),
            )
            .then((outcome) => {
              if (!calculationMutation.isCurrent(mutationToken)) return;
              if (outcome.status === 'rejected') {
                const savedBuildFailure =
                  outcome.reason === 'servantBuildIncomplete' ||
                  outcome.reason === 'servantBuildInvalid' ||
                  outcome.reason === 'servantBuildIdentityMismatch';
                setHandoffFailure({
                  message: savedBuildFailure
                    ? '保存育成が不足または不正なため、計算機を開けません。保存育成を確認してください。'
                    : '選択した攻撃宝具を現在のデータで開けません。',
                  recovery: savedBuildFailure ? 'editSavedBuild' : 'reload',
                });
              } else if (outcome.status === 'invalid') {
                setHandoffFailure({
                  message: '選択した攻撃宝具の入力が無効なため、計算機を開けません。',
                  recovery: 'reload',
                });
              }
            })
            .catch(() => {
              if (!calculationMutation.isCurrent(mutationToken)) return;
              setHandoffFailure({
                message:
                  '計算機への引継ぎに失敗しました。ページを再読み込みして保存状態を確認してください。',
                recovery: 'reload',
              });
            });
        }}
      />
    </>
  );
}
