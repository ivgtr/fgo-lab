---
title: "ADR-018: rankingを少数の比較policyへ限定する"
status: "accepted"
date: "2026-08-27"
---

# ADR-018: rankingを少数の比較policyへ限定する

- Status: accepted
- Date: 2026-08-27

## Context

E4はcalculatorと同じcanonical scenario／executorをrankingへ統合した一方、calculatorで扱えるHP、field、
trait、人数、礼装、支援等をranking conditionにも露出した。これは厳密な個別計算には有用だが、同じ基準で
420攻撃宝具を比較するrankingの目的には過剰であり、条件の意味論をranking、Web、workerへ再び分散させる。

## Decision

共有可能な`RankingConditions`は次の6項目だけとする。最初の5項目はE4.1で固定し、6項目目のfield policyは
ADR-020で外部fieldと自前生成fieldを混同しないために追加した。

- 標準比較／所持戦力
- NP1〜5
- class等倍／正当に取り得る最大有利
- 自己火力効果を含む／除外
- 特攻なし／成立可能な最大damage
- 外部fieldなし／成立可能な最大damage

残りは`STANDARD_RANKING_SCENARIO_POLICY`が所有する固定基準とする。自然上限、Fou+1000、skill Lv10、
OC1、attribute等倍、HP100%、star 0、初期turn／BP、礼装・魔術礼装・支援なし、quantity minimum、
proc成功、chained最大である。Web、worker、testへ固定値を複製しない。

`RankingPolicy -> CalculationScenario`は`rankingScenario`だけが所有する。Webは6項目を送信し、workerは
application facadeを呼ぶだけで、TargetContext、effect、proc、raw Atlas語彙を解釈しない。表示filterは
計算conditionと別stateとし、filter変更で再計算しない。

特攻はUI上の一項目だが、canonical IR上の`powerMod`と`npSpecial`を潰さない。inactiveはcanonicalに操作可能な
特攻を不成立にし、activeはADR-028のranking source programがtarget／condition candidateを有限生成する。
effectの任意部分集合は探索しない。同じtargetで成立する特攻をすべてcanonical executorで評価し、NP1〜5の
各rowで最大damageを採用する。同値はscenarioのstable canonical keyで決める。探索上限は「成立対象なし」と
区別したtyped failureとし、通常値へ読み替えない。

classの「有利」はcalc-coreの実在target relationから導出する。2.0がなければ1.5、どちらもなければneutralで、
ranking独自倍率表や疑似targetを作らない。具体class／attributeを要求する特攻ではTargetContext resolverが実相性を
導出するため、固定relative値を保持しない。

所持戦力は保存buildが存在するservantだけを対象とし、保存Lv、NP Lv、Fou、skill Lvを使う。未所持を標準値へ
fallbackせず、礼装・支援も使用しない。

## Consequences

- 旧ranking condition、URL parameter、入力componentを削除し、reader fallbackを残さない。
- calculatorとrankingの同一scenario parityが正本であり、ranking専用damage式を持たない。
- 特攻成立時もscenarioのNP Lvと固定OC1を別々のcanonical series軸としてexecutorが解決する。
- 最大条件、個別target editor、support／CE比較は本phaseのrankingへ追加しない。
- E3.12.1 calculator UIとscenario操作は変更しない。
- attacker originだけを自己効果の根拠にしない。ADR-028のcanonical contribution scopeにより、主順位とarea寄与を
  分離する。
