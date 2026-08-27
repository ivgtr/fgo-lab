---
title: "効果包含・ゲーム内発動・確率結果の分離"
status: accepted
date: 2026-08-27
---

# ADR 015: 効果包含・ゲーム内発動・確率結果の分離

## 決定

ダメージへ到達するeffectについて、次の責務を別の型と別の評価段階にする。

1. `inclusion`: 今回の比較計算へ含めるか。visibleな最終火力effectは原則操作可能で、確定effectは既定includeとする。
2. `activation`: 常時、使用スキル、宝具前、派生状態のどこからゲーム内候補になるか。
3. `condition`: HP、trait、field、count等のcanonical predicate。includeはconditionを成立させない。
4. `proc`: `guaranteed`、`singleRoll`、`independentRolls`、`chainedRolls`の確率構造とOC別成功率。
5. `presentation`: terminal damage effectだけをvisibleとし、中間state mutationはhiddenのまま同じactivation transactionへ結び付ける。

`automatic`を上記の総称として使用しない。executor内部の「入力なしで評価可能」という状態は、UI操作可否やゲーム内確定発動を意味しない。

## Scenario契約

- visibleな確定effectは既定includeであり、除外差分だけを保存する。
- 支援保存セットも同じく除外差分だけを`effectInclusions`へ保存し、旧selected-effect列挙は保持しない。
- 使用スキル由来effectは従来どおり使用decisionが有効な場合だけ候補にする。
- 単純な確率effectはeffect inclusionをproc selectionとしても用いる。includeは成功scenario、excludeは失敗scenarioを表し、別の成功入力を保存しない。
- 連鎖判定だけは不可能な飛び石選択を防ぐため、成功回数をcanonical inputとして保存する。既定値は最大成功回数とする。
- effect inclusion、proc結果、world fact、quantity inputは互いを暗黙変更しない。
- 旧decision形式を読み替えるfallbackは持たない。

## Proc正規化

Atlas固有の`Rate`はdata-pipelineだけが解釈する。

- 選択中のlevel／OCで`Rate = 1000`: 実行時は`guaranteed`
- `0 <= Rate < 1000`: 独立effectなら`singleRoll`。同一activationに複数ある場合も、連鎖根拠がなければ各判定は独立とする。
- 先頭の正Rateに続く同絶対値の負Rate: 前回成功時だけ次へ進む`chainedRolls`。一つの成功回数入力へ集約する。
- OC系列ごとにRateが異なる場合は、OC別確率系列をcanonical IRへ保持する。
- 範囲外、符号列が曖昧、Rate系列がlevel内で不一致、異種operationを一意に束ねられない場合はartifact生成を失敗させる。

確率は期待値や乱数へ変換しない。単純判定の具体的な結果はeffectのON/OFFで選び、確率だけを理由に`inputRequired`へしない。

## UI投影

