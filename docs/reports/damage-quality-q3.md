# Damage quality Q3 checkpoint

- Date: 2026-08-25
- Phase: Q3
- Status: in progress
- Priority: damage correctness before UI completeness

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
- 明示的effect選択が対象特性・field条件を強制成立させる経路があった。これは`ac1432c`で先行削除した。

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
