import { describe, expect, it } from 'vitest';
import { activeServantSkillSchema, masterSnapshotSchema } from '@fgo-lab/master-data';
import { servantBuildSchema, APP_VERSION } from '@fgo-lab/schema';
import fixture from '../../test-fixtures/master/fixture.json';
import { DEFAULT_RANKING_POLICY_CONDITIONS as defaults } from './rankingContracts';
import { applyRankingSelectionCommand, compileRankingSelection, resolveRankingBasis } from './rankingBasis';
import { compileStaticRankingPreparationPrograms } from './rankingStaticPreparation';
import { createRankingBaseScenario } from './rankingPolicy';
import { calculateRankingPolicy } from './rankingPolicyCalculation';
import { createRankingPortableRequest, currentCalculationVersionContext, executePortableCalculation } from './portableCalculation';

const source = masterSnapshotSchema.parse(fixture);
const base = source.servants[0]!;
// A new semantic fixture for command-level binding; the immutable source fixture has no active skills.
const skill = activeServantSkillSchema.parse({id:'saved-basis-skill',priority:0,name:'saved-basis-skill',detail:'',imageKey:null,resourceRequirement:null,slot:1,effects:[]});
const master = masterSnapshotSchema.parse({...source, servants:[{...base, skills:[skill], actorFormGraph:{...base.actorFormGraph, forms:base.actorFormGraph.forms.map((form)=>({...form,skillIds:[skill.id]}))}}]});
const servant = master.servants[0]!;
const single = master;
const build = servantBuildSchema.parse({ servantId: servant.id, level: 90, ascension: 4, npLevel: 1, fouAtk: 0,
  skills: Object.fromEntries(servant.skills.map(({slot}) => [String(slot), 1])), appends: {}, updatedAt: '2026-10-03T00:00:00.000Z' });
const profile = { servantBuilds: { [servant.id]: build } };
const versions = {...currentCalculationVersionContext(master),appVersion:APP_VERSION,gameRegion:'JP' as const,masterDataLocale:'ja-JP' as const};
const selection = compileRankingSelection({ ...defaults, growthBasis: 'saved', population: 'owned', levelBasis: 'ownedLevel', npLevelBasis: {kind:'owned'} });
if (selection.status !== 'valid') throw new Error(selection.detail);

describe('saved ranking growth basis', () => {
  it('binds one pinned build to scenario and every ordered source use', () => {
    const basis = resolveRankingBasis(servant, profile, selection.selection);
    expect(basis).toMatchObject({ growthBasis: 'saved', level: 90, npLevel: 1, fouAtk: 0, skillLevels: build.skills });
    expect(createRankingBaseScenario(servant, master, basis, defaults).attacker.fouAtk).toBe(0);
    const programs = compileStaticRankingPreparationPrograms(servant, basis.skillLevels);
    const commands = programs.flatMap(({commands}) => commands.filter((command) => command.kind === 'useSkillSlot'));
    expect(commands.length).toBeGreaterThan(0);
    expect(commands.every((command) => command.skillLevel === 1)).toBe(true);
    expect(programs.flatMap(({sourceUses})=>sourceUses).filter((source)=>source.kind==='skill').every((source)=>source.skillLevel===1)).toBe(true);
  });
  it('preserves common fou and skills when using owned level and NP choices', () => {
    const common = compileRankingSelection({...selection.selection, growthBasis:'common'});
    if (common.status !== 'valid') throw new Error(common.detail);
    expect(resolveRankingBasis(servant, profile, common.selection)).toMatchObject({level:90, npLevel:1, fouAtk:1000});
    expect(Object.values(resolveRankingBasis(servant, profile, common.selection).skillLevels).every((level)=>level===10)).toBe(true);
  });
  it('refuses absent skills without manufacturing level 1, and refuses contradictory saved selections', () => {
    const broken = {servantBuilds:{[servant.id]:{...build, skills:{}}}};
    const result = calculateRankingPolicy(single, broken, selection.selection, versions);
    expect(result.rows).toHaveLength(0);
    expect(result.exclusions.length).toBeGreaterThan(0);
    expect(result.exclusions.every((entry)=>entry.reason==='rankingBuildIncomplete' && entry.recovery.kind==='editSavedBuild')).toBe(true);
    expect(compileRankingSelection({...selection.selection, population:'all'}).status).toBe('invalid');
    expect(compileRankingSelection({...selection.selection, levelBasis:'naturalLimit'}).status).toBe('invalid');
    expect(compileRankingSelection({...selection.selection, npLevelBasis:{kind:'specified',npLevel:1}}).status).toBe('invalid');
    expect(applyRankingSelectionCommand(defaults,{kind:'setGrowthBasis',value:'saved'}).status).toBe('invalid');
  });
  it('replays pinned values after a saved build changes', () => {
    const ranking = calculateRankingPolicy(single, profile, selection.selection, versions);
    const calculated = Object.values(ranking.profileResults).find((entry)=>entry.status==='calculated');
    expect(calculated?.status).toBe('calculated');
    if (calculated?.status !== 'calculated') throw new Error(JSON.stringify(ranking.exclusions));
    const request = createRankingPortableRequest(calculated.detail, currentCalculationVersionContext(master));
    const before = executePortableCalculation(request, master);
    const changed = {...build, fouAtk:2000, skills:Object.fromEntries(servant.skills.map(({slot})=>[String(slot),10]))};
    calculateRankingPolicy(single,{servantBuilds:{[servant.id]:changed}},selection.selection,versions);
    const after = executePortableCalculation(request, master);
    expect(after).toEqual(before);
    expect(after.status).toBe('executed');
  });
});
