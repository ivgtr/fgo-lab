---
title: "Damage effect execution 構造監査・責務収束計画"
status: "Implementation planned"
created_at: "2026-08-26"
baseline_head: "8730c91"
---

# 1. 目的

E3.4後の計算意味論を変えず、damage effect executionの所有責務、依存方向、テスト目的を明確にする。ファイル行数やpackage数は評価指標にせず、master正規化からdamage inputまでの各判断が一箇所だけに存在することを完了条件とする。

このフェーズでは画面構成、入力項目、操作順、共有・保存形式、damage値、unsupported判定を意図的に変更しない。新package、canonical IR、scenario schemaも追加・変更しない。

# 2. 変更前baseline

対象HEADは`8730c91`、worktreeはcleanである。production masterは469騎、攻撃宝具scenarioは420件である。

| 指標 | 変更前 |
|---|---:|
| 既定unsupported | 12騎 |
| 選択時unsupported | 14騎 / 25 occurrence |
| user projection | 1,534 |
| automatic visible projection | 443 |
| hidden projection | 687 |
| inert user projection | 0 |
| canonical fact-condition conflict | 250組 / 68効果 / 52騎 |
| conflict中にappliedとなるoperation | 0 |
| attacker-skill context mutation | raw 30 / NP projection 24 / 到達可能15 |
| hidden mutationの未選択commit | 0 |

代表契約はDanteの既定NP1平均`32,208.975`、対天または対地選択時`45,629.59`、`powerMod 0.5`、Garethの陽射し選択時`attackBuff 0.3`、水着武則天の`targetState:undead`付与、アーキタイプ：アースの`milleniumCastle`付与、玉兎のArts形態`npDamageBuff 0.2`とBuster形態`attackBuff 0.3 / npDamageBuff 0.5`で固定する。

変更前production buildは171 modules、main bundleは453.98 kB（gzip 130.50 kB）、ranking workerは94.39 kBである。計算benchmarkは330.67 ops/s、mean 3.0241 msだった。benchmarkは環境揺らぎを含むため、意味論非変更の判定にはproduction契約とdamage inputを優先する。

# 3. 監査結果

## P0

今回の静的監査と変更前production ratchetでは、新しい誤計算またはfail-openを確認していない。これは未発見を保証するものではないため、既存のconstraint、unsupported、context mutation ratchetを変更後も全件実行する。

## P1

### P1-1 operation lifecycleの破壊的な組立

`packages/battle-execution/src/engine.ts`がsource収集、condition compile、operation compile、activation link、順序確定、constraint検証、state transition、projection、damage input foldを所有している。さらに`linkAttackerSkillMutations`とorder再採番がcompile済みoperationを破壊的に変更する。

この構造では、compile結果、activation計画、実行順を独立契約として検査できず、choiceやcontext mutationの追加時に後段の書換えを見落としやすい。activation planningはpure transform、ordered executionは確定済みoperationのconsumerへ変更する。

### P1-2 effect decisionとsupport保存参照の二重更新

`packages/calculation-application/src/effectDecision.ts`がeffect decision / world fact更新を所有する一方、`apps/web/src/features/calculator/Calculator.tsx`だけがsupportの`selectedEffects`を同期する。Webがexecutor条件を再解釈してはいないが、一操作の永続的意味をapplicationとWebが分担している。

supportを含むprojection commandをapplication facadeへ集約し、Webはprojection、active、scenarioを渡すだけにする。support保存形式は変更しない。

### P1-3 Atlas正規化とartifact運用の同居

`packages/data-pipeline/src/index.ts`がchecksum、manifest、published artifact検証、raw Atlas型、damage function正規化、condition/parameter/choice/trigger分類、全snapshot組立を同居させる。raw parameter semanticsのcanonical owner自体は一つだが、配布処理と意味論変更の差分範囲が重なり、normalizerのレビュー境界が不明瞭である。

artifact管理、Atlas raw contract、effect/damage正規化、snapshot assemblyを同一package内の一方向moduleへ分ける。

## P2

### P2-1 public APIとinternal APIの混在

`packages/battle-execution/src/index.ts`はdomain contractとruntime関数のbarrelを兼ね、`engine.ts`からre-exportした判定関数までpublicにする。契約型を`contracts.ts`へ移し、package rootはapplicationが必要なexecutor API、projection型、canonical trait semanticsだけを明示的に公開する。solver/compiler/activationの内部関数はpackage内testから直接検証する。

### P2-2 Calculatorのscenario commandとrenderの同居

`Calculator.tsx`は表示だけでなくmanual/resolved切替、attack/CE/support編集、decision適用、dialog focusを持つ。DOM分割だけでは改善にならないため、scenarioを純粋変換するcommandを所有責務別moduleへ抽出し、componentはイベントと描画を担当する。表示上のsection分割は現状componentを維持する。

### P2-3 production auditの目的混在

`productionMasterAudit.test.ts`はproduction inventory、semantic family、代表scenario、constraint交差、hidden mutation reachabilityを一つのsuiteに集約し、master読込とVersionContextを繰り返す。失敗時にどの契約が壊れたか判別しづらく、同じ全master計算を複数回行う。

