---
title: "Damage effect execution 構造監査・責務収束計画"
status: "Canonical execution IR migration complete"
created_at: "2026-08-26"
baseline_head: "8730c91"
---

# 1. 目的

E3.4後の計算意味論を変えず、damage effect executionの所有責務、依存方向、テスト目的を明確にする。ファイル行数やpackage数は評価指標にせず、master正規化からdamage inputまでの各判断が一箇所だけに存在することを完了条件とする。

このフェーズでは画面構成、入力項目、操作順、共有・保存形式、damage値、unsupported判定を意図的に変更しない。新packageとscenario schemaは追加・変更しない。構造分割後の監査でexecutorに残存していたAtlas固有語彙を除去するため、MasterEffectのcanonical execution IRは破壊的に更新する。

# 1.1 Canonical execution IR移行

構造分割後もbattle-executionが`parameterSets.Value`、raw buff type、raw target文字列を解釈していた。この状態では、同じ`Value`がmodifier、field trait ID、recipient trait ID、非damage値のどれであるかをruntimeがAtlas語彙から再判定するため、正規化責務が二重化する。

data-pipelineをAtlas固有語彙の唯一の解釈箇所とし、MasterEffectは次の用途別operation列を保持する。

- damage modifier: modifier kind、sign、target policy、card scope、level／OC／limit break別value、optional value expression
- modifier rate change
- ignore defense／damage cut
- card type mutation
- context mutation: field／recipient traitをtyped traitとして保持し、modifier valueとは分離
- non-damage
- unresolved semantics: runtimeが推測せずtyped unsupportedへ落とす候補

raw parameter、buff、target、Function情報はproduction inventoryと出典確認のためのevidenceへ隔離する。canonical operationとのfallbackや二重実装は作らない。effectはcontext mutationとdamage modifier等を同時に持ち得るため、単一分類ではなく順序付きoperation列とする。

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

### P1-0 Atlas execution semanticsの二重所有

`effectNormalization.ts`がparameter意味を一部正規化する一方、`effectRouting.ts`と`sourceCollection.ts`がraw buff、target、`Value`を再解釈している。特にproductionの`Value`保有effect 10,432件は、現行分類でmodifier 3,733件、modifier-rate 1件、context trait ID 73件、その他の非damage値 6,625件であり、汎用value seriesへ統合できない。

MasterEffectへtyped execution semanticsを追加し、data-pipelineだけがraw occurrenceからcanonical operationを生成する。executorはcanonical target policyをoriginと組み合わせてrecipientを解決するが、Atlas文字列を知らない。

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
    -> canonicalTargetPolicy
    -> sourceCollection (canonical value selection only)
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
- `effectRouting.ts`: canonical target policyをsource originに対して解決する。buff名やtarget文字列は扱わない。
- `sourceCollection.ts`: scenarioとmasterから順序付きsource occurrenceを収集し、typed operationのlevel／OC／limit break valueを選択する。raw parameterは扱わない。
- `operationCompiler.ts`: typed execution semanticsをConditionExpressionとBattleOperationへcompileする。stateとAtlas語彙を読まない。
- `activation.ts`: immutableなoperation列からlinked activationを計画し、decisionから有効性を解決する。
- `constraints.ts`: fixed factとsatisfiable expressionを検証するcanonical solver。UI projectionを知らない。
- `state.ts`: initial state、candidate clone、world fact適用、trait count、damage input fold。
- `projection.ts`: operation outcomeからEffectProjectionを生成する。UI文言による逆判定を許さない。
- `engine.ts`: 上記を順に接続し、transactional executionとtraceを返すorchestrator。

## data-pipeline

- `artifact.ts`: sha256、manifest生成、version identity、published artifact検証。
- `atlasContract.ts`: 入力raw shapeだけを表現するinternal contract。
- `effectNormalization.ts`: raw Function/buff/target/parameter/conditionをcanonical MasterEffect / damage IRへ変換する唯一の場所。modifier、context mutation、non-damage、unresolvedの用途を確定する。
- `atlasEvidence`: raw occurrenceのparameter、buff、target、Functionを監査用に保持する。runtime execution APIから値を選択しない。
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

1. raw occurrenceと10,432件の`Value`用途別inventoryを固定する。
2. MasterEffectへtyped execution semanticsとevidence境界を定義する。
3. data-pipelineでraw Function/buff/target/parameterをcanonical operationへ一度だけ変換する。
4. executorの`parameterSets`、raw buff、raw target、raw routing tableを削除する。
5. master schema、artifact、engine versionを更新し、旧artifactを現行schemaで拒否する。
6. 全production occurrenceについて従来operation、projection、unsupported、damage input、damage値とのparityを検証する。

分割中に未知condition、operation、raw parameterが見つかった場合は既存のtyped unsupportedを維持する。値やunsupported判定の変更が必要なら、このフェーズでは実装せず利用者確認へ戻す。

# 8. 完了条件

