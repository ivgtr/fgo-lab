---
title: "ダメージ計算品質 Q0 調査・目標契約"
status: "Complete"
status_scope: "Q0調査・目標契約の採用記録。本文のapprovedを保持し、現行契約の承認を所有しない"
historical_status: "approved"
date: "2026-08-25"
---

# ダメージ計算品質 Q0 調査・目標契約

- Date: 2026-08-25
- Phase: Q0
- Status: approved
- Baseline commit: `6062746`
- Published master: `2026-08-25-atlas-jp-calculator-v7`
- Current schema: 3
- Current engine: 1.4.0

## 1. Q0の結論

現行実装を部分拡張して特殊Functionと効果解決を完成させる方針は採用しない。rawから必要な意味を落としている正規化、UI選択と最終数値が混在する`CalcInput`、入力を逐次書き換えるeffect resolver、Function名だけで精度を判定するkernel、単発計算とランキングの別々の組立経路を、現在要件から定義した一つの計算契約へ置換する。

Q1以降は次を前提とする。

1. 現在のJP rawで既知の攻撃宝具Function 9種類は、すべてR1の`exact`対象とする。
2. 未知の将来Function、必要入力が欠損したFunction、意味を正規化できないdamage effectは`unsupported`とし、数値結果を返さない。
3. `approximate`は明示的な仮定を伴う検証途中の内部表示に限定し、R1公開ゲートと通常ランキングへ含めない。
4. `CalculationScenario -> ScenarioResolver -> DamageKernelInput -> DamageKernel -> ResultEvaluator`を唯一の計算経路とする。
5. schema v3、engine 1.x、旧draft、旧履歴、旧共有snapshotとのランタイム後方互換を実装しない。
6. 単発計算とランキングの共通facadeを、ブラウザAPIへ依存しない`packages/calculation-application`として設ける。

## 2. 調査対象と再現コマンド

調査対象:

- `data/raw/nice_servant.json`
- `data/raw/nice_equip.json`
- `apps/web/public/master/master.json`
- `packages/data-pipeline`
- `packages/master-data`
- `packages/schema`
- `packages/calc-core`
- `packages/effect-resolver`
- `apps/web/src/features/calculator`
- `apps/web/src/features/ranking`
- draft、履歴、共有を扱うapplication・adapter

主な確認コマンド:

```text
pnpm --filter @fgo-lab/data-pipeline exec tsx src/cli.ts inventory data/raw/nice_servant.json
pnpm validate:master
rg -n "CalcInput|CalcResult|CalculationSelection|calculateNpDamage|resolveCalculationInput"
```

inventoryの件数はrawと公開済みnormalized masterの両方から集計した。rawを再取得せず、現在workspaceに保存されている同一入力を使用している。

## 3. Function inventory

### 3.1 Atlas raw

`nice_servant.json`には強化前後、同一宝具の別priority等を含む攻撃Function entryが627件ある。未知Functionは0件である。

| Function | Raw entries | 現行分類 | Q0提案 |
|---|---:|---|---|
| `damageNp` | 374 | exact | exact |
| `damageNpIndividual` | 141 | exact | exact |
| `damageNpPierce` | 68 | exact | exact |
| `damageNpIndividualSum` | 21 | approximate | exact |
| `damageNpStateIndividualFix` | 13 | exact | exact |
| `damageNpHpratioLow` | 6 | unsupported | exact |
| `damageNpBattlePointPhase` | 2 | unsupported | exact |
| `damageNpRare` | 1 | approximate | exact |
| `damageNpAndOrCheckIndividuality` | 1 | approximate | exact |
| 合計 | 627 | - | - |

「Q0提案のexact」は現在実装が正しいという意味ではない。Q1〜Q4で必要データ、handler、golden、differential evidenceを揃えた後にだけ実行時`exact`となる目標範囲を示す。

### 3.2 公開済みnormalized master

公開済みマスターは469騎のうち攻撃宝具420騎を保持する。各サーヴァントについてpriority最大の攻撃Functionだけを選ぶため、raw 627 entryは420件へ縮約される。

| Function | Normalized servants |
|---|---:|
| `damageNp` | 228 |
| `damageNpIndividual` | 112 |
| `damageNpPierce` | 43 |
| `damageNpIndividualSum` | 18 |
| `damageNpStateIndividualFix` | 12 |
| `damageNpHpratioLow` | 4 |
| `damageNpBattlePointPhase` | 1 |
| `damageNpRare` | 1 |
| `damageNpAndOrCheckIndividuality` | 1 |
| 合計 | 420 |