共有fixtureをtest supportへ限定して抽出し、inventory、constraint、context mutation、代表scenarioにsuiteを分ける。期待件数は一つのbaseline objectへ固定し、テストからproduction runtimeへ依存を逆流させない。

## P3

- `NON_DAMAGE`、`POSSIBLY_DAMAGE`等のrouting語彙をcompile責務へ寄せる。
- warning文字列はapplicationで表示用へ変換するが、計算判定には使わない現行契約を維持する。
- `engine.ts`、`data-pipeline/index.ts`、`Calculator.tsx`が長いこと自体は指摘理由にしない。上記の所有責務境界に対応する部分だけを移す。

# 4. 目標構造と依存方向

```text
data-pipeline
  atlasContract
    -> effectNormalization
      -> snapshotNormalization
        -> artifact

battle-execution
  contracts + conditionSemantics
    -> condition / constraints
    -> effectRouting
    -> sourceCollection
      -> operationCompiler
        -> activationPlan (pure)
          -> orderedExecution
            -> projection + damageInputFold

calculation-application
  scenarioInput
    -> battle-execution public executor
      -> calculation result/evidence
  effectCommand (effect decision + support saved reference)

web
  Calculator event/render
    -> calculation-application command/view model
```

依存は左または上流から右または下流への一方向とする。operation compilerはstateを変更せず、activation plannerはmasterやscenario schemaを再解釈せず、executorはraw Atlas parameter名を知らず、projectionはUI componentを知らない。Webはcondition、choice、trait constraintを解釈しない。

# 5. Module ownership

## battle-execution

- `contracts.ts`: ConditionExpression、BattleOperation、BattleState、OperationResult、EffectProjection等のdomain contract。
- `effectRouting.ts`: normalized MasterEffectからdamage関連routeとrecipientを決める唯一の場所。
- `sourceCollection.ts`: scenarioとmasterから順序付きsource occurrenceを収集する。意味論compileはしない。
- `operationCompiler.ts`: source occurrenceをConditionExpressionとBattleOperationへcompileする。stateを読まない。
- `activation.ts`: immutableなoperation列からlinked activationを計画し、decisionから有効性を解決する。
- `constraints.ts`: fixed factとsatisfiable expressionを検証するcanonical solver。UI projectionを知らない。
- `state.ts`: initial state、candidate clone、world fact適用、trait count、damage input fold。
- `projection.ts`: operation outcomeからEffectProjectionを生成する。UI文言による逆判定を許さない。
- `engine.ts`: 上記を順に接続し、transactional executionとtraceを返すorchestrator。

## data-pipeline

- `artifact.ts`: sha256、manifest生成、version identity、published artifact検証。
- `atlasContract.ts`: 入力raw shapeだけを表現するinternal contract。
- `effectNormalization.ts`: raw Function/buff/parameter/conditionをcanonical MasterEffect / damage IRへ変換する唯一の場所。
- `snapshotNormalization.ts`: servant、CE、mystic code、itemを組み立て、schemaで検証する。
- `index.ts`: CLIと外部利用向けの明示的exportだけを持つ。

## calculation-application / web

- applicationのeffect commandがscenario decisionとsupport保存参照をatomicに更新する。
- Calculatorはscenario commandを呼び、結果projectionを描画する。effect sourceの意味論は持たない。
- UI-onlyなdialog状態、focus、summary文言はWebに残す。

# 6. Test structure

- pure algorithm: condition、constraint、activation、routing、normalizationをmodule単位で検証する。
- executor contract: scenario -> ordered operation outcome/state -> final damage inputを検証する。
- production inventory: family、件数、projection分類、unsupportedをratchetする。
- production behavior: Gareth、Dante、Tezcatlipoca、アーキタイプ：アース、水着武則天、玉兎、水着リリスを実masterで検証する。
- property/golden: evaluator/solver整合とdamage kernel境界を維持する。
- UI E2E: PC/mobile、共有・保存・復元、表示buttonとoutcomeの一致だけを検証し、executor内部関数を再現しない。

# 7. 実装順序とfail-closed条件

1. contractとrouting/source/compile/activationを分離し、compileされたoperationとprojectionの全production inventoryを不変にする。
2. state/projection/foldを分離し、operation trace、final damage input、damage rowsを不変にする。
3. data pipelineをmechanicalに分割し、normalized master goldenとpublished artifact hashを不変にする。
4. application effect commandへsupport参照同期を移し、scenario/share round-tripを不変にする。
5. production auditを目的別に分け、前後inventoryを同じ期待値で検証する。

分割中に未知condition、operation、raw parameterが見つかった場合は既存のtyped unsupportedを維持する。値やunsupported判定の変更が必要なら、このフェーズでは実装せず利用者確認へ戻す。

# 8. 完了条件

- package追加、scenario schema変更、UI入力変更なし。
- raw Atlas semanticsはdata-pipeline、condition/operation/state semanticsはbattle-execution、scenario commandはcalculation-applicationに一意に所有される。
- compileとactivation planningが入力配列を変更しない。
- Webにsupport effect decisionの個別同期ロジックが残らない。
- 変更前baselineのinventory、代表damage input、damage値、goldenが一致する。
- bundleとbenchmarkの変動を記録し、意味論または依存境界に説明できない退行を残さない。
- 全品質ゲートが成功する。
