import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import {
  formatCanonicalAuditMismatch,
  measureProductionAuditLifecycle,
  type CanonicalAuditRecord,
} from '@fgo-lab/master-data/production-audit';
import { describe, expect, it } from 'vitest';
import { compileDataPipelineProductionAudit } from './productionAudit';

const root = resolve(import.meta.dirname, '../../..');

describe('shared data-pipeline production audit', () => {
  it('loads, parses, and compiles the complete canonical inventory once', async () => {
    const measured = await measureProductionAuditLifecycle({
      read: () => readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8'),
      parse: (content) => masterSnapshotSchema.parse(JSON.parse(content)),
      compile: compileDataPipelineProductionAudit,
    });
    const { audit } = measured;
    const actual: CanonicalAuditRecord[] = [
      { identity: 'manifest', value: { digest: audit.digest, inventory: audit.inventory } },
    ];
    const expected: CanonicalAuditRecord[] = [
      {
        identity: 'manifest',
        value: {
          digest: '736778a8337a5f515e240897430b320fe4e9ed432ec8faa8ec88e073f8eb0b26',
          inventory: {
            hpGrowth: {
              servantCells: 56250,
              craftEssenceCells: 213176,
              zeroCraftEssenceCells: 70536,
            },
            servants: 469,
            craftEssences: 2700,
            mysticCodes: 28,
            effects: 13875,
            oc: {
              grantOcBoost: 97,
              grantOcApplicationRate: 29,
              removeOcState: 75,
              ocStateNonIntersection: 131,
              ocRemovalResistance: 60,
              grantCells: 868,
              resistanceCells: 514,
              rawGrantCells: 866,
              rawResistanceCells: 513,
              unchangedLimitBreakCells: 3,
              hpRateEffects: 1,
              hpRateCells: 25,
              boostOrigins: {
                constant: 54,
                active: 43,
              },
              nonIntersectionProofs: {
                stateSelector: 32,
                enemyRecipient: 99,
              },
            },
            resources: {
              mutations: {
                npGauge: 731,
                hp: 179,
                criticalStars: 255,
                battlePoint: 1,
              },
              triggerOperations: {
                '["commandCardAttack","unsupported",null]': 23,
                '["commandCard","stateMutation",null]': 15,
                '["commandCard","damageModifier",null]': 2,
              },
              unsupported: {
                '["addStateShort","operationSemantics","commandCardAttack",true]': 23,
                '["replaceMember","partyCompositionMutation",null,true]': 3,
                '["gainNpBuffIndividualSum","dependentResourceAmount",null,true]': 2,
                '["gainNpTargetSum","dependentResourceAmount",null,true]': 3,
                '["addState","contextReference",null,false]': 25,
                '["gainNpFromTargets","dependentResourceAmount",null,true]': 3,
                '["gainHpFromTargets","dependentResourceAmount",null,true]': 3,
                '["gainNpIndividualSum","dependentResourceAmount",null,true]': 3,
                '["addState","operationSemantics",null,true]': 1,
                '["moveToLastSubmember","partyCompositionMutation",null,true]': 1,
                '["gainNp","unresolvedTarget",null,true]': 2,
              },
              dependentCells: {
                '["gainNpFromTargets","delayNpturn","enemyAll",["Rate","Value","Value2"]]': 20,
                '["gainHpFromTargets","lossHpSafe","enemy",["Rate","Value"]]': 10,
                '["gainHpFromTargets","lossHpSafe","enemyOneNoTargetNoAction",["Rate","Value"]]': 10,
                '["gainNpFromTargets","lossNp","ptOther",["Rate","Value"]]': 10,
                '["gainHpFromTargets","lossHpSafe","enemyAll",["Rate","Value"]]': 10,
              },
              countScopeCells: {
                '["gainNpTargetSum",4]': 20,
                '["gainNpTargetSum",3]': 10,
                '["gainNpIndividualSum",2]': 20,
                '["gainNpIndividualSum",3]': 10,
              },
              hpLossCells: {
                lossHpSafe: 245,
                lossHp: 275,
                lossHpPerSafe: 10,
              },
              hpMutationContracts: {
                '["gainHp","gain","fixed",null]': 1930,
                '["lossHpSafe","loss","fixed","oneIfAlive"]': 245,
                '["lossHp","loss","fixed","zero"]': 275,
                '["lossHpPerSafe","loss","percent","oneIfAlive"]': 10,
                '["gainHpPer","gain","percent",null]': 50,
              },
              hpBuffEffects: {
                regainHp: 88,
                upGainHp: 56,
                addMaxhp: 34,
                reduceHp: 150,
                subMaxhp: 4,
                upGivegainHp: 5,
                upFuncHpReduce: 38,
                reactiveDamageGainHp: 1,
                hpReduceToRegain: 2,
                downGainHp: 8,
                subFuncHpReduce: 1,
              },
              hpBuffCells: {
                '["regainHp","addStateShort","ptFull",null,null,["Count","OnField","Rate","Turn","Value"]]': 5,
                '["upGainHp","addState","ptFull",null,null,["Count","OnField","Rate","Turn","Value"]]': 10,
                '["addMaxhp","addState","ptFull",null,null,["Count","OnField","Rate","Turn","Value"]]': 1,
                '["reduceHp","addStateShort","ptFull",null,null,["Count","OnField","Rate","Turn","Value"]]': 1,
                '["regainHp","addStateShort","self",null,null,["Count","Rate","Turn","Value"]]': 301,
                '["subMaxhp","addState","ptOtherFull",null,null,["Count","OnField","Rate","Turn","Value"]]': 2,
                '["addMaxhp","addState","self",null,null,["Count","OnField","Rate","Turn","Value"]]': 1,
                '["upGainHp","addState","ptOtherFull",null,null,["Count","OnField","Rate","Turn","Value"]]': 1,
                '["reduceHp","addStateShort","self",null,null,["Count","Rate","Turn","Value"]]': 89,
                '["upGivegainHp","addState","self",null,null,["Count","Rate","Turn","Value"]]': 17,
                '["upGainHp","addState","self",null,null,["Count","Rate","Turn","Value"]]': 133,
                '["regainHp","addStateShort","self",null,null,["Count","Rate","Turn","UseRate","Value"]]': 2,
                '["addMaxhp","addState","self",null,null,["Count","ParamAdd","ParamMax","Rate","Turn","Value"]]': 2,
                '["addMaxhp","addState","ptFull",null,null,["Count","Rate","Turn","Value"]]': 2,
                '["addMaxhp","addState","ptOne",null,null,["Count","Rate","Turn","Value"]]': 60,
                '["regainHp","addStateShort","ptOne",null,null,["Count","Rate","Turn","Value"]]': 50,
                '["upFuncHpReduce","addState","enemyAll",null,"afterDamage",["Count","Rate","Turn","Value"]]': 375,
                '["reduceHp","addState","enemyAll",null,"afterDamage",["Count","Rate","Turn","Value"]]': 1350,
                '["reduceHp","addState","enemyAll",null,null,["Count","Rate","Turn","Value"]]': 220,
                '["reduceHp","addState","enemyAll",null,"beforeDamage",["Count","Rate","Turn","Value"]]': 50,
                '["regainHp","addStateShort","self",null,"afterDamage",["Count","Rate","Turn","Value"]]': 75,
                '["addMaxhp","addState","ptAll",null,null,["Count","Rate","Turn","Value"]]': 70,
                '["reduceHp","addState","enemy",null,"afterDamage",["Count","Rate","Turn","Value"]]': 950,
                '["upFuncHpReduce","addState","enemy",null,"afterDamage",["Count","Rate","Turn","Value"]]': 300,
                '["upGainHp","addState","ptAll",null,null,["Count","Rate","Turn","Value"]]': 30,
                '["reduceHp","addStateShort","self",null,null,["AddIndividualty","AddIndividualtyList","AddLinkageTargetIndividualty","Count","Rate","Turn","Value"]]': 40,
                '["addMaxhp","addState","self",null,"afterDamage",["Count","Rate","Turn","Value"]]': 75,
                '["regainHp","addStateShort","ptAll",null,"afterDamage",["Count","Rate","Turn","Value"]]': 200,
                '["reactiveDamageGainHp","addState","self",null,null,["Count","ExecuteEffectId","Rate","Turn","Value"]]': 10,
                '["reduceHp","addStateShort","self",null,"beforeDamage",["Count","Rate","Turn","Value"]]': 25,
                '["regainHp","addStateShort","ptAll",null,null,["Count","Rate","Turn","Value"]]': 100,
                '["upFuncHpReduce","addState","enemyAll",null,"beforeDamage",["Count","Rate","Turn","Value"]]': 25,
                '["reduceHp","addStateShort","self",null,"afterDamage",["Count","Rate","Turn","Value"]]': 25,
                '["hpReduceToRegain","addStateShort","ptAll",null,"afterDamage",["Count","HpReduceToRegainIndiv","Rate","Turn"]]': 25,
                '["reduceHp","addStateShort","ptAll",null,null,["Count","Rate","Turn","Value"]]': 40,
                '["addMaxhp","addState","self",null,null,["Count","Rate","Turn","Value"]]': 80,
                '["subMaxhp","addState","self",null,null,["Count","Rate","Turn","Value"]]': 10,
                '["upFuncHpReduce","addState","self",null,null,["Count","Rate","Turn","Value"]]': 10,
                '["upFuncHpReduce","addState","enemy",null,"beforeDamage",["Count","Rate","Turn","Value"]]': 50,
                '["reduceHp","addState","enemy",null,"beforeDamage",["Count","Rate","Turn","Value"]]': 125,
                '["upFuncHpReduce","addState","enemyAll",null,null,["Count","Rate","Turn","Value"]]': 60,
                '["addMaxhp","addState","ptAll",null,"afterDamage",["Count","Rate","Turn","Value"]]': 100,
                '["regainHp","addStateShort","self",null,"beforeDamage",["Count","Rate","Turn","Value"]]': 25,
                '["regainHp","addStateShort","ptAll",null,null,["Count","Rate","ShowQuestNoEffect","Turn","Value"]]': 10,
                '["reduceHp","addState","enemy",null,null,["Count","Rate","Turn","Value"]]': 40,
                '["upGainHp","addState","ptAll",null,"afterDamage",["Count","Rate","Turn","Value"]]': 50,
                '["downGainHp","addState","enemyAll",null,null,["Count","Rate","Turn","Value"]]': 60,
                '["regainHp","addStateShort","ptOther",null,null,["Count","Rate","Turn","Value"]]': 10,
                '["upGainHp","addState","ptOne",null,null,["Count","Rate","Turn","Value"]]': 10,
                '["downGainHp","addState","enemy",null,"afterDamage",["Count","Rate","Turn","Value"]]': 25,
                '["subFuncHpReduce","addState","self",null,null,["Count","Rate","Turn","Value"]]': 10,
                '["downGainHp","addState","enemyAll",null,"afterDamage",["Count","Rate","Turn","Value"]]': 25,
                '["upFuncHpReduce","addState","enemy",null,null,["Count","Rate","Turn","Value"]]': 10,
                '["subMaxhp","addState","ptOne",null,null,["Count","Rate","Turn","Value"]]': 10,
                '["hpReduceToRegain","addStateShort","self",null,null,["Count","HpReduceToRegainIndiv","Rate","Turn"]]': 10,
                '["addMaxhp","addState","ptSelfAnotherFirst",null,"afterDamage",["Count","Rate","Turn","Value"]]': 25,
                '["reduceHp","addStateShort","self",null,"beforeDamage",["AddIndividualty","AddIndividualtyList","AddLinkageTargetIndividualty","Count","Rate","Turn","Value"]]': 25,
                '["addMaxhp","addState","ptAll",null,null,["ActSet","Count","Rate","TriggeredTargetBattlePointRateRange","Turn","Value"]]': 10,
              },
              battlePointWrites: {
                '["addBattlePoint",3300200,10]': 1,
                '["addBattlePoint",3300200,5]': 20,
                '["subBattlePoint",705300,2]': 10,
                '["addBattlePoint",705300,2]': 10,
                '["addBattlePoint",705300,12]': 10,
              },
              battlePointCapacityCells: {
                '[705300,4,"afterDamage"]': 25,
              },
              battlePointConditionCells: {
                '["CheckBattlePointPhaseRange",[{"battlePointId":3300200,"range":["7<="]}]]': 100,
                '["CheckBattlePointPhaseRange",[{"battlePointId":3300200,"range":["10<="]}]]': 100,
                '["CheckBattlePointPhaseRange",[{"battlePointId":3300200,"range":["4<="]}]]': 50,
                '["TriggeredTargetBattlePointRateRange",[{"battlePointId":705300,"range":["1<="]}]]': 10,
                '["TriggeredTargetBattlePointRateRange",[{"battlePointId":705300,"range":["<=999"]}]]': 120,
                '["CheckBattlePointPhaseRange",[{"battlePointId":705300,"range":["<=1"]}]]': 10,
              },
              battlePointMissingAmounts: 10,
            },
            operations: 14775,
            damageFunctions: 630,
            noblePhantasmVariantIdentities: 706,
            rawFunctionTypes: 54,
            rawBuffTypes: 133,
            rawParameterKeys: 124,
            rawPlayerChoiceOccurrences: 88,
            probabilisticOccurrences: 49,
            playerChoiceSelections: 88,
            stochasticOutcomeSelections: 49,
            binaryOutcomeSelections: 44,
            successCountOutcomeSelections: 5,
          },
        },
      },
    ];
    const artifactDirectory = process.env['FGO_TEST_ARTIFACT_DIR'];
    if (artifactDirectory)
      await writeFile(
        resolve(artifactDirectory, 'production-audit-data-pipeline.json'),
        `${JSON.stringify(
          {
            ...audit,
            runtimeCounters: { ...measured.runtimeCounters, ...audit.counters },
            timings: measured.timings,
          },
          null,
          2,
        )}\n`,
      );
    expect(audit.failures).toHaveLength(6);
    expect(actual, formatCanonicalAuditMismatch(expected, actual)).toEqual(expected);
  }, 120_000);
});
