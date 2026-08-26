---
title: "FGO Lab ダメージ効果実行エンジン移行計画"
document_version: "1.1.0"
status: "E3.2 Complete - Awaiting User UX Confirmation"
created_at: "2026-08-25"
source_requirements: "docs/damage-effect-execution-requirements.md v1.0.0"
refactoring_contract: "docs/adr/008-refactoring-contract.md"
---

# FGO Lab ダメージ効果実行エンジン移行計画

## 1. 目的と優先度

本計画は、`docs/damage-effect-execution-requirements.md`を実装、検証、削除、確認の単位へ分解する。ダメージ計算品質を最優先とし、Q6のランキング完成や新しい効果対応より先に実施する。

内部は破壊的に置換するが、フロントエンドの入出力体験は変えない。移行のためだけの互換層や新旧runtime経路は作らない。

## 2. 現状と移行理由

現行実装には次の構造的な重複と漏出がある。

- context mutationを固定点探索し、その後にmodifierを評価しているため、マスターの実行順が主モデルになっていない。
- 効果onが条件全体の成立を直接上書きする。
- UIがresolverのreason文字列、条件種別、付与元から操作可否を再判定している。
- 特攻宝具のcondition controlをapplication layerで別途生成している。
- 状態生成効果、火力効果、表示判定の責務が一つのflat effect配列へ混在している。

直近の個別修正は回帰を止めるために必要だったが、この構造へ条件分岐を追加し続けることは完了形としない。

## 3. 移行規則

1. 各フェーズは最終契約へ直接進み、旧形式を読み続けるadapterを成果物にしない。
2. productionに新旧executorを同時に接続し、結果比較やfeature flagで切り替える方式を採用しない。
3. 置換前の比較はtest fixtureと保存済みgoldenで行い、旧engineをruntimeへ残さない。
4. 一つのフェーズの完了時点で、対象範囲の旧型、旧関数、旧testを削除する。
5. フェーズ途中でmain相当の検証を通せない巨大な未完成commitを作らない。契約、fixture、実装置換、削除確認をレビュー可能なcommitに分ける。
6. ただしproduction経路を二つに分けるための小分けは行わない。中央切替は一つの置換commitにまとめる。

## 4. 完了形

```text
UI input
  -> CalculationScenario
  -> ScenarioCompiler
       master functions -> OrderedBattleOperation[]
       effect decisions -> ScenarioAssumption[]
  -> BattleExecutor
       initial state
       condition evaluation
       ordered state mutation / modifier application
  -> DamageKernelInput
  -> existing DamageKernel / ResultEvaluator
  -> ExecutionResult
       calculation result
       typed effect projections
       trace / evidence / warnings
  -> existing UI regions / share projection / ranking
```

状態所有者は`BattleExecutor`の一つとする。UI、application facade、rankingは補正値や条件成立状態を独自に再構成しない。

## 5. フェーズと確認ゲート

### E0：UI baselineと現状inventoryの固定

状態: 完了（`a28bba8`）

作業:

- 現行ダメージ計算の入力項目、順序、初期値、操作可能条件、結果表、共有導線を一覧化する。
- PCと320pxの代表スクリーンショットを保存する。
- 現行のscenario、effect decision、NP condition control、context resolution、UI projectionの全利用箇所をinventory化する。
- 全masterについて、操作種別、条件式、parameter、context producer／consumer、未対応理由を出力する。
- 必須回帰シナリオの操作列と期待される表示項目をfixture化する。

確認ゲート E0:

- 維持するUIと、正しさのため変更を許容する数値・内訳が区別されている。
- 削除対象一覧がファイル、型、関数単位で確定している。
- サーヴァントID分岐なしで覆うべきFunction familyが確定している。
- 以後の差分を旧runtimeなしで比較できるfixtureが揃っている。

進行条件: UI baseline、許容する出力差、必須回帰シナリオをreportへ記録する。要件書と異なるUI判断が見つからない限り、ユーザー確認で停止せずE1へ進む。

### E1：最終契約と正規化schemaの確定

状態: 完了（`1726d7c`）

作業:

- `BattleState`、`BattleOperation`、`ConditionExpression`、`ScenarioAssumption`、`OperationResult`、`EffectProjection`を判別可能unionとして確定する。
- 条件のAND、OR、否定、個数、対象、field、card、state、定量値をlosslessに正規化する。
- master内の実行順とタイミングを正規化する。
- unsupportedにするoperation／condition／parameterを明示する。
- 新しいschema、master、engine versionと旧計算データの扱いを決定する。
- 型契約とraw fixtureのcontract testを先に作る。

確認ゲート E1:

- 任意の正規化操作がサーヴァント名やIDを参照せず表現できる。
- 表示名やreason文字列が計算契約に含まれない。
- 条件成立宣言がカード、対象、値、順序、handler対応を迂回できない。
- 旧scenarioからの曖昧な自動変換が設計されていない。

進行条件: 入力がどの状態へ変換され、何が自動・手動・unsupportedになるかを代表例でreportへ記録する。UI要件またはR1対応範囲の変更が必要にならない限り、ユーザー確認で停止せずE2へ進む。

### E2：計算経路とフロントエンド投影の破壊的置換

状態: 完了（`48b69a1`）

作業:

- マスター正規化を最終`BattleOperation`形式へ置換する。
- 共通condition evaluatorと順序付き`BattleExecutor`を実装する。
- 自身、パッシブ、礼装、支援、魔術礼装、宝具前効果、宝具特殊Functionを一つの操作列へ接続する。
- UIのeffect decisionを`ScenarioAssumption`へ変換し、状態へ反映して全操作を再評価する。
- `DamageKernelInput`を実行済み状態から一度だけ生成する。
- 既存のfloat32境界、乱数200点、NP1〜5 evaluatorは計算式を変更せず接続する。
- `EffectProjection`から`自身の適用内容`、支援効果、内訳、警告を描画する。
- 既存コントロールを同じ位置、ラベル、順序、初期値で`ScenarioAssumption`へ接続する。
- 特攻宝具を通常条件効果と同じprojectionへ統合する。
- URL、共有JSON、画像、draft、履歴を最終scenario/resultへ更新する。
- 同じ置換commitで旧context固定点探索、条件一括assert、別NP condition control、旧modifier aggregation、UIのreason文字列判定を削除する。

確認ゲート E2:

- productionからdamage kernelへ到達するexecutorが一つだけである。
- context producerが実行順どおり後続条件へ影響する。
- 後続条件が先行操作を遡って成立させない。
- 条件矛盾と未解決操作がfail-closedになる。
- 必須unit、golden、property、inventoryが成功する。
- `rg`による旧型・旧関数・互換flag参照が0件である。
- baseline E2Eで入力項目、操作順、結果表、共有導線が維持される。

進行条件: 必須回帰シナリオの計算値、適用効果、非表示効果、警告を一覧化し、E3の全master監査まで続ける。

### E3：全master監査とUX不変確認

状態: 完了（画面確認待ち）

作業:

- 全masterを最終executorで監査し、未知operation、条件、parameter、表示projectionを分類する。
- 非火力効果、カード不一致色バフ、状態生成だけの効果が表示されないことを全件監査する。
- E0で保存したbaselineと、単発計算のunsupported件数・型付き分類を比較し、増減理由を記録する。
- PCと320pxのvisual regression、キーボード操作、共有round-tripを実行する。
- 必須回帰シナリオを実データE2Eで確認する。
- E2で見つかった問題は旧分岐を戻さず、最終operation／condition／projection契約の修正として解消する。

確認ゲート E3:

- baseline E2Eで入力項目、操作順、結果表、共有導線が維持される。
- PCと320pxのvisual regressionに意図しない差がない。
- UIに計算用reason文字列、マスターlabel、サーヴァントID分岐がない。
- ダンテ、アーキタイプ：アース、水着武則天、水着リリスの操作違和感が解消している。
- schema／engine不一致のdraft、履歴、共有が現行結果として誤表示されない。
- 全masterの表示projection監査に未分類項目がない。

ユーザー確認: 実画面で入力体験と結果表示を確認する。計画承認後は、この確認が必要になるまでE0〜E3の作業と自動検証を一気通貫で進める。

### E3.1：条件decisionと排他状態の是正

状態: 完了（実画面確認待ち）

E3画面確認でダンテ・アリギエーリの対天／対地を同時適用できる回帰を確認した。原因は旧resolverの復活ではなく、新executorの`decisionKey`がoperation有効化と条件成立assertionを兼用し、BattleStateがtrait間の排他関係を持たないことにある。加えて全operationをユーザー操作可能として投影するため、自動パッシブと無条件NP効果の操作可否、未選択カード不一致効果のvisibility、支援だけ別経路となるcondition assertionが契約から逸脱している。

作業:

- trait意味論に基づく排他groupとtyped conflictをScenarioAssumptionへ追加する。
- operation decisionをautomatic、operation enable、condition assertion、両方に判別する。
- assumptionを状態変更前に一括検証し、排他矛盾時は全競合factを適用せずfail-closedにする。
- 状態生成operationをhiddenかつautomaticに固定し、最終火力projectionだけを条件操作対象にする。
- 自身と支援の`changeEffect`を同じassumption更新へ統合し、支援保存内容は最終projectionから導出する。
- partial／曖昧OR条件を一つのtraitへ暗黙変換せずtyped unsupportedへ分類する。
- production master全件で、操作可能だが操作後も状態が変化しないprojectionと、排他条件の同時正常計算を監査する。
- ダンテの対天、対地、同時選択、内部field非表示、支援条件、パッシブ自動、カード不一致をunit／実master E2Eへ固定する。

確認ゲート E3.1:

- 対天または対地の単独選択は対応するoperationだけを適用する。
- 対天と対地の同時選択は両方を加算せず、typed conflictでunsupportedになる。
- 無条件パッシブと無条件NP効果にon/off操作がない。
- 条件付き自身効果と支援効果が同じScenarioAssumptionを生成する。
- 中間状態とカード不一致効果が火力on/off一覧にない。
- 全master監査、PC／mobile Chromium、共有round-trip、build、旧経路参照0件を再度通す。

E3.1完了後に実画面確認で停止する。E4は引き続き開始しない。

完了記録（2026-08-25）:

- `OperationDecisionMode`をautomatic、enableOperation、assertCondition、enableAndAssertへ分離し、内部状態operationをhidden／automaticへ固定した。
- `worldAttribute`、`fieldRealm`、秩序・善悪alignmentの排他groupをtrait意味論として実装し、競合decisionを状態適用前にすべて無効化するtyped conflictへ接続した。
- `Calculator.changeEffect`の支援専用returnと、executorの支援`selectedEffects`有効化を削除した。保存セット呼び出し時だけ選択参照を同じScenarioAssumptionへ具体化する。
- production master 420計算、ユーザー操作1,083件、排他候補12組を全件実行監査した。操作後無変化0件、排他条件の同時正常計算0件。
- 既定scenarioのunsupportedは17騎から19騎。追加はpartial条件の自動パッシブを持つ`2300600`と、対象レアリティ未指定の`403400`で、いずれもtyped fail-closedである。
- ダンテ実masterで対天／対地単独、同時矛盾、hidden field、自動パッシブ／NP、カード不一致、traceを確認した。PCとmobile Chromiumの同一操作E2Eを追加した。
- schema 12、engine 9.0.0。E4ランキング統合には着手していない。

### E3.2：条件・decision・factモデルの破壊的再置換

状態: 完了（実画面確認待ち）

現状監査:

- `assertionsForCondition(any)`は候補が複数ならunsupported planを返し、`decisionMode`がその火力効果を`automatic`へfallbackさせる。visibleな条件付き火力が押せず、未適用でも`calculated`になる。
- `ScenarioAssumption.assertion.exclusiveGroup`はcanonical semanticsから導出可能なのに保存され、`applyAssumptions`が外部値を信用している。`null`へ改変すると排他検証を回避できる。
- `assumptionsForProjection`をwebとapplicationが直接呼び、支援テンプレート復元時にcondition IRを再解釈している。projectionからscenario commandへの責務がfacade外へ漏れている。
- production監査は`controllability === user`だけを起点にするため、誤ってautomaticへ分類された条件付き火力を監査対象から落とす。
- `engine.ts`がmaster condition正規化、decision計画、fact検証、operation compile、順序実行、projectionを同時に所有し、責務境界の単体検証が難しい。

採用設計はADR-009のD+B+C内部検証である。UIは変更せず、effect-local condition satisfactionを具体的world factへ偽装しない。

作業:

1. `ConditionExpression`へpartialを情報保持するvariantを追加し、全variantの評価・制約化・unsupported分類をexhaustiveにする。
2. `ScenarioAssumption`を、operation使用意思とeffect-local条件成立を分離した`EffectDecision`へ破壊的置換する。scenarioからtrait assertionと`exclusiveGroup`を削除する。
3. canonical trait semanticsをexecutor所有とし、初期world factとderived fact、選択済みcondition制約を入力メタデータなしで検証する。
4. OR/AND/NOTを保持した条件制約の充足可能性を検証する。矛盾時は`conditionDecisionConflict`、partialや伝播不能時はtyped unsupportedとする。
5. condition IR、decision planning、fact normalization/validation、operation compilation、ordered execution、projectionを同一package内で分割する。
6. projectionから`EffectDecisionCommand`を生成・適用するAPIを`calculation-application`へ集約する。Calculator、支援保存・復元、rankingからexecutor内部関数への直接依存を削除する。
7. 全master監査をvisible damage候補全体へ広げ、誤automatic、空command、inert control、排他迂回、未知condition variantをratchetする。
8. ダンテ、インドラ、ネモ、モルガン、マルタ、ソロモン、U-オルガマリー、条件付き支援/パッシブ/CE/NP、BBドバイ、アーキタイプ、武則天、水着リリスをunit・実master・E2Eへ固定する。
9. schema、engine、master版を更新し、旧型・旧関数・旧fixture・不要adapterを同フェーズで削除する。

確認ゲート E3.2:

- visibleな未成立条件付き火力がautomaticへfallbackしない。
- OR条件のonは当該operationだけを適用し、具体的traitをworld factへ追加しない。
- selected condition群の排他矛盾はscenarioメタデータなしでfail-closedになる。
- context mutationはhiddenかつtraceableで、effect-local成立との由来が区別される。
- support/self/passive/CE/mystic/NPが同じcondition evaluatorとdecision commandを使う。
- 未選択任意unsupportedは計算継続、選択済み/automatic/NP本体unsupportedは計算停止となる。
- PC、390px、320px、共有、保存、復元、支援セット、rankingでdecision semanticsが一致する。
- 全品質ゲートと実master UI確認を通し、E4へ進まず画面確認待ちで停止する。

完了記録（2026-08-25）:

- schema 13、engine 10.0.0、normalized master v18へ破壊的更新し、`ScenarioAssumption`、`OperationDecisionMode`、`assumptionsForProjection`、scenarioの`exclusiveGroup`を削除した。
- `ConditionExpression`は複数候補ORを保持し、partialもtrait数へ縮約せず`partialTrait`として情報保持する。condition IR、canonical fact検証、application commandを同一package群内で責務分割した。
- effect-local condition satisfactionはworld factへ追加せず、当該火力operationだけへ作用する。選択済みcondition群はmaster IRから論理制約へ展開し、排他的で充足不能ならtyped `conditionDecisionConflict`となる。
- 排他groupはscenario入力から廃止した。実master監査により`alignmentSummer`と通常alignment、アルジュナ〔オルタ〕の善/悪が併存することを確認したため、誤って排他としていたalignment群もcanonical定義から除外し、確実な世界属性と天国/地獄だけへ限定した。
- webのcondition解釈を削除し、自身、支援、保存セット復元、ranking準備を`calculation-application`のprojection commandへ統合した。
- production 420計算で、user projection 1,545件、automatic visible 439件、hidden 671件、操作後不変0件、排他矛盾7組の正常計算0件を固定した。multi-branch ORは16騎19効果で、代表7騎とネモの3効果同時選択を実master回帰化した。
- 既定scenarioのunsupportedは19騎から15騎へ減少した。対象レアリティORはeffect-local成立でexactに解決し、未選択の任意unsupported効果3騎は既定計算を止めず、選択時だけfail-closedとした。partialはBBドバイ1騎1効果を情報欠落なくtyped unsupportedに維持する。
- Danteは未選択NP1平均`32208.975`、対天/対地単独`45629.59`、`powerMod 0.5`。両方選択は`powerMod 0`のままtyped conflictとなる。実UIでは表示`45,630`、両ボタン選択時は結果表を非表示にし、decision、condition conflict、operation outcomeをtraceで確認した。
- PC、390px、320pxとmobile ChromiumでDante/Indraを実操作し、ORボタン、hidden中間状態、damage、最終input、traceを確認した。全Playwrightは35成功、21 project-specific skip、0失敗。E4には着手していない。

### E3.3：world factとeffect-local conditionの統合制約検証

状態: 完了（2026-08-26）

目的:

- E3.2で分離した`EffectDecision`と`WorldFactAssertion`を、同じcanonical constraint modelで横断検証する。
- context mutationをtransactionalにし、矛盾したcandidate stateを後続operationとdamage inputへ残さない。
- webに残るruntime効果分類を`calculation-application`へ収束させる。

作業:

1. fixed literal、satisfiable expression、unknown、typed conflict／unsupportedの契約をADR-009へ追加する。
2. world fact、master/input fact、selected conditionを一つのsolverへ入力し、ORを恣意的に選ばず共通充足可能性を検証する。
3. quantity比較を整数区間へ正規化し、候補上限超過をtyped unsupportedにする。
4. context mutationをclone、apply、validate、commitのtransactionへ置換する。
5. support view modelとruntime分類をapplication facadeへ移し、webの`battle-execution`直接依存を削除する。
6. Dante cross-domain P0、OR代表、crafted share、production fact-decision交差監査、PC／390px／320px E2Eを追加する。
7. 現行移行計画、完了証跡、データ出典・ライセンス台帳を恒久追跡へ戻す。

確認ゲート:

- world factとeffect-local conditionの矛盾が`calculated`にならない。
- conflict operationと失敗したcontext mutationが`applied`にならず、最終inputを汚染しない。
- unknownとexplicit negativeが区別される。
- production交差監査で矛盾正常計算が0件である。
- UI入力体験、OR操作、共有・復元、支援操作を維持する。

完了記録（2026-08-26）:

- schema 14、engine 11.2.0でworld fact、master/input fact、選択済みeffect condition、commit済みcontext mutation、quantityを一つのbounded exact solverへ統合した。未指定traitはunknown、明示的negativeだけをfalseとして扱う。
- AND／OR／NOTはmaster IRのまま候補へ展開し、canonical排他、trait polarity、integer quantity rangeを横断検証する。候補2,048件または128 literalを超える式は近似せずtyped unsupportedとする。
- context mutationはcandidate stateへ適用後に全制約を再検証し、成功時のみcommitするtransactionへ置換した。失敗したmutationと競合operationは`applied`にならず、最終inputは検証済みstateだけから生成する。
- webから`battle-execution`のruntime importを削除し、支援表示、効果分類、projection commandを`calculation-application`へ集約した。
- production 469騎、攻撃宝具420 scenarioを監査した。canonical factとeffect conditionの競合候補は221組、57効果、50騎で、競合中の正常計算、競合operationの適用、矛盾traitの最終input残存はいずれも0件だった。
- user decisionの排他組は7組、world fact projectionの排他組は1組、現行UI projection間のworld fact × effect-local競合は0組だった。multi-branch ORは16騎19効果の操作性を維持した。
- Danteは対天／対地単独で`powerMod 0.5`、NP1平均`45629.59`。world Sky／Heavenと対地decision、world Earth／Hellと対天decision、対天／対地同時decisionはすべてfail-closedとなり、競合解除後は正常計算へ復帰する。
- crafted shareの矛盾scenarioはschema通過後のexecutor検証でunsupportedとなり、保存済みのcalculated結果を受理しない。
- PC、390px、320px、mobile ChromiumでDante、Indra、条件付き支援、共有・復元を実操作した。全Playwrightは35成功、21 project-specific skip、0失敗。E4には着手していない。
- 未承認レビューで検出した範囲外quantity、actor/stateの評価器・solver不一致、複数競合時の部分適用を修正した。HP 0〜1,000、レアリティ0〜5、Battle Point 0〜10をschema／executor共通定義とし、初期制約失敗時は選択中condition operationをall-or-nothingで非適用にする。
- trait制約IRを初期、state、combinedへ分離した。actor条件は初期とstateの三値論理ORとして毎operation再導出し、初期negativeを維持したまま後続state付与・解除を正しく扱う。水着武則天の初期`undead: false`からの死霊付与をproduction ratchetへ固定した。

