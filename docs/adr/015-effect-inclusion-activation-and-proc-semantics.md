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

- toggleは「計算へ含める／比較のため除外」を表す。
- 単純な確率effectのtoggleは、ONを成功scenario、OFFを失敗scenarioとして表示する。確定effectの同じtoggleは、ONを包含、OFFを比較除外として表示する。
- 連鎖判定は成功回数controlを使い、複数の独立toggleへ分解しない。
- 通常表示へsource kind、source名、確定／確率、条件成立状態、包含状態を出す。
- 同一activationの連鎖operationは一つの表示effectへ集約するが、traceでは各operationと根拠を保持する。
- 条件付き特攻宝具は基礎宝具ダメージと特攻補正を分け、特攻補正のinclusionとcondition成立を別操作にする。
- カード不一致effectと中間state mutationは表示しない。

## Production inventory

2026-08-27のnormalized master v53 / schema 29 / engine 17.0.0では、visible automatic effectは440件（NP 180、passive 260）。同一modifier・label群にautomaticとuser controlが混在するものは152群（NP-before 68群、passive 92群、重複を含む）。

production artifact全体のcanonical procは43 occurrenceである。primary NPのdamage-relevant代表は3騎である。

| family | servant | occurrence | canonical model |
| --- | --- | ---: | --- |
| chained | ガイウス・ユリウス・カエサル | 5 | success count 0..5 |
| independent | 杉谷善住坊 | 4 | 判定共有単位ごとのeffect toggle |
| OC single roll | ドゥリーヨダナ | 3 | per-effect success decision + OC rate |

移行後のmaster `20260827` / master schema 30 / scenario schema 25 / engine 18.0.0では、13,322 effectを`guaranteed` 13,279、`singleRoll` 3、`independentRolls` 35、`chainedRolls` 5へ正規化した。420攻撃宝具の既定projectionはuser 1,606、automatic visible 0、hidden 695である。visibleだが包含操作不能、単純確率だけを理由とする`inputRequired`、unknown proc semantics、inert control、implementation unsupportedは0件でratchetする。

## E4契約

E4ランキングは本ADRの完了までblockedとする。統合後も単発計算と同じinclusion default、proc selection、condition evaluator、transactional executorを使用する。単純判定は既定ONの成功scenario、連鎖判定はcanonical既定成功回数を明示的に使い、期待値計算や乱数抽選は行わない。

## 却下した案

- 確定発動を操作不能な`automatic`とする案: 比較計算の包含decisionを表現できない。
- 単純な確率effectへ成功toggleとは別の必須入力を置く案: 同じ成立状態を二重入力させ、比較操作を冗長にする。
- UI toggleでconditionやworld factを同時に成立させる案: 包含とゲーム状態が再び混同する。
- 対象3騎をID分岐する案: 新しい同型effectを検出できず、意味論の所有が分散する。
