# ダメージ計算品質 Q5 監査・置換計画

更新日: 2026-08-25  
状態: 完了（確認待ち）

## 1. 判定

Q5開始時点の単発計算は、永続化境界では`CalculationScenario`を使用していたが、UIから計算applicationへ至る実行境界では`DamageResolutionInput + CalculationEditorState`へ戻していた。このため`CalculationScenario`は計算の唯一の正本になっていなかった。

draft、履歴、共有のschema、session境界、共有snapshotの整合性、結果根拠の表示を、scenarioを直接受け取るapplication facadeへ収束させた。旧editor state、selection変換、旧application入口は併存させず削除した。

## 2. 実装差分と優先度

### P0: 計算結果の正しさ・再現性

1. `App`は保存済みscenarioを`damageResolutionInputFromScenario()`と`selectionFromScenario()`で二つの中間値へ復元し、`calculateResolvedDamage()`へ渡している。scenarioから計算までの経路が一つではなく、変換の欠落や二重適用を型で防げない。
2. draft保存時は、先に組み立てたscenarioではなく、その生成元である`nextInput + selection`を再び計算している。保存されたscenarioと保存resultが同じfacade呼出しから得られたことを保証できない。
3. manual scenarioはscenario共通項目と`manual`入力に攻撃者・対象・相性等を重複保持する。不一致な値をschemaが許し、UI表示と計算値が分離し得る。
4. 共有snapshotはscenarioとresultの組をschema検証するだけで、同じmaster・engine・scenarioから再現したresultとの一致を確認しない。異なるmaster版のsnapshotでは、現行masterから作った入力表示と共有時resultを同じ画面に出している。

### P1: 履歴の意味

1. `calculationSessionId`は`App`のmount時に一度だけ発行され、計算画面を開くたびには更新されない。
2. `finalizeHistory()`は直前fingerprintの重複だけを抑止し、同一sessionから複数履歴が確定することを防がない。
3. URL・画像共有は履歴を確定するが、共有JSONは確定しない。
4. 有効な結果がない初期状態や`unsupported`結果も、画面離脱だけで履歴になり得る。

### P2: 根拠の可視性

1. 結果詳細はassumptionとissue codeだけを表示し、breakdown、trace、evidence、precisionの判定理由を表示していない。
2. `unsupported`時の`missingEvidence`を表示せず、数値を出さない理由を利用者が追えない。
3. 共有カードはDB版だけを表示し、engine版とprecisionを共有結果から確認できない。

## 3. 収束先

計算経路を次の一方向へ固定する。

```text
Calculator UI
  -> CalculationScenario
  -> calculateScenario(scenario, master, versions)
  -> scenario resolver / effect resolver
  -> damage kernel
  -> CalculationExecution { scenarioInput, input, effects, warnings, result }
  -> draft / history / share / result UI
```

- quickは`resolved` scenarioだけを編集する。master由来のATK、NP倍率、効果集約値をscenarioへ保存しない。
- manualは最終`DamageResolutionInput`だけを保持する独立unionとし、resolved側の選択や共通項目を重複保持しない。
- application facadeがscenario検証、master参照、Function適用、effect解決、kernel実行、evidence評価を一回で行う。
- UIはfacadeが返した効果適用前の`scenarioInput`と適用後の`input`を表示・mode切替に使うが、適用後の数値からquick scenarioを逆変換しない。
- draft、履歴、共有は同じscenarioと同じfacade resultを保存する。
- master・schema・engineが現行契約と一致しない共有は現行計算画面へ取り込まない。旧結果表示の互換経路は設けない。
- calculation sessionは計算画面へ入るたび発行し、一sessionにつき最大一履歴をupsertする。

## 4. 実装スライス

### Q5-S1: scenario application facade

- `calculateScenario()`とdefault resolved scenario builderを`calculation-application`へ追加する。
- effect resolverを`resolved` scenarioの選択値から呼び出す。
- manual scenarioの重複fieldを削除し、schema・engine版を更新する。
- quick/manual同値テストをapplication packageへ置く。

### Q5-S2: Web UI直結

- `Calculator`の編集値を`CalculationScenario`へ置換する。
- `scenarioFromDamageResolutionInput()`、`selectionFromScenario()`、`damageResolutionInputFromScenario()`と旧計算呼出しを削除する。
- draft保存は`calculateScenario(nextScenario, ...)`の一結果だけを保存する。

### Q5-S3: session・履歴

- 計算画面entryごとにsession IDを発行する。
- 同一sessionの再確定は同じ履歴行を更新し、新規行を増やさない。
- fingerprint一致時の直前履歴再利用と直近20件制限を維持する。
- URL、画像、共有JSONの全共有操作を同じfinalize経路へ接続する。