### E3.5：canonical execution IRへの収束

状態: 完了（2026-08-26）

- data-pipelineをraw Function、buff、target、parameterの唯一の解釈箇所とし、MasterEffectを用途別typed operation列へ破壊的更新した。
- modifier値はdamage modifier 3,733件とmodifier rate change 1件だけへ保持した。context trait ID 73件とその他non-damage値6,625件はmodifier seriesへ入れていない。
- production 13,314 effect occurrenceを同数のcanonical operationへ正規化した。内訳はdamage modifier 3,733、modifier rate change 1、ignore defense 35、ignore damage cut 1、card type mutation 12、context mutation 55、non-damage 9,417、unresolved 60である。
- 未解決recipient trait参照25件は`contextReference / damageRelevant: false`として意味を保持し、現行damage実行を阻害しない。damage関連のunresolvedは従来どおりfail-closedとする。
- battle-executionからraw `parameterSets`、`Value`、buff名、target名、Function routing、`parameter()`を削除した。raw occurrenceは`atlasEvidence`に隔離し、runtime fallbackには使用しない。
- master schema 21、artifact v36、engine 12.13.0へ更新した。scenario schema 21、frontend、共有・保存形式は変更せず、旧artifactの互換読込経路は追加していない。
- 移行前後の既定420 scenarioとuser projection選択1,534件、合計1,954件でscenario input、final input、projection、operation trace、damage rowが完全一致した。digestは双方`825dcf95b265e585cce9343ed6d4b7a180f531794ca3f0e173516220c5d0bc3a`である。
- 既定unsupported 12騎、選択時unsupported 14騎25 occurrence、user 1,534、automatic visible 443、hidden 687、inert user 0を維持した。E4には着手していない。

### E3.6：canonical IR fail-open閉鎖

状態: 完了（2026-08-26、MLB-only damage差分承認済み）

- 限界突破skillなしと、限界突破skillありだが対応effect不一致のケースを分離する。前者だけを通常値同一として扱い、後者はstable occurrence identityとcanonical semantic identityの不一致でartifact生成を停止する。
- effect配列やoperation配列のindexをsemantic対応付けに使わない。effect順序変更はoccurrence identityで安全に照合し、欠落、余剰、kind／target／modifier／condition変更は拒否する。
- executorは一effect内の全canonical operationを配列順にcompileする。部分的な値欠落、unsupported semantics、target mismatchはeffect単位でall-or-nothingにする。
- 1,954ケースの固定digestをproduction testで再計算し、scenario input、final input、projection、trace、damage rowの変更を通常の品質ゲートで検出する。
- 現行productionは全effectが単一operationのため、この修正でdamage値、unsupported、projection inventoryを変更しないことをratchetで確認する。変化が生じた場合はE3.6を完了扱いにしない。

実装前監査では、MLB skillを持つ898礼装のうち8礼装でMLB側だけにeffectが追加されていた。内訳はNP damageに関係する5件（flat damage、Buster、Quick、Arts、NP damage）と、現行NP計算に関係しない3件（damage cut、star weight、critical damage）である。通常側effectの欠落、shared occurrenceのsemantic変更、effect順序変更は0件だった。

この8件を単なる集合不一致としてartifact生成失敗にすると現行masterを生成できない。一方、無視すると現行v36と同じMLB effect欠落が残る。MasterEffectへ`availability: allLimitBreakStates | maximumLimitBreakOnly`を追加し、MLB-only effectを独立occurrenceとして保持する。5礼装を装備したMLB scenarioのdamage値変更は、v36で欠落していた正しい効果を復元する意図的差分として承認された。LB0〜3では非適用、LB4だけで自動適用し、UI、scenario、共有、保存形式は変更しない。

完了記録:

- master schema 22、artifact v37、engine 12.14.0へ更新した。scenario schema、共有、保存、frontend入力は変更していない。
- production effectは13,314件から13,322件となり、追加8件はすべて独立した`maximumLimitBreakOnly` occurrenceである。canonical operationはdamage modifier 3,738、non-damage 9,420を含む13,322件である。
- MLB-only damage 5件はflat damage +17、Buster +2.1%、Quick +2.2%、NP damage +2.3%、Arts +2.4%としてLB4だけに反映する。残り3件のexecution semanticsはnon-damageだが、通常effectへ統合せずMLB-only occurrenceとしてartifactに保持する。
- shared occurrenceは値以外のsemantic identityと順序を厳密照合する。通常側欠落、kind／semantic変更、順序変更、重複曖昧性のfixtureはすべてartifact生成失敗を確認した。
- compilerはcontextを含む全operationをcanonical順に生成する。値欠落またはunresolvedを含むeffectはall-or-nothingでoperation 0件となる。

## E3.7: MLB値完全性とruntime transaction

