---
title: "効果の寄与範囲とranking実行計画をcanonical化する"
status: superseded
date: "2026-08-28"
superseded_by: "ADR-028"
---

# ADR-019: 効果の寄与範囲とranking実行計画をcanonical化する

> [ADR-028](028-canonical-source-program-and-finite-ranking-domain.md)が本ADRを全体として置き換えた。
> 本文はhistorical recordとしてのみ保持する。

## Context

E4.1のrankingはcalculatorと同じscenario／executorを使用する一方、scenario生成では表示用のeffect
controlを一件ずつ操作し、その都度`calculateScenario`を再実行していた。特攻成立もeffectの任意部分集合を
列挙していたため、計算量はeffect数に対する反復と最大`2^N`の探索になっていた。

また、masterのtyped `targetPolicy`はoperationの適用先判定に使った後に失われ、projectionには発生源だけが
残っていた。このためrankingはattacker／passive／NP originをすべて「自己効果」とみなしていた。その後の
暫定整理では`partyWide`を主順位から除外したが、味方全体効果は攻撃役本人にも適用されるため、これも誤りだった。
originは「誰が発生させたか」、scopeは「誰へ寄与するか」であり、本人への最終適用可否をscope名だけで代用しない。

## Decision

### Canonical contribution scope

data-pipelineはraw Atlas targetを、実行recipientとは別の`EffectContributionScope`へ正規化する。

- `personal`: 発生源本人または選択した一人へ与え、攻撃役自身の火力として使える効果
- `partyWide`: 攻撃役を含む味方全体へ与えるarea effect
- `partyOther`: 発生源以外の味方へ与える効果
- `enemyApplied`: 攻撃対象へ与えるdebuff
- `external`: 支援役または魔術礼装から攻撃役へ与える効果

`ptOne`と`ptAll`を同じscopeへ推測変換しない。raw targetの解釈はdata-pipelineだけが所有し、master operation、
battle operation、projectionへtyped scopeを保持する。executorはscopeをmodifier枠として解釈せず、従来どおり
target policyとrecipient契約で正確な適用可否を決める。scopeはapplication policyとevidenceの分類軸である。

rankingの主順位は、攻撃役自身へ最終的に適用される自前効果を含む。したがって`personal`、攻撃役本人も受ける
`partyWide`、攻撃対象へ与える`enemyApplied`を含み、本人へ適用されない`partyOther`を除く。支援なしの標準policyでは
`external`は存在しない。area effectを持つ行は、主順位と同じworld candidateから`partyWide`だけを除いた反実仮想を
一度実行し、詳細に「効果なし」「効果込み」「増加量」を表示する。areaの別枠説明と主火力からの除外を混同せず、
新しいranking入力条件も追加しない。

### Declarative ranking plan

rankingはUI presentation commandを逐次実行してscenarioを組み立てない。application層が完全な
`RankingExecutionPolicy`をcompileし、ranking条件が`TargetContext`とeffect集合を所有する。そのpolicyから
一騎・buildごとの`RankingExecutionPlan`をcompileし、以下を所有する。

- fixed standard／owned scenario
- terminal effectのscope分類
- self effect inclusion policy
- special-attack predicate constraints
- canonical input default
- 有限target/world candidate

effect decision、source dependency、hidden mutationは選択されたterminal effect集合から一度だけ導出する。
effectの包含／除外はrankingが所有する`TargetContext`を変更しない。UI操作用のcondition fallbackや
`applyEffectDecisionCommand`をranking scenario生成へ流用しない。
特攻成立はeffectのON/OFF部分集合を探索せず、canonical target／condition candidateを列挙する。同じcandidateで
成立する特攻operationはすべて同時に評価し、candidateごとにexecutorを一回だけ実行する。排他・AND／OR・
trait／class／attribute／familyは既存のconstraint evaluatorを正本とする。

候補実行はNP1〜5のrow seriesを保持し、各NP levelについて最大damage候補を選ぶ。同値時はcanonical candidate keyで
安定決定する。NP level変更はprepared planを再compileせずseriesからrowと採用scenarioを選ぶ。

探索上限到達は「成立対象なし」と区別したtyped failureにし、通常値へのfallbackを行わない。

### Package boundaries

- data-pipeline: raw targetからtarget policyとcontribution scopeをlosslessに正規化する
- master-data: typed scopeと根拠をartifact contractとして保持する
- battle-execution: operationへscopeを保持し、canonical candidateをtransactionalに実行する
- calculation-application: ranking plan、scope policy、candidate選択、NP seriesを所有する
- Web worker: plan/result cacheとrequest orderingだけを所有し、effect意味論を解釈しない
- React: summary／detail view modelを描画し、scopeやmodifierから計算policyを再構築しない

## Invariants and ratchets

- 表示用controlをranking scenario生成へ逐次適用する経路は0件
- 特攻effect部分集合の`2^N`探索は0件
- raw target／label／servant IDによるscope判定は0件
- 一騎・一world candidateあたりのplan compileは1回
- NP切替によるplan再compileは0回
- `partyWide`は本人へ適用される主順位へ含み、`partyOther`の主順位適用は0件
- area contributionは同一candidate／同一NP levelから`partyWide`だけを除いたcanonical execution差分である
- ranking effect policyによる`TargetContext`変更は0件
- class neutralの全420騎で最終`classAffinity`は1
- implementation unsupported、partial commit、inert controlは0件
- calculator handoffは採用したcanonical scenarioを渡し、rankingと再計算結果が一致する

## Consequences

- 旧`isSelfEffect(origin)`、effectごとの`calculateScenario`、special effect power-set探索を削除する。
- worker cache keyは表示labelやobject identityではなく、buildとcanonical policyから作る。
- production testは一つのranking matrixからclass relation×special policy×NP1〜5を検証し、unit／production／goldenの
  実行目的を分ける。production gate自体は省略しない。
- E4.1のcompact UIとcalculator UIは維持する。field policyの一項目だけはADR-020に従う。E5は本ADRの完了まで開始しない。

## Production result

master artifact `20260828.2`では、terminal operationのscopeは`personal: 2,574`、
`partyWide: 849`、`partyOther: 34`、`enemyApplied: 331`である。標準NP1でarea contributionが0より大きい
サーヴァントはrecipient条件の通常評価後172騎、主順位へ適用された一意な`partyWide` projectionは230件、`partyOther`は0件である。
class neutralの全420騎は`classAffinity === 1`を満たす。

field policyを含む最大world candidate数は16、detail一件の最大scenario calculation数は17となった。
旧実装の最大4,096 effect subset探索とeffectごとの再compileは存在しない。standard workerは
class relation、self buff policy、special attack policy、field policyをmatrix keyとし、NP1〜5を一つのprepared executionから返す。