R1 UIが現在有効な宝具だけを選ぶことと、データ更新時に全Functionを検証することは別責務である。Q1では次の二つを分離する。

- アプリ計算用: 各サーヴァントで現在選択可能な版付き宝具variant
- inventory・回帰用: rawに存在する全攻撃宝具variantとFunction entry

### 3.3 正規化で失われている特殊Function入力

現行`normalizeFunctions()`は基本的に`Value`または`Rate`だけを`values`へ写し、欠損時は0へ変換する。特殊Functionで必要な次の値は内部マスターに残らない。

- `Value2`
- `TargetList`
- `ParamAddMaxCount`
- `TargetRarityList`
- `AndCheckIndividualityList`
- HP比率計算に使う`Target`
- Battle Point段階計算に使う値
- `svals2`〜`svals5`
- `overWriteTvalsList`
- Function固有script値

この情報欠落により、`damageNpIndividualSum`、`damageNpHpratioLow`、`damageNpBattlePointPhase`、`damageNpRare`、`damageNpAndOrCheckIndividuality`を現行`MasterDataSnapshot`だけからexactにすることはできない。

また、欠損値を0へ変換するため、「実際に0」と「raw欠損」を区別できない。Q1では暗黙の0変換を削除する。

## 4. Effect inventory

公開済みマスター内の正規化effectは12,913件である。

| Origin | Effects |
|---|---:|
| サーヴァントskill | 5,486 |
| 概念礼装 | 4,325 |
| passive | 1,637 |
| 宝具効果 | 1,465 |

現行resolverが数値種別へ写すeffectは3,437件である。

| Current resolved kind | Effects |
|---|---:|
| card buff | 1,830 |
| attack buff / defense down | 573 |
| NP damage buff / NP defense down | 518 |
| power modifier | 366 |
| flat damage | 149 |
| NP damage buff-rate modifier | 1 |

この3,437件の内訳には、対象がself以外のeffectが含まれる。

| Target | Damage-relevant effects |
|---|---:|
| self | 2,281 |
| party full | 471 |
| party all | 357 |
| enemy all | 140 |
| enemy one | 88 |
| party one | 64 |
| その他 | 36 |

現行resolverは数値種別を認識すると同じ`CalcInput`へ加算するため、付与先と対象をscenario上のactorへ解決してから集約する構造になっていない。enemyへの防御downとselfへの攻撃upが最終的に同じ数値枠へ入ること自体は式上成立しても、対象外、付与順、弱体不成立、効果除去、特性付与を追跡できない。

次のdamage関連候補も、現行resolverでは最終計算へ十分に接続されていない。

- `downAtk`
- `downCommandall`
- `downNpdamage`
- `upTolerance` / `downTolerance`
- `upDefencecommandall` / `upDefenceNpdamage`
- `pierceDefence`
- `subSelfdamage` / `pierceSubdamage`
- `overwriteClassRelation`
- `tdTypeChange*` / `changeCommandCardType`
- `addIndividuality` / `subIndividuality`
- `fieldIndividuality` / `subFieldIndividuality`
- `npattackPrevBuff`
- damage前後に別Functionを起動するeffect

Q1では名称だけで一括対応せず、対象、タイミング、条件、値、damageへの影響を正規化できるものだけをR1 effect registryへ登録する。未登録のdamage関連effectが選択scenarioに含まれた場合は`unsupported`とする。

### 4.1 魔術礼装

現在のraw領域には`nice_servant.json`、`nice_equip.json`、`nice_item.json`しかなく、魔術礼装の正規化・schema・resolver・UIは存在しない。魔術礼装は現行R1要件に含まれるため、Q1で版付きraw取得元と内部モデルを追加し、Q3で他の`EffectSource`と同じ経路へ接続する。

## 5. 現行計算経路と問題点

### 5.1 現行経路

```text
React UI
  -> CalcInput + CalculationSelection
  -> web/features/calculator/calculation.ts
  -> effect-resolverがCalcInputを順次変更
  -> calculateNpDamage(CalcInput)
  -> CalcResult
```

ランキングは別経路を持つ。

```text
App.tsxで候補ごとにCalcInputを作成
  -> 一部effectをresolve
  -> Workerへ解決済みCalcInputを送信
  -> calculateNpDamage(CalcInput)
```

### 5.2 構造上の問題

