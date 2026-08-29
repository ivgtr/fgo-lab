# Damage quality Q3 checkpoint

- Date: 2026-08-25
- Phase: Q3
- Status: complete
- Priority: damage correctness before UI completeness
- Implementation commits: `ac1432c`, `4cb8eb0`, `d61f856`, `0a2d3a7`, `ca2ad9e`, `9853171`, `de269aa`, `aa8ac61`, `c376361`, `55c6524`

## 現行差分

Q2完了時点のeffect解決は、共通の`MasterEffect`を扱う一方、Web applicationが次の6 resolverを順番に呼び、各resolverが直前の`DamageResolutionInput`へ加算する構造である。

1. servant passive
2. craft essence
3. attacker skill
4. mystic code
5. support
6. NP before-damage effect

この構造には次の未収束点がある。

- orchestrationが`apps/web`にあり、domain/application facadeとして再利用できない。
- 付与元ごとに解決と集約を繰り返すため、全効果の順序と集約規則を一箇所で検証できない。
- `ResolvedSupportEffect`という型名が、attacker、passive、NPを含む実態と一致しない。
- effectの判定結果が`applied: boolean`と自由文字列reasonに分かれ、unsupportedとの型上の区別が弱い。
- NP damage buff rateだけがWeb側でresolver結果を再走査して後処理される。
- 単発計算はWeb orchestration、rankingは解決済みinput受渡しであり、scenario resolverの入口が一つではない。
- 当時は明示的effect選択による対象特性・field条件の成立宣言を`ac1432c`で削除した。
  後続の`docs/damage-condition-application-plan.md`では入力負荷と二重契約を解消するため、
  正規化済み条件を表示した上で明示選択を成立宣言とする契約へ再設計している。

## 確定する目標契約

### Q3-D1: EffectSourceを唯一の付与元契約にする

passive、craft essence、attacker skill、mystic code、support、NP before-damageを、順序・付与元identity・選択状態・parameter indexを持つ共通`EffectSource`へ正規化する。付与元別の最終値resolverは残さない。

### Q3-D2: 判定と集約を分離する

resolverは各effectを次の状態へ確定する。

- `applied`: 値、操作、付与元、順序、適用理由が確定した。
- `rejected`: 無効選択または明示条件不一致であり、計算へ入れない。
- `unsupported`: damage関連だが値または意味が未解決であり、計算全体をfail-closedにする。

全effectの状態確定後、`applied`だけを単一aggregatorへ渡す。resolverが入力を逐次変更する方式は削除する。

### Q3-D3: 条件をeffect選択から独立させる

effect選択はon/offだけを決める。対象trait、対象state trait、attacker trait、field trait、card、OC、timingなどのゲーム内条件を上書きできない。条件入力が必要なのにscenarioへ存在しない場合は適用扱いにせず`unsupported`とする。

### Q3-D4: 集約単位を固定する

rateは内部でpermille、flat damageは整数として集約し、`DamageResolutionInput`の最終modifierへ一度だけ変換する。attack、card、NP damage、power mod、flat damage、NP damage buff rateの集約所有者を一つにする。UI側で同じ補正を再構築しない。

### Q3-D5: 順序を明示する

R1のcanonical source orderを次に固定する。

1. passive
2. craft essence
3. attacker skill
4. mystic code
5. support（scenarioのsource順、skill順）
6. NP before-damage（master effect順）

現時点で対応済みの加算効果は順序に対して可換だが、traceと将来の状態変更effectのため順序を失わない。順序意味を確定できないdamage effectは推測せず`unsupported`とする。

### Q3-D6: application facadeをpackageへ移す

`resolveCalculationInput()`と結果統合を`@fgo-lab/calculation-application`へ移し、Webはscenario編集と表示だけを担当する。rankingの完全なscenario facade接続はQ6で行うが、Q3完了時点で独自resolverを追加できない依存方向へ固定する。

### Q3-D7: 旧APIを同じ置換スライスで削除する

次の付与元別APIと型を最終状態に残さない。