- package追加、scenario/share schema変更、UI入力変更なし。
- battle-execution内の`parameterSets`、`['Value']`、Atlas buff名、Atlas target文字列参照が0件である。
- 10,432件の`Value`保有effectが用途別typed semanticsへ分類され、modifier以外の値がmodifier seriesへ混入しない。
- raw occurrenceとcanonical operationの対応件数がproduction ratchetで固定される。
- 旧master artifactはschema不一致として拒否され、互換fallbackが存在しない。
- raw Atlas semanticsはdata-pipeline、condition/operation/state semanticsはbattle-execution、scenario commandはcalculation-applicationに一意に所有される。
- compileとactivation planningが入力配列を変更しない。
- Webにsupport effect decisionの個別同期ロジックが残らない。
- 変更前baselineのinventory、代表damage input、damage値、goldenが一致する。
- bundleとbenchmarkの変動を記録し、意味論または依存境界に説明できない退行を残さない。
- 全品質ゲートが成功する。

# 9. 実装結果

2026-08-26にmaster schema 21、artifact `2026-08-26-atlas-jp-calculator-v36`、engine 12.13.0へ一方向更新した。scenario schema、共有形式、保存形式、frontend入力は変更していない。旧artifactはschema不一致で拒否し、互換adapterは設けていない。

production 13,314 effect occurrenceを13,314 canonical operationへ正規化した。内訳はdamage modifier 3,733、modifier rate change 1、ignore defense 35、ignore damage cut 1、card type mutation 12、context mutation 55、non-damage 9,417、unresolved 60である。unresolvedのうち25件は、modifierではないrecipient trait参照を`contextReference / damageRelevant: false`として明示したもので、値をmodifier seriesへ移さず現行runtime結果も変更しない。

`Value`保有10,432 effectはmodifier 3,733、modifier rate 1、context trait ID 73、その他non-damage 6,625へ用途分類した。valued canonical operation 3,734件はlevel／OC／limit break別の全値が移行前の実行値と一致する。battle-execution内の`parameterSets`、`['Value']`、raw buff名、raw target名、`parameter()`、raw routing table参照は0件である。

移行前HEADと、既定420 scenarioおよびuser projection単独選択1,534件の合計1,954ケースを比較した。version/evidence metadataだけを除外し、scenario input、final damage input、projection、operation outcome/trace、NP1〜5 damage rowが全件一致した。双方のdigestは`825dcf95b265e585cce9343ed6d4b7a180f531794ca3f0e173516220c5d0bc3a`である。

production inventoryは既定unsupported 12騎、選択時unsupported 14騎25 occurrence、user projection 1,534、automatic visible 443、hidden 687、inert user 0を維持した。constraint conflict中のapplied operationとhidden mutationの未選択commitは0、到達可能hidden mutationは15である。

production buildは178 modules、main 453.62 kB（gzip 130.29 kB）、ranking worker 95.53 kBとなった。構造監査前baseline比でmainは同等、workerはtyped master schemaの追加により1.14 kB増加した。計算benchmarkは418.88 ops/s、mean 2.3873 msであり、環境揺らぎを考慮しても意味論上の退行は確認していない。

# 10. Follow-up fail-closed contract

レビューで、限界突破礼装のcanonical値が通常値へfallbackする経路と、複数の非context operationの先頭だけをcompileする経路を確認した。現行productionでは前者の不一致と複数operation effectは存在せず実測差分はないが、将来artifactで誤値を正常計算として通し得るためE3.6で閉鎖する。

限界突破skillが存在する場合、通常／限界突破effectはoccurrence identityと値以外のcanonical semanticsで完全照合する。executorは一effectの全operationをcanonical順にcompileし、一部だけ成功させない。1,954ケースparityは固定digestを再計算するtestへ移し、移行結果を再現可能にする。

production raw監査の結果、MLB skill保有898礼装中8礼装にはMLB-only effectが存在した。5件はNP damageへ直接作用し、3件は現行NP計算外である。したがって「通常／MLB集合は常に同一」という制約は採用せず、shared occurrenceの厳密照合とMLB-only occurrenceのtyped availabilityを分ける。承認済みのdamage修正として実装し、5件はLB0／LB4のdamage inputとNP1〜5、残り3件はartifact availabilityをproduction ratchetへ固定する。

E3.6では`craftEssenceNormalization.ts`がshared／MLB-only分類、semantic identity、MLB値統合を所有し、`snapshotNormalization.ts`はskill選択とsnapshot組立だけを担当する。`sourceCollection.ts`はcanonical availabilityだけでLB0〜3／LB4を解決し、Atlasのlimit countを知らない。`operationCompiler.ts`は全operationの順序付きcompileとcompile時all-or-nothingを所有する。

production buildは178 modules、main 454.16 kB（gzip 130.45 kB）、ranking worker 95.71 kBとなった。v36比はmain +0.54 kB、worker +0.18 kBで、availability判定と厳密照合型の追加に対応する。単独benchmarkは403.13 ops/s、mean 2.4806 msであり、kernelと既存1,954実行結果の変更はない。
