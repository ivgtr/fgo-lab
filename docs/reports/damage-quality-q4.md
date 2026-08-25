# Damage quality Q4 checkpoint

- Date: 2026-08-25
- Phase: Q4
- Status: complete
- Priority: evidence completeness before exact labels

## Q3完了時点のprecision経路

Q3完了時点では、次の問題が残る。

- DamageKernelはFunction種別や検証証拠に関係なく、計算可能なら`exact`を返す。
- effect resolverは未対応effectを`unsupported`にできるが、対応operationの検証段階をprecisionへ反映しない。
- 9種NP Function handlerは必須入力が揃えば、独立differentialの有無に関係なく`exact`になり得る。
- manual modeは利用者入力という仮定を記録する前に`exact`としてeffect解決を迂回する。
- `VITE_ENGINE_RELEASE_VALIDATED`が単発計算とranking全体を一括で`approximate`へ降格する。
- 結果に使用evidence一覧がないため、`exact`の根拠を結果単位で追跡できない。

## 確定する置換契約

### Q4-D1: evidenceを計算結果の必須要素にする

`CalculationEvidence`は少なくとも次を持つ。

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

calculated resultは実行時に使用したevidence keyと解決済みevidenceを保持する。存在しないkeyやengine version不一致を無視しない。

### Q4-D2: evidence registryの所有者をapplicationに固定する

registryは`@fgo-lab/calculation-application`が所有し、次のsubjectを区別する。

- kernel formula、binary32境界、乱数評価
- master normalization
- 9種のNP Function handler
- attack、card、NP damage、power、flat damage、NP damage buff rateのeffect operation
- manual final modifiers

UI、Worker、環境変数はprecisionを決定しない。

### Q4-D3: precisionを使用evidenceの最小品質から導出する

判定順を固定する。

1. 必須入力欠損、未知Function、未解決effect、evidence key欠損は数値なし`unsupported`。
2. 使用evidenceに`provisional`が一件でもあれば`approximate`。
3. 使用evidenceが全て存在し、engine versionが一致し、全件`validated`の場合だけ`exact`。

未使用handlerのprovisional evidenceは現在の結果を降格させない。

### Q4-D4: 現在の証拠を過大評価しない

Atlas一次式とQ2 goldenがあるkernelはvalidated候補とする。特殊Functionとeffect operationは、実装testだけを理由にvalidatedへ昇格させない。独立goldenと外部differentialが揃うまでprovisionalとする。

manual modeは計算式の決定性とは別に、modifierが利用者提供値であるため`manual-final-modifiers` evidenceを使用し、少なくともQ4開始時点では`approximate`とする。

### Q4-D5: 環境flag経路を削除する

evidence合成へ接続した同じ置換スライスで次を削除する。

- `VITE_ENGINE_RELEASE_VALIDATED`
- `ENGINE_RELEASE_VALIDATED`
- `releaseValidated`引数、Worker request field、ranking props、fingerprint要素
- flagのtrue/falseだけを固定するtest

互換optionやfallbackは残さない。production公開可否は、required evidence completenessを検査するCI gateが所有する。

### Q4-D6: schemaとengineを破壊的に更新する

evidenceを持たない旧resultを現行resultとして読まない。結果schemaとengineの版を更新し、旧draft、履歴、共有snapshotを暗黙変換しない。

## 実装順

1. evidence schema、registry、completeness testを追加する。
2. kernel、NP handler、effect operation、manualの使用evidenceを収集する。
3. application facadeでprecisionを一度だけ導出する。
4. 環境flagと全`releaseValidated`経路を削除する。
5. Function別golden／differentialを追加し、validated範囲を証拠単位で昇格する。
6. 全検証とevidence inventoryを実行してQ4ゲートを判定する。

## Q4開始判断

Q4-D1〜D6を採用する。現在の`exact`表示を互換維持せず、証拠が不足する経路は`approximate`へ正しく降格させる。数値意味が未解決な経路は`approximate`で隠さず、引き続き数値なし`unsupported`とする。

### Q4-D7: 特殊Functionの完全外部実行差分を完了条件にしない

2026-08-25の確認により、特殊8種についてChaldea本体を実行する完全差分はスコープから外す。Atlas raw実データgoldenとChaldea公開分岐のsource照合は維持するが、これを外部実行結果とは呼ばない。

完全差分を省略する代わりに、特殊8種はprovisional／approximateから昇格させない。標準Functionのvalidated判定と混同せず、evidence inventoryがこの境界を固定する。

## 実装チェックポイント 1

- Commits:
  - `1f77498 refactor(calc): derive precision from evidence`
  - `56c8f06 refactor(calc): remove release precision flag`
- result schemaへ必須evidenceを追加し、schema version 6・engine version 4.0.0へ更新した。
- kernel、master normalization、9種Function、8種effect operation、manual final modifiersをapplication registryへ登録した。
- Functionとeffect operationは独立differential未完のためprovisionalを維持する。従来の`exact`期待は互換維持せず`approximate`へ変更した。
- 単発計算とrankingは、使用したevidence keyだけを合成して同じ評価関数からprecisionを得る。
- 未登録evidenceは単発計算・rankingとも数値なし`unsupported`になる。
- `VITE_ENGINE_RELEASE_VALIDATED`、`ENGINE_RELEASE_VALIDATED`、`releaseValidated`の実装経路を削除し、旧flag testも根拠追跡testへ置換した。
- 旧schemaまたは旧engineの計算結果は現行result schemaで拒否する。