- CE valued operationは全1,307件でLB4系列を明示する。MLB skillなしはnormalizerが通常系列を複製し、shared effectはsemantic identity照合後のMLB系列、MLB-only effectは独立occurrence自身の系列を保持する。executorのLB4→通常値fallbackは削除した。
- MLB skill保有CE 898件、shared evidence effect 2,077件、shared valued operation 745件（差分値735件）と値digestをproduction ratchetへ固定した。
- `maximumLimitBreakOnly`はCE effectだけに許可し、servant skill／passive／NP／mystic codeへの不正配置をmaster schemaで拒否する。
- 同一effect occurrenceのoperation列はcandidate state/inputで実行し、後半のquantity不足やconstraint conflictを含むruntime failure時に全operationをrollbackする。部分commitされたmodifier、trait、evidence、damage inputを後続へ渡さない。
- master schema 23、artifact v38、engine 12.15.0へ更新した。既存1,954ケースとMLB-only 5礼装goldenは不変で、frontend入力、scenario、共有、保存形式は変更していない。
- 既存420既定scenarioと1,534 user projection選択の1,954件は従来digestと完全一致した。MLB差分5件はLB0／LB4のdamage input digestとNP1〜5、LB1〜3の非適用を専用goldenへ固定した。
- production unsupportedとprojection inventoryは変化していない。PlaywrightはPC／mobile Chromiumで43成功、21 project-specific skip、0失敗だった。

### E4：ランキング統合と全master収束

状態: 未着手

E4着手前にE3.4として`docs/damage-effect-unsupported-convergence-plan.md`を実施する。順序はstable occurrence identity、typed non-damage/metadata、field/state mutation、既存quantity入力、choice/value expression、残存reason ratchetとする。各semantic familyでnormalizer、executor、application、production、shareのテストを揃え、旧key・raw parameter allowlist・projection上書き経路を同じフェーズ内で削除する。

E3.4進捗（master v26、schema 14、engine 12.5.0）:

- effect occurrence identity、field mutation、class relation責務、raw parameter分類、Battle Point guard、HP value expressionをcanonical IRへ移行した。
- `ActSet`／`ActSelectIndex`をeffect-local choice constraintへ置換した。異なる候補はall-or-nothingで`choiceConflict`、同じ候補の複数modifierは共存する。
- action choice 17 effect occurrence・7騎をexact calculationへ移行し、own-effect選択時unsupportedは39騎・63 occurrenceとなった。
- choiceをworld factへ変換する経路、raw action parameterをexecutorで解釈する経路、候補を暗黙選択するfallbackは存在しない。
- E3.4は継続中であり、残存familyの根拠・入力可能性を再監査してから完了判定する。E4には着手しない。
- master v27では明示的NP card mutation 8効果・4騎をexact operationへ移行した。最終cardで色modifierをfoldし、異なるcard候補の競合時は元stateを維持する。連動stateの意味が未解決な3効果は近似せず残した。
- master v29ではskill／passiveの通常攻撃前trigger 22効果・20騎をNP damage scopeから分離した。宝具内の同型参照は除外せずfail-closedを維持し、選択時unsupportedは22騎・41 occurrenceとなった。
- master v30では`TriggeredFuncPosition` 23 occurrence・13騎をeffect-localな発動位置制約へ正規化した。damage前に到達する3 projectionは具体的なworld factを生成せず既存のオン・オフでexactに実行し、damage後の位置付き効果は入力へ遡及させない。既定unsupportedは12騎、選択時unsupportedは20騎・39 occurrenceとなった。
- master v31ではbuff instance identityをactor traitから分離し、`faceCard` 17効果・11騎をcommand-card scopeへ正規化した。Nemo／NoahとMashのlinked buffはexact、宮本武蔵2騎のcommand-card限定効果はNP projection外となり、既定unsupportedは11騎、選択時unsupportedは16騎・35 occurrenceとなった。
- master v32では`TriggeredTargetBattlePointRateRange`をBP phaseと分離したsource-owned rangeへ正規化した。紅閻魔の3火力効果はaction choiceと同じeffect-local solverでexactとなり、異なる候補の同時選択は全modifierを非適用にする。選択時unsupportedは15騎・32 occurrenceとなった。

E3.4完了記録（2026-08-26）:

- master v34、master schema 20、scenario schema 21、engine 12.11.0へ一方向更新した。
- engine 12.12.0で、既定無効の攻撃役スキルに属するhidden field／recipient mutationを最終火力decisionへ結び付けるactivation IRへ置換した。同一skillの無条件mutationと、全論理枝で必須となるtrait producerだけをlinkし、choice候補の一括適用とOR先頭候補の採用を禁止した。
- 現行masterと既存UI入力でexactに解けるoccurrence identity、field mutation、parameter role、BP/HP value expression、action choice、NP card change、command-card scope、function position、buff identity、source-owned BP guardを一つのnormalization／execution経路へ収束した。
- `cardNP`をNP execution scopeとして確定し、宝具内の未解決参照を通常攻撃triggerとして除外しない。玉兎のcardと形態stateはtransactionalに置換し、競合時はどちらもcommitしない。
- 既定unsupportedは12騎、選択時unsupportedは14騎25 occurrenceとなった。残存はtrait provenance、linked state、turn、stack、star、参照artifact不足だけであり、現行UI入力だけでは値が一意にならない。
- production projectionはuser 1,534、automatic visible 443、hidden 687。排他29組、canonical fact-condition交差250組で、競合中の正常計算、競合operation適用、矛盾state残存は0件である。
- 画面構造や入力項目は追加せず、火力effectの既存ボタン、HP/BP入力、共有・保存 semanticsを維持した。E4には着手していない。

