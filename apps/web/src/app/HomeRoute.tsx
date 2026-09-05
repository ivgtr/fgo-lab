'use client';

import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import type { LocalProfile } from '@fgo-lab/schema';
import {
  createDefaultCalculatorPortableRequest,
  executePortableCalculation,
  recoverPortableCalculation,
} from '@fgo-lab/calculation-application';
import { Home } from '../features/home/Home';
import type { CalculationWorkspace, Page } from './App';

export function homeDamageHeadline(
  result: CalculationWorkspace['storedResult'] | undefined,
  npLevel: number,
): number | null {
  return result?.status === 'calculated' ? (result.rows[npLevel - 1]?.average ?? null) : null;
}

export function HomeRoute({
  master,
  profile,
  calculation,
  navigate,
}: {
  master: MasterDataSnapshot;
  profile: LocalProfile;
  calculation: CalculationWorkspace;
  navigate: (page: Page) => Promise<void>;
}) {
  const defaultServant = master.servants[0]!;
  const currentRequest =
    calculation.request ??
    createDefaultCalculatorPortableRequest(
      master,
      profile.servantBuilds[defaultServant.id],
      defaultServant,
    );
  const currentScenario = currentRequest.scenario;
  const outcome = calculation.storedResult
    ? recoverPortableCalculation(currentRequest, calculation.storedResult, master)
    : executePortableCalculation(currentRequest, master);
  const execution =
    outcome.status === 'executed' || outcome.status === 'unsupported' ? outcome.execution : null;
  const input = execution?.status === 'executable' ? execution.input : null;
  const selectedAttackerId =
    input?.attackerId ??
    (currentScenario.mode === 'resolved' ? currentScenario.attacker.servantId : defaultServant.id);
  const selectedAttacker =
    master.servants.find(({ id }) => id === selectedAttackerId) ?? defaultServant;
  const selectedBuild = profile.servantBuilds[selectedAttacker.id];
  const result = outcome.status === 'historicalOnly' ? outcome.result : execution?.result;

  return (
    <Home
      result={homeDamageHeadline(
        result,
        input?.npLevel ??
          (currentScenario.mode === 'resolved' ? currentScenario.attacker.npLevel : 1),
      )}
      attackerName={selectedAttacker.name}
      attackerImage={selectedAttacker.imageKey}
      owned={selectedBuild?.npLevel ? 1 : 0}
      hasHistory={profile.history.length > 0}
      onNavigate={(page) => void navigate(page)}
    />
  );
}