1. `CalcInput`に、利用者の選択、マスター由来値、resolver出力、kernel入力、直接入力値が混在する。
2. `CalculationSelection`のoptional fieldとdefault補完が、保存形式と画面状態とresolver入力を兼ねる。
3. resolverがeffectを順番に評価するだけでなく、渡された`CalcInput`を直接変更する。
4. Function固有処理のうち、特攻倍率はresolver、防御無視はkernel、precisionは文字列classifierへ分散する。
5. `classifyAttackNpFunction()`はFunction名だけでexactを返し、使用したパラメータやevidenceを確認しない。
6. `CalcResult`は`unsupported`でも5行の数値結果を保持するため、呼出側が誤利用できる。
7. manual modeはresolverを無条件にexactとして迂回し、入力の出所と仮定をprecisionへ反映しない。
8. `VITE_ENGINE_RELEASE_VALIDATED`が全結果を一括でapproximateまたは元precisionへ切り替える。
9. 単発計算のapplication orchestrationがWeb feature内にあり、ranking workerから再利用できない。
10. draft、履歴、共有が解決前入力、解決後入力、UI selectionを部分的に重複保持する。

### 5.3 現行テスト・evidenceの範囲

計算関連の対象テストは、`calc-core`、`effect-resolver`、Web calculation integrationの3 files・53 testsが成功する。ただし、件数は公開精度の根拠を意味しない。

- `packages/test-fixtures/golden`の計算fixtureは、中立Arts・乱数1000の1ケースだけである。
- 同fixtureの記録上のengineは1.0.0だが、現在テストで組み立てる`VersionContext`は1.4.0であり、fixture metadataを契約として検証していない。
- アルトリア相当値と水着リリスの端点はtest code内のliteralであり、根拠、取得日、review状態をfixture schemaで検証していない。
- Function分類testはprecisionラベルを確認するが、9 Functionそれぞれのhandler計算を検証していない。
- property、外部differential、全対象regression diff、計算evidence completeness gateは存在しない。

したがって、現在成功する53 testsを根拠に既知Functionをexact出荷可能とは判定しない。

## 6. 目標契約案

以下はQ1で実装する契約の責務案であり、プロパティ名の最終確定はQ1のschema testと同時に行う。

### 6.1 CalculationScenario

```ts
type CalculationScenario = ResolvedModeScenario | ManualModeScenario;

interface ScenarioBase {
  attacker: {
    servantId: string;
    level: number;
    npLevel: 1 | 2 | 3 | 4 | 5;
    fouAtk: number;
  };
  target: {
    classId: string;
    attribute: CombatAttribute;
    traits: string[];
    stateTraits: string[];
    rarity: number | null;
    hpPermille: number | null;
  };
  fieldTraits: string[];
  battleState: {
    battlePointPhase: number | null;
  };
  assumptions: ScenarioAssumptions;
}

interface ResolvedModeScenario extends ScenarioBase {
  mode: "resolved";
  craftEssence: CraftEssenceSelection | null;
  orderedSources: EffectSourceSelection[];
  effectDecisions: EffectDecision[];
}

interface ManualModeScenario extends ScenarioBase {
  mode: "manual";
  manual: ManualKernelParameters;
}
```

scenarioは利用者が選択・保存・共有する条件だけを保持する。マスターから再導出できるNP倍率、ATK成長値、効果値、解決済みバフ合計を保存しない。

manual modeは最終数値を明示する独立unionとし、resolved modeのeffectと併用できない。manual結果には`user_supplied_final_modifiers`をassumptionとして必ず残す。

### 6.2 Normalized NP damage specification

```ts
type NpDamageSpec =
  | StandardNpDamage
  | DefensePiercingNpDamage
  | TraitNpDamage
  | TraitCountNpDamage
  | StateTraitNpDamage
  | HpRatioLowNpDamage
  | BattlePointPhaseNpDamage
  | TargetRarityNpDamage
  | TraitExpressionNpDamage;
```

各union memberはFunction名だけでなく、計算に必要な全パラメータを保持する。例:

- NP1〜5倍率
- OC別倍率
- trait IDとany/all/none条件
- 一致数あたり倍率と上限
- HP比率の入力範囲と補正値
- Battle Point phaseごとの補正値
- 対象rarity集合
- 防御無視flag
- raw Function ID、NP variant ID、根拠となるraw path

rawで必要値が欠損した場合は不完全なunion memberを生成せず、normalization errorとする。

### 6.3 ResolvedEffectとResolvedScenario