- `resolveServantPassives`
- `resolveCraftEssenceEffects`
- `resolveAttackerSkills`
- `resolveMysticCodeSkills`
- `resolveSupportComposition`
- `resolveNpEffects`
- `ResolvedSupportEffect`
- `ResolvedEffectSet`

テストは新しい`EffectSource`、resolver、aggregator、application facadeだけを検証し、旧API用adapterを作らない。

## 実装順

1. 共通`EffectSource`、判別可能`ResolvedEffect`、整数aggregatorを追加し、付与元組合せgoldenを作る。
2. 全付与元を一括収集するscenario effect normalizerを追加する。
3. Web orchestrationをapplication facade呼出しへ置換する。
4. 旧6 resolverと旧型を削除し、全利用箇所とテストを新契約へ更新する。
5. typecheck、unit、golden、master validation、lint、buildを実行し、Q3ゲートを判定する。

## Q3開始判断

上記D1〜D7を採用してQ3実装を進める。後方互換adapterは作らず、一つの置換スライス内で新しい共通経路へ切り替え、旧経路を削除する。対応意味が未確定のeffectは数値へ近似せず、既存どおり理由付き`unsupported`を維持する。

## 完了した置換

Webに存在した6段のeffect orchestrationを削除し、`@fgo-lab/calculation-application`の`resolveCalculationInput()`へ移した。applicationはNP damage Functionを解決した後、effect-resolverの`resolveScenarioEffects()`を一度だけ呼ぶ。

`resolveScenarioEffects()`は全付与元をcanonical順の`EffectSource[]`へ正規化し、`resolveEffectSources()`へ一括で渡す。resolverは全effectを`applied | rejected | unsupported`へ確定してから、`applied`だけを単一aggregatorで集約する。rateは整数permilleで合計し、flat damageは整数で合計し、最終`DamageResolutionInput`へ一度だけ変換する。

`ResolvedSupportEffect`、`ResolvedEffectSet`と付与元別の旧6 resolverは削除した。互換alias、旧API adapter、二重集約経路は残していない。

## 条件とfail-closed

effect選択はon/offだけを所有し、対象trait、状態trait、attacker trait、field trait、card条件を上書きしない。明示選択による条件迂回は`ac1432c`で削除した。

現行master 13,314 effectを確認し、対応済みbuff typeでありながら非空のFunction scriptまたは対象上書きを持つdamage effectを10件検出した。内訳は`demeritFunction`付き防御力ダウンと対象上書き付き宝具威力アップである。これらをmetadata無視で適用せず、選択時に`effect_metadata_not_resolved`として`unsupported`へ分類する。空objectと空配列は追加semanticsを持たないため通常どおり扱う。

選択された概念礼装、魔術礼装、skill、NP sourceがmasterから解決できない場合も、数値を返さず理由付き`unsupported`とする。

## Effect source golden

`packages/test-fixtures/golden/effect-sources-v1.json`は、passive、概念礼装、自身スキル、魔術礼装、支援、宝具前効果を同時に適用するscenarioを固定する。

- canonical source orderと連番order
- attack、card、NP damage、power modifierの最終値
- NP1〜5の最小、200点平均、最大
- engine version、確認日、レビュー状態

同goldenにより、6付与元が一度だけ集約され、同じapplication facadeからkernel評価へ渡ることを検証する。

## 検証

- `pnpm typecheck`: success
- `pnpm test`: 16 files / 102 tests passed
- `pnpm validate:master`: 2 files / 12 tests passed、artifact validation success
- `pnpm lint`: success
- `pnpm build`: success
- `git diff --check`: success
- 旧6 resolver、旧2型、互換aliasへのsource参照: 0件

## Q3ゲート判断

Q3を完了とする。全付与元は一つの`EffectSource`契約、一つのcondition resolver、一つのinteger aggregator、一つのapplication facadeへ収束した。条件不明effectは暗黙適用されず、各effectの付与元、順序、状態、理由をtraceでき、全付与元組合せgoldenが成功する。

Q4では、この実行経路を前提にFunction・effectごとのevidence registryを導入し、環境flagによる全体precision上書きを削除する。未検証handlerを`exact`へ昇格させない。
