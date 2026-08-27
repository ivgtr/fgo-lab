# Damage effect execution E3.11 completion report

- Date: 2026-08-27
- Scope: canonical計算契約を維持した、スキル・火力効果UIのコンパクト化。E4は未着手。
- Scenario schema: 25
- Master schema: 30
- Master data: `20260827`
- Engine: `18.0.0`

## 結果

source activation、effect inclusion、condition evaluation、proc selection、visibilityの分離は維持した。
画面ではこれらを別々の常設操作へ露出せず、applicationのpresentation commandが一つの効果チップ操作を
必要なsource activation、effect inclusion、effect-local condition decisionへatomicに展開する。
HP、スター数、敵数などevaluatorが所有する条件はチップ操作から強制成立させない。

攻撃役と支援役のスキル行から独立した「使用する／使用中」列を削除し、アイコンと名称の領域を
`aria-pressed`付きtoggleにした。効果チップから「条件成立として計算」等の別ボタンを削除し、通常効果は
効果名と「値・短い由来」の2行以内へ収めた。完全なsource名、条件、確定／確率、選択状態は
accessible nameとtitleへ残した。

通常の入力なし効果は内容幅で折り返し、数量入力を持つ効果だけ必要幅を確保する。排他的条件は効果チップ
自体をsingle-choiceとし、別の全幅条件ボタンを生成しない。

## Presentation activation dependency

表示された終端効果が別の攻撃役スキルによるhidden trait／field mutationを必要とする場合、executorは
typed operationのsource ownership、trait mutation、condition relationから`activationSources`を導出する。
applicationは効果チップON時にこのsourceも有効化する。servant ID、skill名、labelによる分岐はない。

productionで複数のactivation候補を持つ表示効果は0件だった。ガレスでは陽射し条件の攻撃力アップを
一回選ぶと対応スキルとhidden陽射し付与が有効になり、効果だけを除外してもsourceとmutationは維持される。
既存のattacker-skill context mutation 26件と到達可能性ratchetも維持した。

## レイアウト比較

比較元は膨張後UIの`4658529`。高さはCSS推測ではなく、Chromiumで各viewportを実測した。

| viewport | スキル高 before | スキル高 after | 効果高 before | 効果高 after | 通常chip平均 before | after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Desktop 1280px | 257.34px | 239.39px | 252.30px | 117.13px | 51.60px | 42.00px |
| 390px | 476.91px | 242.08px | 252.30px | 117.13px | 51.60px | 42.00px |
| 320px | 501.70px | 292.59px | 291.23px | 213.91px | 61.33px | 42.00px |

全viewportでhorizontal overflowは0、入力なし全幅chipは0件。PC、390px、320pxのfull-page VRTと、
390pxの選択状態VRTを固定した。レイアウトテストは4件の通常効果、section height、平均chip height、
overflow、全幅化件数を数値ratchetとして検査する。

## 計算非退行

production既定420件のdamage digestは
`9d67d4d84b715e3f2eda8f5ed317496c1df69d175982f25c09e732280f7a3603`のまま。
旧unsupported代表25件の単独選択digest
`f08bebaaeaa638ae8910cb74cf4f81f29d725e9fb710a6ee923ce5df4df3d17f`も不変である。

水着ハベトロット、ダンテ、カエサル、杉谷善住坊、ドゥリーヨダナ、ガレス、玉兎、OR条件代表で、
チップ操作、source activation、条件・proc decision、hidden mutation、damage、share round-tripを確認した。
確定効果の個別除外、確率効果の成功／失敗、連鎖成功回数、排他条件の意味論に変更はない。

## 品質ゲート

- format / lint / typecheck: 成功
- unit / integration / property / golden: 48 files、268 tests
- master validation: 6 files、55 tests
- evidence validation: 2 files、10 tests
- production build: 181 modules、main 483.66 kB（gzip 138.28 kB）、CSS 38.61 kB（gzip 8.24 kB）、worker 99.92 kB
- benchmark: 436.31 ops/s、mean 2.2919 ms
- Playwright Chromium / mobile Chromium: 55 passed、23 skipped
- desktop / 390px / 320px VRT、keyboard、a11y、URL/share/save: 成功
- `git diff --check`: 成功

E3.10比でmain bundleは+2.80 kB（gzip +0.68 kB）、workerは不変。増分はpresentation command、
activation dependency metadata、短縮表示とaccessible state生成による。damage kernelは変更していない。

## コミット

- `9a52fef docs(ui): restore compact effect interaction contract`
- `ea6715d feat(calc): map effect chips to canonical decisions`
- `4b3ee4b refactor(calc): expose presentation activation dependencies`
- `1ddecc4 fix(calc): activate actor-owned effect prerequisites`
- `8f0310b refactor(web): restore compact skill and effect controls`
- `0a238c0 test(web): ratchet compact calculator interactions`
- `f933df6 test(web): align choice selectors with compact labels`

E4ランキング統合は実装していない。本フェーズの単発計算契約とUI密度ratchetが完了したため、次フェーズで
同じscenario/application/executor境界を再利用できる状態である。