```ts
interface ResolvedEffect {
  effectId: string;
  source: EffectSourceIdentity;
  timing: EffectTiming;
  order: number;
  operation: DamageOperation | null;
  magnitude: number | null;
  state: "applied" | "rejected" | "unsupported";
  reasonCode: string;
  evidenceKey: string | null;
}

interface ResolvedScenario {
  kernelInputs: [
    DamageKernelInput,
    DamageKernelInput,
    DamageKernelInput,
    DamageKernelInput,
    DamageKernelInput,
  ];
  effects: ResolvedEffect[];
  assumptions: Assumption[];
  issues: CalculationIssue[];
  evidence: EvidenceReference[];
}
```

effect resolverは入力scenarioを変更せず、解決結果を新しい値として返す。effectの選択状態、条件判定、付与対象、値解決、順序を先に確定し、その後にbuff aggregatorが整数基準のmodifierへ集約する。

### 6.4 DamageKernelInput

```ts
interface DamageKernelInput {
  totalAtk: number;
  npMultiplierPermille: number;
  card: "buster" | "arts" | "quick";
  classAttackRatePermille: number;
  classAffinityPermille: number;
  attributeAffinityPermille: number;
  attackModifierPermille: number;
  cardModifierPermille: number;
  npPowerModifierPermille: number;
  specialModifierPermille: number;
  npSpecialMultiplierPermille: number;
  flatDamage: number;
  damageCut: number;
  ignoreDefense: boolean;
}
```

kernel入力は数値計算に必要な値だけを持つ。サーヴァントID、skill、trait、UI選択、master lookup、precisionを持たない。Function handlerは`NpDamageSpec + CalculationScenario`をNPレベル別のkernel入力へ変換し、数値kernel自体はFunction名を分岐しない。

### 6.5 CalculationResult

```ts
type CalculationResult = CalculatedResult | UnsupportedResult;

interface CalculatedResult {
  status: "calculated";
  precision: "exact" | "approximate";
  rows: [DamageRow, DamageRow, DamageRow, DamageRow, DamageRow];
  breakdown: BreakdownEntry[];
  effects: ResolvedEffect[];
  assumptions: Assumption[];
  issues: CalculationIssue[];
  evidence: EvidenceReference[];
  versions: CalculationVersions;
}

interface UnsupportedResult {
  status: "unsupported";
  rows: [];
  effects: ResolvedEffect[];
  assumptions: Assumption[];
  issues: CalculationIssue[];
  missingEvidence: string[];
  versions: CalculationVersions;
}
```

`unsupported`は数値行を持たないdiscriminated unionとする。これによりランキングやUIが未対応結果を通常値として扱うことを型で防ぐ。

### 6.6 Evidence-based precision

precisionは次の順で決定する。

1. 必須入力欠損、未知Function、未登録damage effect、unsupported effectが一件でもあれば`unsupported`。
2. 数値計算は可能でも、使用したhandlerまたはoperationのgolden/differential evidenceが公開基準未満なら`approximate`。
3. 使用した全handler、operation、丸め規則、master変換が検証済みの場合だけ`exact`。

evidence registryは少なくとも次を持つ。

```ts
interface CalculationEvidence {
  key: string;
  subject: string;
  status: "validated" | "provisional";
  sources: string[];
  goldenCaseIds: string[];
  differentialCaseIds: string[];
  reviewedAt: string;
  engineVersion: string;
}
```

環境変数でprecisionを上書きしない。production可否はCIがrequired evidenceの欠損を検出してbuild/deployを停止する。

## 7. package責務案

| Package | 所有する責務 | 禁止する依存 |
|---|---|---|
| `schema` | scenario、portable result、draft/history/share、versioned validation | React、IndexedDB、Atlas raw |
| `master-data` | 正規化済みNP/effectモデル、manifest、validation | UI、profile、kernel実行 |
| `data-pipeline` | raw取込、全variant inventory、normalize、diff report | UI、profile |
| `calc-core` | 数値プリミティブ、Function input resolution、kernel、NP1〜5 evaluator | React、IndexedDB、Atlas raw、profile |
| `effect-resolver` | effect条件・順序・対象、buff aggregation、ResolvedScenario | React、IndexedDB、profile repository |
| `calculation-application` | master lookup、resolver、kernelの唯一のorchestration facade | React、IndexedDB、Worker API |
| `web` | scenario編集、表示、repository/Worker adapter | 計算式、独自resolver、独自ranking式 |