検証結果:

- `pnpm typecheck`: success
- `pnpm test`: 18 files / 110 tests passed
- `pnpm lint`: success
- `pnpm build`: success

この時点ではQ4を継続し、Function別golden／differentialを追加した。最終判断はQ4-D7と後続チェックポイントに記録する。

## 実装チェックポイント 2: Function状態入力とgolden行列

- Commit: `9151b12 fix(calc): count NP trait stacks from battle state`
- Atlas raw全件とChaldeaのFunction分岐を突合し、`damageNpIndividualSum`が通常特性だけでなく該当traitを持つbuff数も合算することを確認した。
- `DamageResolutionInput`と`CalculationScenario.attacker`へ状態特性を追加し、攻撃者は恒常＋状態、対象も恒常＋状態のcountをhandlerへ渡す。
- 状態特性を持たない旧scenarioは暗黙補完せず、schema version 7で拒否する。計算意味変更のためengine versionを4.1.0へ更新した。
- `np-functions-v1.json`に9種Functionを覆う10ケースを追加した。値はAtlas JP raw、分岐・count規則は[Chaldea damage implementation](https://github.com/chaldea-center/chaldea/blob/main/lib/app/battle/functions/damage.dart#L80-L161)と照合した。
- goldenはパラメータと分岐の独立レビューであり、Chaldeaを実行した出力比較ではない。このため全Function evidenceはprovisionalを維持する。

## 実装チェックポイント 3: Battle Point上限

- Commit: `87cbefe fix(calc): clamp battle point NP phases`
- raw全627 Functionのparameter key、Target、script、overwriteを監査した。現行対象の`damageNpBattlePointPhase`は2 entryで、どちらも同一Battle Point IDを参照する。
- Chaldeaが現在phaseをサーヴァント固有の最大phaseへclampする一方、旧masterは`battlePoints`を捨てていたため、任意の大値で倍率が過大になる実装漏れを確認した。
- エレシュキガルのBattle Point phase 0〜10を正規化し、`NpDamageSpec.maximumBattlePointPhase`を必須化した。master schemaを6、engine versionを4.2.0へ更新した。
- 公開masterは`2026-08-25-atlas-jp-calculator-v13`へ置換し、対象2宝具が最大phase 10を保持することを確認した。

最新検証結果:

- `pnpm typecheck`: success
- `pnpm test`: 19 files / 124 tests passed
- `pnpm lint`: success
- `pnpm build`: success
- `pnpm validate:master`: 2 files / 13 tests passed、artifact validation success

## 実装チェックポイント 4: AppMedia標準differential

- Commit: `83de448 test(calc): validate standard NP differential`
- AppMedia水着リリス比較条件を版付きfixtureへ固定した。NP5、等倍、合計ATK 20,781、Quick補正なし、宝具威力+80%、特攻宝具100%（中立倍率1.0）、パッシブ・状態特攻なしである。
- AppMedia oracleは最低61,944・最大75,640、FGO Lab engine 4.2.0は最低61,944・最大75,640・200乱数平均68,791.76となり、公開端点差は0だった。
- AppMediaは200乱数点の算術平均をoracleとして公開しないため、平均値はAtlas式とbinary32境界から導出したFGO Lab値として区別する。
- `np-function:standard`へgoldenとexternal differentialを接続し、このsubjectだけvalidatedへ昇格した。特殊8種とeffect operationはprovisionalを維持する。
- 標準Functionかつprovisional effectを使わない単発計算・rankingだけが、環境flagなしで`exact`となる。

最新検証結果:

- `pnpm typecheck`: success
- `pnpm test`: 20 files / 126 tests passed
- `pnpm lint`: success
- `pnpm build`: success
- `pnpm validate:master`: 2 files / 13 tests passed、artifact validation success

次の優先事項は、特殊8種goldenをChaldea実行結果とのdifferentialへ引き上げること、およびevidence inventoryを公開ゲートとして固定することである。

## 実装チェックポイント 5: evidence inventory公開ゲート

- Commit: `8191084 test(calc): enforce evidence inventory gate`
- registryの必須20 subjectが過不足なく存在することを検査する。
- registryが参照する全golden case ID・differential case IDが版付きfixtureに存在することを検査する。
- validated subjectは一次・外部sourceと、少なくとも一件のgoldenまたはdifferentialを必須とする。
- master normalization goldenを追加し、公開manifestのschema、bytes、SHA-256、master version、収録件数、Function別件数へ実artifactを照合する。
- `pnpm validate:evidence`をCIと手動Pages deployの必須stepへ追加した。環境flagによる公開判定は復活させない。

最新検証結果:

- `pnpm test`: 22 files / 130 tests passed
- `pnpm validate:evidence`: 2 files / 10 tests passed
- `pnpm typecheck`: success
- `pnpm lint`: success
- `pnpm build`: success
- `pnpm validate:master`: artifact validation success

## Q4完了判断

Q4-D7により、特殊8種の完全なChaldea実行differentialは実施しない。該当evidenceをprovisional、結果をapproximateに維持することで検証不足を明示する。

標準Functionの外部端点比較、特殊Function golden、状態特性とBattle Pointの修正、schema・engine・masterの破壊的更新、単発計算とrankingの共通precision評価、evidence inventory公開ゲートが完了したため、Q4を完了と判定する。