- domain上の分離数とUI操作数を一致させない。applicationのpresentation commandは、一つのeffect chip操作をeffect inclusion、必要なeffect-local condition decision、proc selectionへatomicに展開する。
- 攻撃役のskill rowはicon、名称、Lv、保存値／仮想値／一時変更、Lv resetだけを表示する。source activationのbutton、`aria-pressed`、check mark、選択枠を持たず、攻撃役の火力effect操作は`自身の適用内容`だけに置く。
- 攻撃役source activationはscenarioへ保存する独立状態ではない。選択中のvisible terminal effectを列挙し、effect自身のsourceと`activationSources`を辿った依存閉包としてexecutorが導出する。同じsourceを要求するeffectが残る限りsourceを維持し、最後のeffectをoffにした時点で不要なsourceとhidden mutationを実行候補から外す。
- toggleは「計算へ含める／比較のため除外」を表す。effect-localな条件成立を利用者が選ぶeffectでは、同じchip操作がcondition decisionも更新し、別の条件buttonを表示しない。HP、star、count等のcanonical入力から評価する条件は強制成立させない。
- 排他的conditionはeffect chip群自体をsingle-choiceとし、選択時に兄弟conditionを解除する。選択済みchipの再操作で未選択へ戻せる。
- 単純な確率effectのtoggleは、ONを成功scenario、OFFを失敗scenarioとして表示する。確定effectの同じtoggleは、ONを包含、OFFを比較除外として表示する。
- 連鎖判定は成功回数controlを使い、複数の独立toggleへ分解しない。chipのtoggle能力と数量inputの有無は別軸とする。成功回数0だけをoff、1以上をonとし、chip offは0、chip onはcanonical maximumへ更新する。effect exclusionを併記しない。
- 通常表示は効果名と「値・短いsource」を原則2行以内にする。ON時の`計算中`、`スキル使用中`、`確定`は押下状態と色で伝わるため重複表示しない。除外、失敗、条件外、成功率は短い状態語として表示し、完全なsource名と状態説明はaccessible nameとtooltipへ残す。
- inputなしeffectは内容幅で横並びにし、input付きeffectだけ必要幅を確保する。320pxでもdocument overflowを作らない。
- 同一activationの連鎖operationは一つの表示effectへ集約するが、traceでは各operationと根拠を保持する。
- 条件付き特攻宝具は基礎宝具ダメージと特攻補正を分けるが、特攻補正のinclusionとeffect-local condition成立は一つのpresentation操作へまとめる。
- カード不一致effectと中間state mutationは表示しない。

### Compactness ratchet

`9e3db3d^`のskill rowとeffect chip densityを比較基準とする。VRT画像の更新だけを受入根拠にせず、Playwrightで次を測定する。

- desktop / 390px / 320pxでhorizontal overflow 0。
- inputなしの通常effectが常にcontainer全幅となる件数 0。
- 自身skill 3行はactivation toggle追加前と同じ一段gridを維持し、常設button列を持たない。
- 通常effect 4件はdesktopで4枚の全幅縦積みにせず、390pxでも内容幅に応じて折り返す。
- chipのtap targetは42px以上、skill Lv controlは44px相当の操作領域を維持する。

## Production inventory

2026-08-27のnormalized master v53 / schema 29 / engine 17.0.0では、visible automatic effectは440件（NP 180、passive 260）。同一modifier・label群にautomaticとuser controlが混在するものは152群（NP-before 68群、passive 92群、重複を含む）。

production artifact全体のcanonical procは43 occurrenceである。primary NPのdamage-relevant代表は3騎である。

| family | servant | occurrence | canonical model |
| --- | --- | ---: | --- |
| chained | ガイウス・ユリウス・カエサル | 5 | success count 0..5 |
| independent | 杉谷善住坊 | 4 | 判定共有単位ごとのeffect toggle |
| OC single roll | ドゥリーヨダナ | 3 | per-effect success decision + OC rate |

移行後のmaster `20260827` / master schema 30 / scenario schema 26 / engine 19.0.0では、13,322 effectを`guaranteed` 13,279、`singleRoll` 3、`independentRolls` 35、`chainedRolls` 5へ正規化した。420攻撃宝具の既定projectionはuser 1,606、automatic visible 0、hidden 695である。visibleだが包含操作不能、単純確率だけを理由とする`inputRequired`、unknown proc semantics、inert control、implementation unsupportedは0件でratchetする。攻撃役skillの独立activation入力も0件であり、field／trait hidden mutation 26件について選択時の依存source欠落と最後の依存解除後のstale適用を0件に固定する。

## E4契約

E4ランキングは本ADRの完了までblockedとする。統合後も単発計算と同じinclusion default、proc selection、condition evaluator、transactional executorを使用する。単純判定は既定ONの成功scenario、連鎖判定はcanonical既定成功回数を明示的に使い、期待値計算や乱数抽選は行わない。

## 却下した案

- 確定発動を操作不能な`automatic`とする案: 比較計算の包含decisionを表現できない。
- 単純な確率effectへ成功toggleとは別の必須入力を置く案: 同じ成立状態を二重入力させ、比較操作を冗長にする。
- UI toggleでconditionやworld factを同時に成立させる案: 包含とゲーム状態が再び混同する。
- 対象3騎をID分岐する案: 新しい同型effectを検出できず、意味論の所有が分散する。
