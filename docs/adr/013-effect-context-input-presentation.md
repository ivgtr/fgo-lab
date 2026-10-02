---
title: "ADR-013: 特殊入力をeffect近接view modelへ投影する"
status: "accepted"
date: "2026-08-26"
---

# ADR-013: 特殊入力をeffect近接view modelへ投影する

- Status: accepted
- Date: 2026-08-26
- Scope: 単発宝具ダメージ計算の特殊入力。E4ランキング画面は含めない。

## Context

E3.8で戦闘状況を`BattleContextInputDefinition`へ正規化したが、scenarioは
`Record<string, number>`、Webは全definitionを基本設定の末尾へ一括表示している。このため、
入力がどの火力効果へ作用するかが画面上で分からず、非火力operationだけが消費する入力も露出する。
一方、canonicalなworld fact、field、linked stateをそのままフォーム化すると、火力効果の選択と
内部状態の入力が二重化する。

現行production artifactとexecutorを再計測した結果は次のとおりである。

| 対象 | occurrence / runtime key | 現行canonical kind | 件数 | 配置 |
| --- | --- | --- | ---: | --- |
| HP割合 | HP比例宝具6件、HP比例modifier 3 effect | quantity fact / source HP | 既存欄1 + runtime生成 | 基本設定。支援元HPだけeffect inline |
| Battle Point | 特殊宝具2件 | quantity fact | 既存欄1 | 基本設定 |
| turn | damage-relevant runtime input | `currentTurn` | 2 | effect inline |
| critical star | 10段階の火力conditionが共有 | `criticalStars` | 1 key / 10 effect | effect group inline |
| stack | value expression | `effectStackCount` | 4 | effect inline |
| 敵population | NP modifier | `fieldActorCount` / `matchingActorCount` | 2 | effect inline |
| trait一致count | NP/skill modifier | `matchingActorCount` | 3 | effect inline |
| available skill | NP modifier | `availableSkillCount` | 1 | effect inline |
| friendship | 非火力のBP上限mutationだけが消費 | `friendshipLevel` | 1 | UIへ出さない |
| trait / field condition | condition IR | user projection | 共有factを含む | effect toggle |
| field / linked state / trait mutation | ordered operation | 42/15 occurrenceを含む | runtime導出 | hidden、traceのみ |

artifact全体ではcontext definitionは41 occurrence、runtimeの既定420宝具では13 unique inputである。
既定420件は全件`calculated`、projectionはuser 1,162、automatic visible 440、hidden 709だった。

## Decision

### Canonical value

scenarioの特殊入力はstable input keyからtyped valueへのmapとする。現productionで必要な値は
bounded integerだけなので、実例のない抽象variantは追加せず`{ kind: 'integer', value }`だけを持つ。
master definitionのkind、owner、domain、default policy、count semanticsをscenarioへ複製しない。
旧number mapと新value mapのruntime fallbackは持たない。

### Application boundary

`calculation-application`が次を一度だけ解決する。

1. master definition、runtimeで導出したminimum/default、scenarioの明示値を検証する。
2. definitionを消費するprojectionをstable input keyで関連付ける。
3. damage modifierへ到達する入力だけを`EffectInputViewModel`へ投影する。
4. 同じkeyを複数effectが消費する場合は一つのshared inputとし、関連projection keyを列挙する。
5. 現在condition不成立でhiddenな火力effectでも、値を変えることで到達可能なら入力を表示する。
6. 非火力operationだけが消費しfinal damage inputを変えない入力は通常UIへ投影しない。

Webはdefinition、condition、owner、default policyを解釈せず、view modelのcontrol、value、range、
validation、related effectだけを汎用rendererへ渡す。入力更新はapplication commandを使用する。

### Presentation policy

presentation policyはcanonical schemaではなくapplication view modelが所有する。

| canonical semantics | view-model control | 配置 |
| --- | --- | --- |
| 1〜4個の小さい整数domain | `segmented` | effect内 |
| その他のbounded integer | `stepper` | effect内 |
| HP permille | `percentage` | 基本設定または支援effect内 |
| trait/field condition | effect decision toggle | effect行 |
| 自動導出fact/mutation | controlなし | hidden、根拠/traceのみ |

controlの選択はservant ID、skill ID、名称、labelではなくkindとdomainから決める。ReactやCSSの
情報をmaster IRへ入れない。

### Wireframe

変更前:

```text
基本設定
  ...
  〔王〕一致数 [ 1 ]
  〔悪〕一致数 [ 1 ]
自身の適用内容
  [宝具威力アップ +10%]
  [宝具威力アップ +10%]
```

変更後:

```text
基本設定
  ... HP / BP（必要時のみ）
自身の適用内容
  宝具威力アップ +10%
    〔王〕一致数  [-] 1 [+]  本人を含む最低1
  宝具威力アップ +10%
    〔悪〕一致数  [-] 1 [+]  本人を含む最低1
```

小domainは次のように表示する。

```text
宝具威力アップ +10%
  敵の合計数  [1] [2] [3]  現在対象1体を含む
```

### Input required

入力欠落、範囲外、導出minimum未満はclampしない。該当inline controlをinvalidとして示し、
typed `inputRequired`と同じkeyを関連付け、damage rowを表示しない。結果欄の警告だけに依存しない。

### E4 boundary

E4はapplicationの`resolveCanonicalInputs`、scenario command、`calculateScenario`をそのまま使う。
ranking workerへdefinition解釈、default導出、validation、effect固有入力を実装しない。ランキングUI
自体は本ADRの実装範囲外である。

## Consequences

- 通常ケースの操作量と主要な画面順は変わらない。
- 特殊入力と影響する火力effectが隣接し、中間状態は引き続き表示されない。
- scenario/share/save schemaとengine versionを破壊的に更新し、旧number mapを削除する。
- master IRの入力definition名もcanonical inputへ統一するため、master schemaとartifact versionを更新する。
- 既存calculated scenarioのfinal damage inputとNP1〜5は変えない。