作業:

- ranking workerを同じscenario compiler、executor、kernelへ接続する。
- 候補別の自身効果と成立宣言を同じ規則で解決する。
- ranking専用のeffect解決、入力集約、簡易式を削除する。
- 全master inventory、単発対ranking differential、benchmarkをCIへ追加する。
- 未対応をFunction family単位で分類し、サーヴァント別例外を作らず閉じる。

確認ゲート E4:

- 同一scenarioの単発計算とranking結果が完全一致する。
- 全JP攻撃宝具で未分類operationと条件が0件である。
- unsupported候補が通常順位へ混在しない。
- ranking中もUI操作を阻害しない。

### E5：文書、版、旧経路の最終監査

状態: 未着手

作業:

- schema、master、engine versionとデータ影響を記録する。
- 要件、UI仕様、計画、ADR、品質report、evidenceを最終実装へ合わせる。
- supersededなcondition／dependency計画を履歴化し、進行中の正本を一つにする。
- 旧型、旧関数、旧fixture、旧文言判定、互換flag、未使用adapterを全workspaceで監査する。
- typecheck、lint、unit、integration、golden、inventory、E2E、build、benchmarkを実行する。

確認ゲート E5:

- `docs/damage-effect-execution-requirements.md`の受入条件をすべて追跡できる。
- 新旧実装が併存していない。
- 公開可否と残るunsupported範囲を文書とreportから判断できる。
- UI baselineと計算品質の双方が公開ゲートを通る。

## 6. 削除対象

E0で利用箇所を再確認したうえで、少なくとも次を削除対象とする。

- `effectConditionsMatch`の条件一括成立経路
- `resolveBattleContext`の固定点探索
- booleanの`effectOverrides`／`effectDecisions`を条件迂回として解釈する契約
- application layerの`npConditionControls`と合成`ResolvedEffect`
- UIのreason文字列による`isAppliedEffectUserControllable`判定
- UIのcontext-only構造推測
- 表示と計算で重複するdamage relevance classifier
- 移行で不要になる旧schema fixture、旧共有fixture、旧migration

名称は実装時に変更される可能性があるため、削除完了は名前ではなく責務と参照0件で判定する。

## 7. テスト行列

| 層 | 必須検証 |
|---|---|
| Normalizer | raw Functionから順序、対象、条件、値、operationへのlossless変換 |
| Condition | AND、OR、否定、対象、field、card、state、個数、定量、矛盾 |
| Executor | 順序、状態追加・削除、後続条件、非遡及、aggregation、fail-closed |
| Kernel | 既存float32、floor、clamp、乱数200点、NP1〜5 golden無回帰 |
| Projection | 表示、非表示、自動適用、操作可能、理由、付与元 |
| Application | quick/manual、draft、history、share、rankingの同一経路 |
| E2E | 現行入力体験、代表4騎、結果、内訳、警告、共有、320px |
| Inventory | 全masterの未知operation、条件、parameter、ID分岐、旧参照 |
| Performance | 単発p95 100ms、NP1〜5、全候補ranking、Long Task |

外部計算機の値だけをgoldenの正解にしない。Atlas raw、計算根拠、独立計算、比較先との差分理由を記録する。

## 8. コミット境界

レビュー可能性と旧実装非併存を両立するため、次を基本単位とする。

1. `docs(calc): define ordered effect execution migration`
2. `test(calc): lock execution and UI baselines`
3. `refactor(calc)!: replace effect execution and UI projections`
4. `test(calc): audit ordered execution against production master`
5. `refactor(calc)!: unify ranking execution path`
6. `docs(calc): record migration evidence and removed paths`

3は中央production経路、typed UI projection、共有・draft接続の切替と、旧resolver、旧UI判定、別NP controlの削除を同じcommitへ含める。4は最終実装に対する監査と回帰fixtureだけを追加し、旧runtimeを比較用に復元しない。各commitでformat、typecheck、対象testを通し、中央切替後に旧runtimeへ戻すfallbackは追加しない。

## 9. 中断条件

次の場合は該当フェーズを完了扱いにせず、原因と選択肢を提示して確認を受ける。

- UI入出力体験を変えなければ正しい条件を表現できない。
- Atlas rawから実行順または条件をlosslessに正規化できないFunction familyが見つかった。
- 現行kernelの演算境界を変更しなければ実測または一次根拠へ一致しない。
- 安全な一方向移行ができないユーザー原本データが見つかった。
- 全masterで共通化できずサーヴァントID分岐が必要に見える。

この場合も旧実装との併存で回避せず、要件、マスター表現、R1対応範囲のどれを変更するか判断する。

## 10. 着手順

本計画の確認後はE0から開始する。E0とE1はproduction挙動を変更しない。E1確認後、E2で計算経路とUI投影を一度に置換し、E3の実画面確認が必要な段階まで自動検証を含めて進める。E4はE3のUI確認後に着手する。

## 11. E3.8: implementation-unsupported 0

状態: 完了（2026-08-26）

