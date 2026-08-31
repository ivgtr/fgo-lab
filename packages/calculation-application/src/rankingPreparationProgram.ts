import type { MasterDataSnapshot, ServantMaster } from '@fgo-lab/master-data';
import type { RankingConditions, RankingProfileInput } from './rankingContracts';
import {
  applyRankingCanonicalMinimums,
  createRankingBaseScenario,
  type ResolvedScenario,
} from './rankingPolicy';
import {
  materializePreNoblePhantasmPlan,
  planPreNoblePhantasmCandidates,
} from './preNoblePhantasmPlanner';
import {
  attackProfileForTerminalState,
  createActorFormProfiles,
  type AttackProfile,
} from './attackProfile';
import {
  prepareCalculationScenario,
  projectPreparedCalculationScenario,
  rematerializePreparedCalculationInputs,
  type PreparedCalculationProjection,
  type PreparedCalculationScenario,
} from './scenario';

export interface CompiledRankingPreparationCandidate {
  canonical: ResolvedScenario;
  baseline: PreparedCalculationProjection;
  canonicalPrepared: PreparedCalculationScenario;
  attackProfile: AttackProfile;
}

const preparationPrograms = new WeakMap<
  MasterDataSnapshot,
  WeakMap<ServantMaster, Map<string, readonly CompiledRankingPreparationCandidate[]>>
>();

function preparationProgramKey(
  servant: ServantMaster,
  profile: RankingProfileInput,
  conditions: RankingConditions,
): string {
  return JSON.stringify({
    comparisonMode: conditions.comparisonMode,
    classAffinity: conditions.classAffinity,
    npLevel: conditions.npLevel,
    servantBuild: profile.servantBuilds[servant.id] ?? null,
  });
}

function cachedPrograms(
  master: MasterDataSnapshot,
  servant: ServantMaster,
): Map<string, readonly CompiledRankingPreparationCandidate[]> {
  let byServant = preparationPrograms.get(master);
  if (!byServant) {
    byServant = new WeakMap();
    preparationPrograms.set(master, byServant);
  }
  let programs = byServant.get(servant);
  if (!programs) {
    programs = new Map();
    byServant.set(servant, programs);
  }
  return programs;
}

export function compileRankingPreparationProgram(
  servant: ServantMaster,
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingConditions,
): readonly CompiledRankingPreparationCandidate[] {
  const key = preparationProgramKey(servant, profile, conditions);
  const programs = cachedPrograms(master, servant);
  const cached = programs.get(key);
  if (cached) return cached;
  const candidates = planPreNoblePhantasmCandidates(
    servant,
    master.npResourceSemantics,
    conditions.npLevel,
    1,
  ).candidates;
  const actorFormProfiles = createActorFormProfiles(
    servant,
    candidates.map(({ terminalState }) => terminalState),
  );
  const compiled = candidates.map((candidate) => {
    const initial = createRankingBaseScenario(
      servant,
      master,
      profile,
      conditions,
      candidate.terminalState.initialFormId,
    );
    const sequenced = materializePreNoblePhantasmPlan(initial, candidate);
    const baselinePrepared = prepareCalculationScenario(sequenced, master, {
      preserveScenarioOvercharge: true,
    });
    const baseline = projectPreparedCalculationScenario(baselinePrepared);
    const canonical = applyRankingCanonicalMinimums(sequenced, baseline);
    const canonicalPrepared =
      canonical === sequenced
        ? baselinePrepared
        : rematerializePreparedCalculationInputs(baselinePrepared, canonical, master);
    return {
      canonical,
      baseline,
      canonicalPrepared,
      attackProfile: attackProfileForTerminalState(
        servant,
        actorFormProfiles,
        candidate.terminalState,
      ),
    };
  });
  programs.set(key, compiled);
  return compiled;
}
