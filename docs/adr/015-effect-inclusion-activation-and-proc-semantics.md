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
- 使用スキル由来effectは従来どおり使用decisionが有効な場合だけ候補にする。
- 確率effectは成功／失敗または連鎖成功回数をcanonical inputとして保存する。未指定に成功を補わない。
- effect inclusion、proc結果、world fact、quantity inputは互いを暗黙変更しない。
- 旧decision形式を読み替えるfallbackは持たない。

## Proc正規化

Atlas固有の`Rate`はdata-pipelineだけが解釈する。

- `Rate = 1000`: `guaranteed`
- `0 <= Rate < 1000`: 独立effectなら`singleRoll`。同一activationに複数ある場合も、連鎖根拠がなければ各判定は独立とする。
- 先頭の正Rateに続く同絶対値の負Rate: 前回成功時だけ次へ進む`chainedRolls`。一つの成功回数入力へ集約する。
- OC系列ごとにRateが異なる場合は、OC別確率系列をcanonical IRへ保持する。
- 範囲外、符号列が曖昧、Rate系列がlevel内で不一致、異種operationを一意に束ねられない場合はartifact生成を失敗させる。

確率は期待値へ変換しない。単発計算では具体的な成功結果を入力し、結果が未指定なら`inputRequired`として数値行を返さない。

## UI投影

- toggleは「計算へ含める／比較のため除外」を表す。
- proc controlは「発動成功／失敗」または「成功回数」を表し、包含toggleと混同しない。
- 通常表示へsource kind、source名、確定／確率、条件成立状態、包含状態を出す。
- 同一activationの連鎖operationは一つの表示effectへ集約するが、traceでは各operationと根拠を保持する。
- カード不一致effectと中間state mutationは表示しない。

## Production inventory（移行前）

2026-08-27のnormalized master v53 / schema 29 / engine 17.0.0では、visible automatic effectは440件（NP 180、passive 260）。同一modifier・label群にautomaticとuser controlが混在するものは152群（NP-before 68群、passive 92群、重複を含む）。

primary NPのdamage-relevant procは3騎9 occurrenceである。

| family | servant | occurrence | canonical model |
| --- | --- | ---: | --- |
| chained | ガイウス・ユリウス・カエサル | 5 | success count 0..5 |
| independent | 杉谷善住坊 | 4 | four success decisions |
| OC single roll | ドゥリーヨダナ | 3 | per-effect success decision + OC rate |

移行後は、visibleだが包含操作不能、`Rate<1000`なのに確定適用、unknown proc semanticsをすべて0件でratchetする。

## E4契約

E4ランキングは本ADRの完了までblockedとする。統合後も単発計算と同じinclusion default、proc input validation、condition evaluator、transactional executorを使用する。未指定procを最大成功や期待値へ暗黙変換しない。

## 却下した案

- 確定発動を操作不能な`automatic`とする案: 比較計算の包含decisionを表現できない。
- 確率effectを既定成功にする案: 誤った確定値を返す。
- UI toggleでconditionやworld factを同時に成立させる案: 包含とゲーム状態が再び混同する。
- 対象3騎をID分岐する案: 新しい同型effectを検出できず、意味論の所有が分散する。