E3.7完了時点の現行artifactを再計測し、既定unsupported 12騎、選択時14騎25 occurrenceを確認した。固定値は期待値として流用せず、`docs/damage-effect-zero-unsupported-plan.md`へorigin、occurrence、raw semantics、damage影響、不足context、共通解決方式を再記録した。

実装順序:

1. 参照skill resourceをnormalization入力へ追加し、参照operationをbuild時解決する。
2. battle-context quantity definitionとtyped `inputRequired`契約をmaster/scenario/resultへ導入する。
3. HP/BPのdefault policy、turn、star、stack、field/actor population、available master skillを一つのquantity経路へ統合する。
4. provenance-aware trait condition、linked buff identity、initial trait suppressionをcanonical IRへ統合する。
5. `checkIndvType=4`をsigned partial-match OR、ParamAdd群をtyped count/value expressionとして正規化する。
6. application descriptorから必要時だけcontext UIを生成し、share/save round-tripを一方向schemaで更新する。
7. raw unknown semantic key、implementation unsupported、inert projection、partial commitをproduction全件で0へratchetする。
8. unsupportedからexactへ移る全対象のNP1〜5、final input、traceをgolden化し、既存calculated parityを維持する。

確認ゲート:

- 攻撃宝具420件とuser projection単独選択にimplementation unsupportedがない。
- 入力不足はtyped `inputRequired`でdescriptorを返し、入力後exactへ到達する。
- executorがraw Function、buff、parameter、script、targetを解釈しない。
- 参照operationと複数operation effectがtransactionalである。
- PC、390px、320px、share/save、production build、全品質ゲートが成功する。
- E4ランキング統合へは着手していない。

### E3.8.1 actor population countの既定値是正

`ParamAddIndividualityTargetType`を一律の`matchingActorCount=0`へ落とした実装は、canonical対象集合から確定できるactorまで除外していた。ジョン・ラックランドは攻撃役本人が〔王〕と〔悪〕へそれぞれ一致するため二つのeffectで最低1ずつ、水着ハベトロットは現在の宝具対象がin-battleであるため敵populationの最低1を持つ。これはunsupportedからexactへ移すだけでなく、旧既定計算の誤算を修正する承認済み差分である。

- master schema 26はpopulation、alive-only、source/other predicate、matching-trait/matching-clause countをtyped IRとして保持する。
- engine 14.0.0はsource master traitと現在対象のactor propertyから保証済み最低値を導出する。サーヴァントID別の補正値は持たない。
- ジョンは`〔王〕一致数`と`〔悪〕一致数`を分離し、同一actorの重複計上を説明する。ハベトロットは`敵の合計数`とする。
- scenario明示値は最終countであり、最低値未満はtyped `inputRequired`となる。入力省略時は共有・保存後も最低値を再導出する。
- artifact v49でcanonical count occurrenceを全件ratchetし、ジョン／ハベトロットの最低値、複数敵、NP1〜5をgolden化する。既存calculated parity 1,504件はdigest不変を必須とし、この2件以外の差分があれば停止する。

## 12. E3.9: 特殊入力interfaceの再実装

状態: 実装中

現行executorから再計測したruntime inputは13 unique key、7 kindである。11 keyは最終火力effectへ
直接関連付けでき、critical star 1 keyは値によって到達可能になる火力effect群へ共有入力として
関連付ける。friendship level 1 keyは現行damage inputを変えない非火力mutationだけの入力なので
通常UIから除外する。HP/BPは既存基本設定、trait/field/linked stateはeffect toggleまたは自動導出を
維持する。

実装順序:

1. scenarioの`Record<string, number>`をbounded integerのtyped canonical value mapへ破壊的に置換する。
2. applicationへinput resolution、effect association、presentation policy、update commandを集約する。
3. `Calculator`の基本設定末尾にある汎用context input loopを削除する。
4. `AppliedEffects`へ汎用inline rendererを接続し、shared inputを一度だけ表示する。
5. result/share image/traceへresolved canonical inputを記録する。
6. production input inventory、重複input、inert UI input、projection到達性、share/saveをratchet化する。
7. ジョン、ハベトロット、アーキタイプ：アース、ダンテ、一般特攻、PC/390px/320pxをE2E確認する。

完了ゲート:

- inputの配置またはcontrol選択にID、名称、label分岐がない。
- 同じcanonical keyの入力controlは画面に一つだけである。
- non-damage inputは通常UIへ出ず、必要な入力はeffect近傍から操作できる。
- 420既定計算、全user projection、implementation unsupported 0、既存golden digestが不変である。
- schema/engineを更新し、旧scenario値map、旧Web loop、互換fallbackが残らない。
- E4実装は行わず、再利用するapplication APIだけを確定する。

完了結果:

- scenario schema 23、master schema 27、artifact v50、engine 15.0.0へ一方向更新した。
- runtime入力13 keyのうち、火力へ到達する12 keyを9騎のeffect近傍へ投影した。非火力の
  friendship level 1 keyは通常UIへ投影しない。
- `canonicalInputValues`はtyped integer valueだけを保存し、未知keyは`unsupported`、既知keyの
  欠落・範囲外・導出minimum未満は`inputRequired`としてfail-closedにする。
- 420既定計算、既存calculated 1,504 scenario digest、全user projectionのimplementation
  unsupported 0を維持した。詳細は`docs/reports/damage-effect-execution-e3-9.md`に記録する。