`calculation-application`の新設理由は、現在Web featureにあるorchestrationを単発計算とranking workerで共有し、ブラウザI/Oから分離するためである。形式的な層追加ではなく、二重計算経路を削除する置換先として使用する。

## 8. 削除・置換対象

| 現行対象 | Q1〜Q6での扱い |
|---|---|
| `calcInputSchema` / `CalcInput` | scenarioとkernel inputへ分割後に削除 |
| `calculationSelectionSchema` / `CalculationSelection` | `CalculationScenario`へ置換して削除 |
| `npSpecialMultipliers`を含む手組み補正 | Function resolver出力へ置換して削除 |
| `classifyAttackNpFunction()` | evidence registryとdiscriminated resultへ置換して削除 |
| `ResolvedSupportEffect` | origin非依存の`ResolvedEffect`へ置換して削除 |
| `resolveServantPassives()`等のsource別公開API | 単一`resolveScenario()`へ収束後に削除 |
| `web/features/calculator/calculation.ts`のorchestration | `calculation-application`へ移動後に削除 |
| `VITE_ENGINE_RELEASE_VALIDATED` | Q4で削除 |
| ranking candidate内の解決済み`CalcInput` | scenario requestへ置換して削除 |
| ranking workerの直接`calculateNpDamage()`呼出し | 共通facadeへ置換 |
| `selectionFromShare()` | 共有scenarioの直接検証へ置換して削除 |
| schema v1/v2/v3 calculation migration | vNextで削除し、旧版を拒否 |
| 旧draft、履歴、共有snapshot | vNext形式へ置換。互換読込は残さない |
| 旧計算fixture | 根拠付きfixtureへ置換後に削除 |

使用されている旧APIをdeprecatedとして残さない。各置換スライスで全利用箇所を更新し、`rg`で参照0件を確認して削除する。

## 9. 破壊的変更の影響

Q1〜Q5で次の破壊的変更を許容する。

- `schemaVersion`をvNextへ更新する。
- `engineVersion`を2.0.0へ更新する。
- master schemaと`masterDataVersion`を更新し、IndexedDBの旧active masterを再利用しない。
- schema v3のIndexedDB user dataをランタイム移行しない。
- schema v3 backupをimportしない。
- schema v3共有URL／共有JSONを現行計算条件として読み込まない。
- engine 1.xのdraft・履歴結果をengine 2.0.0の結果として再計算しない。

影響を受けるローカルデータ:

- 所持・育成値
- 育成目標
- 概念礼装コピー
- 支援条件
- 計算draft
- 計算履歴

現在は内部previewであり、後方互換のために新schemaを歪めないことを優先する。vNext初回起動では旧schemaを現行として解釈せず、データ初期化が必要であることを表示する。旧データから一部だけを救済するruntime migrationは作らない。

実装中にユーザーの実データを削除する操作が必要になった場合は、対象を事前に確認し、コード変更やテストだけを理由に実ブラウザデータを自動削除しない。

## 10. Q0確認事項

Q1へ進む前に、次を確定する。

| ID | 提案 |
|---|---|
| Q0-D1 | 現在rawで既知の9 FunctionをすべてR1 exact対象とする |
| Q0-D2 | 未知Function・必須入力欠損・未登録damage effectは数値なしunsupportedとする |
| Q0-D3 | approximateを公開完了条件や通常ランキングへ含めない |
| Q0-D4 | `packages/calculation-application`を唯一の単発・ranking共通facadeとして追加する |
| Q0-D5 | schema v3、engine 1.x、旧backup・共有・draft・履歴のruntime互換を作らない |
| Q0-D6 | vNext移行時は内部previewのローカルユーザーデータ全体をreset対象とする |
| Q0-D7 | 魔術礼装をR1 effect sourceとしてQ1/Q3へ含める |

2026-08-25に、利用者から技術判断を委任されたため、ダメージ品質最優先、後方互換層を作らない、内部previewでは破壊的変更を許容するという既承認方針に基づき、Q0-D1〜D7をすべて承認した。

Q1では最初に型とfixtureを実装し、現行normalizerやruntime経路を残したまま次フェーズへ進まない。

## 11. Q0ゲート評価

| Gate | 状態 | 根拠 |
|---|---|---|
| exact／unsupported対象の確定案 | 承認済み | §3、§10 |
| データフローと状態所有者 | 承認済み | §6、§7 |
| 破壊的変更とデータ影響 | 承認済み | §9 |
| 旧実装削除リスト | 承認済み | §8 |

Q0の調査成果物と判断は確定した。Q1のschema・master正規化置換へ進む。