### Q5-S4: 共有境界

- share snapshot builderを一箇所に置き、許可リストをschemaで固定する。
- 読込時に現行master版を要求し、scenarioをfacadeで再計算する。
- snapshot resultは再計算結果との一致検証にだけ使用し、不一致なら共有全体を拒否する。

### Q5-S5: 結果根拠と公開ゲート

- status、precision、breakdown、assumption、issue、trace、evidence、missing evidenceを結果詳細へ表示する。
- quick/manual同値、session一件、share round-trip、旧版拒否、単一facade利用をunit/contract/E2Eで固定する。
- test、typecheck、lint、build、evidence/master validationを通す。

## 5. Q5確認ゲート

- 同じ最終入力を表すquickとmanualが同じNP1〜5の行を返す。
- UI、draft、history、shareが`calculateScenario()`以外の計算application入口を呼ばない。
- 一つのsessionから履歴が一件だけ確定し、再共有では同じ行が更新される。
- 同じmaster・engine・scenarioの共有元と共有先が同じresultを返す。
- 旧schema、旧engine、異なるmaster、不整合なscenario/resultの共有を現行結果として表示しない。
- 結果画面だけでprecisionと、その根拠・仮定・警告・traceを確認できる。

## 6. 実装進捗

### 完了

- `calculateScenario(scenario, master, versions)`を追加し、単発計算とdraft結果生成を保存対象scenarioから直接実行するようにした。
- resolved scenarioのmaster参照、NP Function適用、effect解決、kernel、evidence評価をapplication facade内の一方向処理へまとめた。
- 同値のresolved/manual最終入力が同じNP1〜5行を返すapplication testを追加した。
- 計算画面へ入るたび新しいsession IDを発行するようにした。
- `finalizeHistory()`へ同一sessionのupsert、直前fingerprint重複時のsession引継ぎ、unsupported結果の非確定を実装した。
- URL、画像、共有JSONを同じ履歴確定経路へ接続した。
- 履歴モーダルから過去scenarioを新session・新draftへコピーし、現行masterで再計算するようにした。
- 共有読込時に現行master版を要求し、snapshotのversion contextでscenarioを再計算してresult全体が一致した場合だけ受理するようにした。旧版result表示経路は削除した。
- 履歴・共有の確定では解決済みinputからscenarioを逆生成せず、現在のscenarioそのものを保存するようにした。
- 結果詳細へprecision、breakdown、assumption、issue detail、trace、evidence、missing evidenceを表示し、共有カードへengine版とprecisionを追加した。
- manual scenarioを`{ mode: 'manual', manual: DamageResolutionInput }`だけのstrict unionへ変更し、resolved共通fieldとの二重保持を削除した。schema version 8・engine version 5.0.0へ更新し、旧形式の互換読込は追加していない。
- `Calculator`を`CalculationScenario`の直接編集へ置換し、quickはresolved scenario、directはmanual scenarioだけを更新するようにした。
- resolvedからmanualへ切り替える際は、effect適用後の`input`ではなく効果適用前の`scenarioInput`を使用し、passive・礼装・skillの二重適用を防いだ。
- 特攻宝具の対象traitを「適用条件」としてscenarioへ直接反映し、skill効果のon/offと混同しないUIへ分離した。
- `CalculationEditorState`、旧editor schema、scenario/selection相互変換、`calculateResolvedDamage()`、`resolveCalculationInput()`と対応する旧adapter testを削除した。
- ranking候補の組立もresolved scenarioと`resolveScenario()`を使用し、Web独自のselection変換を削除した。worker自体のscenario facade統合はQ6で扱う。
- share allowlistは再現に必要な自身skill ID・levelを含め、所持編成、礼装copy IDなどの個人データを含めない契約に固定した。
- 全付与元goldenをscenario facadeのintegration testへ移し、効果適用前入力が補正値ゼロ、適用後入力が期待集約値になることを固定した。

## 7. 最終検証

2026-08-25時点で次を確認した。

- `pnpm test`: 22 files / 129 tests成功（削除した旧adapter testを含まない）
- `pnpm validate:evidence`: 2 files / 10 tests成功
- `pnpm typecheck`: 成功
- `pnpm lint`: 成功
- `pnpm build`: 成功
- `pnpm validate:master`: artifact検証成功、3 files / 14 tests成功
- `pnpm exec playwright test --workers=1`: 25件成功、17件project条件によるskip
- 旧editor state、旧selection変換、旧application入口の参照検索: 0件

Q5確認ゲートはすべて成功した。Q6でranking workerを同じscenario facadeへ接続する前に、Q5完了承認を得る。
