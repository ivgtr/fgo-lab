# Damage effect execution E3.12 completion report

- Date: 2026-08-27
- Scope: 攻撃役の火力effect操作を`自身の適用内容`へ一本化。E4は未着手。
- Scenario schema: 26
- Master schema: 30
- Master data: `20260827`
- Engine: `19.0.0`

## 最終構造

攻撃役の自身skill欄からsource activation button、`aria-pressed`、check markを削除した。skill欄はicon、名称、
Lv、保存／仮想／一時値、resetだけを表示し、攻撃役の火力effectを変更するUIは`自身の適用内容`のchipだけである。
支援構成のskill単位選択は独立した利用者入力なので維持した。

scenarioの`attackerSkills`は`skillId`と`skillLevel`だけを保存する。executorは各計算で選択中のvisible terminal
effectを列挙し、effect自身のsourceと`activationSources`を辿って必要sourceの閉包を作る。同じsourceを必要とする
terminal effectが残る間だけsourceを維持し、最後のeffectを外すとhidden field／trait mutationも実行候補から外す。
incrementalなattacker source activation状態と旧`enabled` fieldは残していない。

exclusive conditionの兄弟decisionに明示値がない場合、操作可能であることを選択済みと誤認しないよう修正した。
productionのfield／trait hidden mutationでは、選択時に必要sourceへ到達できない組合せ0件、最後の依存effect解除後に
mutationが`applied`で残る組合せ0件である。

## Chained proc

連鎖procは成功回数だけを正とし、effect exclusionを二重保存しない。カエサルは成功回数0だけchip OFF、1〜5はON、
chip OFFで0、chip ONで5へ更新する。成功回数とNP1平均は次のgoldenで固定した。

| 成功回数 | chip | attack buff | NP1平均 |
| ---: | --- | ---: | ---: |
| 0 | OFF | 0% | 54,130.230 |
| 1 | ON | 10% | 59,530.825 |
| 2 | ON | 20% | 64,931.400 |
| 3 | ON | 30% | 70,331.980 |
| 4 | ON | 40% | 75,732.555 |
| 5 | ON | 50% | 81,133.125 |

成功回数0と2のshare round-trip、chipのkeyboard操作、0→5→2のUI・damage因果関係をE2Eで確認した。

## Production inventoryと計算非退行

- 攻撃宝具: 420
- projection: user 1,606 / automatic visible 0 / hidden 695
- 攻撃役の独立source activation UI: 0
- 操作不能なvisible terminal firepower effect: 0
- field／trait context mutation: 26（terminal effectから到達して適用可能17、火力依存を持たず非適用9）
- 選択時の必要mutation source欠落: 0
- 最後の依存解除後のstale mutation適用: 0
- proc inputとchip active状態の不一致: 0
- inert control / partial commit / implementation unsupported: 0

production既定420件のdamage digestは
`9d67d4d84b715e3f2eda8f5ed317496c1df69d175982f25c09e732280f7a3603`でE3.11から不変。
旧source-level activationを入力として再現する1,504比較fixtureは、独立activationを削除した現行scenario意味論へ
更新し、digestを`54b6ca9663afd95c5b686c49a33bd679246deb43bd7fae45a87b32b91fa4ca48`に固定した。
damage kernel、既定damage、既知proc／MLB／HP／count goldenに差分はない。

## UI密度

E3.11のcompact layoutを維持し、skill rowを静的表示へ戻した。Chromium実測値は次のとおり。

| viewport | skill section | own effects | inputなしchip平均 | horizontal overflow | 全幅chip |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1280px | 239.39px | 117.13px | 42.00px | 0 | 0 |
| 390px | 240.08px | 117.13px | 42.00px | 0 | 0 |
| 320px | 286.59px | 213.91px | 42.00px | 0 | 0 |

PC、390px、320pxのVRT、選択状態、focus、accessible nameを固定した。通常chipの横並び、2行以内の短縮表示、
数量入力だけが必要幅を取るresponsive構造に変更はない。

## 品質ゲート

- format / lint / typecheck: 成功
- unit / integration / property / golden: 49 files、270 tests
- master validation: 6 files、55 tests
- evidence validation: 2 files、10 tests
- production build: 181 modules、main 484.16 kB（gzip 138.54 kB）、CSS 38.35 kB（gzip 8.24 kB）、worker 99.91 kB
- benchmark: 376.36 ops/s、mean 2.6570 ms（単独実行。damage kernel変更なし）
- Playwright Chromium / mobile Chromium: 55 passed、23 skipped
- desktop / 390px / 320px VRT、keyboard、a11y、URL/share/save: 成功
- `git diff --check`: 成功

E3.11比でmain bundleは+0.50 kB（gzip +0.26 kB）、CSSは-0.26 kB、workerは-0.01 kB。増分は
activation closureと厳格なscenario validationによる。benchmarkの短期変動はあるが、calc kernelと最終damage inputは
変更しておらず、production digestと全goldenで計算非退行を確認した。

## コミット

- `8c7b2c2 docs(calc): make effect chips the sole attacker control`
- `bedcf41 refactor(calc)!: derive attacker activation from effect decisions`
- `e2e9bc7 refactor(web): make own effects the sole attacker control`
- `2030306 test(web): lock sole attacker effect interactions`
- `45c396c test(web): ratchet static attacker skill layout`
- `57d74c7 fix(calc): eliminate residual attacker activation state`
- `192cd3a test(calc): ratchet attacker activation closure`

E4ランキング統合は実装していない。単発計算の唯一操作点、scenario、dependency closure、executor、layout ratchetが
確定した状態で停止する。
