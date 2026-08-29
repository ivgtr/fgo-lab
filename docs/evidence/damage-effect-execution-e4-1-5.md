# E4.1.5 canonical activation facts completion

## Outcome

Activation stateを、action内の一次状態である`ActivationFact`と、effect包含を表す`EffectDecision`へ分離した。利用effect一覧の永続化、effect別fact filtering、consumer同期、invalid consumerによるdecision書き換えは削除した。E5には着手していない。

## Final model and boundaries

- Scenario: canonical順の`activationFacts`と`effectDecisions`だけを保存する。
- Compile: 全activation conditionへ`origin / sourceInstanceId / skillId`からなるtyped source identityを付与し、一時的なrequirement indexを生成する。
- Application: 利用者が操作したfactだけを追加・置換・削除し、全compiled operationから参照されないfactをpruneする。visible effectに限定せず、hidden mutation、card mutation、linked prerequisite、NP前mutationを含む。
- Executor: `buildActivationContext()`を一度だけ実行し、condition evaluatorとconstraint evaluatorが同じimmutable contextを読む。
- Ranking: UI commandを使用せず、同じpure activation serviceで有限candidateをmaterializeして同じexecutorへ渡す。

`all`、`any`、別choice candidate、未選択を三値で区別する。実行対象となる各operationを個別に検証し、必要fact欠落、unknown／orphan fact、choice競合、source quantity空積、非canonical順をscenario全体の`invalidActivationContext`としてfail-closedにする。invalid時はoperationを一件も実行せず、decisionやdamage inputを部分変更しない。

## Production inventory

master `20260828.2`の全effect監査結果:

| 項目 | 件数 |
| --- | ---: |
| activation条件を持つサーヴァント | 33 |
| activation条件付きeffect | 106 |
| choice | 82 |
| operation trigger | 23 |
| source quantity | 13 |
| 複数effectが共有するcanonical fact | 20 |
| 共有factを読むeffect合計 | 68 |
| 複数factを要求するdecision | 12 |

damage-relevant effectは39件（choice 34、trigger 5、source quantity 5）。標準ランキング420件で保存されるfactはchoice 12、trigger 3、source quantity 1の計16件、13騎である。fact key重複、included activation-local effectのunresolved、calculator/ranking差分はいずれも0件。

同一skill IDを持つ別support source instanceはsource identityが異なるためfactを共有しない。現productionで異なるsource間のcanonical key衝突は0件。source quantityの複数range subjectは現productionで0件だが、空積はunit testでfail-closedに固定した。

## Regression and damage audit

- 既存1,504 calculated scenarioのinput／NP1〜5 digest: `e754617b09edeacf9661fb95d7b814bfd178e07c1827d0df16224cd02ce33b77`で不変。
- 420攻撃宝具の既定scenario: 全件calculator parity、implementation unsupported 0。
- 標準ranking digest、既知golden、MLB-only、ジョン、ハベトロット、トネリコ、一夏の城、proc代表値: 不変。
- 紅閻魔、ブレエリ、シャルロット、ククルカン、玉兎のchoice／hidden mutationと、operation trigger 3騎をfocusedおよびproduction testで固定。
- 意図的なdamage変更、新規inputRequired、新しいUI入力: 0件。

## Versions and UI

- Scenario schema: 30（破壊的更新）
- Engine: 24.0.0
- Master schema: 33（据え置き）
- Master artifact: `20260828.2`（据え置き）

Master conditionはsource-independentな正規形を保持し、typed source identityはoperation compile時に対称に付与できるため、raw文字列解析やmaster fallbackは追加していない。

Reactの表示構造、CSS、visible effect文言、操作位置は変更していない。VRTの差分は結果欄のengine version `23.0.0 → 24.0.0`の数字13〜19 pixelだけであることをdiff画像で確認し、version metadataとして3基準画像を更新した。更新後のdesktop／390px／320px VRT、横overflow、section densityは一致した。

## Quality gates

- format / ESLint / TypeScript: pass
- Vitest: 69 files / 370 tests pass
- Master validation: 7 files / 68 tests pass、artifact validation pass
- Evidence validation: 2 files / 10 tests pass
- Production build: 214 modules、main 532.99 kB（gzip 150.94 kB）、CSS 44.93 kB（gzip 9.29 kB）、ranking worker 208.49 kB
- Benchmark: 361.24 ops/s、mean 2.7683 ms（NP1-5 / 200 random values）
- Playwright: 62 pass / 30 project-conditional skip。functional、a11y、ranking、share/save、choice/hidden/proc、desktop／390px／320px VRTを確認。初回6 worker実行時のdensity test timeoutは単独および4 worker全件再実行でpass。
- `git diff --check`: pass

## E5 gate

consumer由来の派生永続状態はなく、schema/application/executor/rankingが単一のactivation fact契約へ収束した。全品質ゲートの最終再実行とclean worktree確認後、E5 blockを解除できる。
