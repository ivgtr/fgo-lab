# Damage quality Q4 checkpoint

- Date: 2026-08-25
- Phase: Q4
- Status: in progress
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

Q4は継続する。次のゲートはFunction別golden／differentialであり、現時点ではFunction evidenceをvalidatedへ昇格しない。
