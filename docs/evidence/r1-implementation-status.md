# R1 implementation status

- Recorded: 2026-08-24
- App version: 0.1.0
- Schema version: 1
- Engine version: 1.0.0
- Master: `2026-08-24-atlas-jp-skills`
- Release status: internal preview; exact public release gate is not satisfied

## Implemented vertical slices

- GitHub Pages向けの静的Vite/Reactアプリ、CI、レスポンシブナビゲーション
- checksum付きマスターmanifest、staging検証、atomic active切替、前回正常版fallback
- Atlas JPから469騎、攻撃宝具420騎、礼装2,700枚、素材152種、スキル要約1,770件を正規化
- 複数プロフィール対応schemaと、有効プロフィールのIndexedDB自動保存
- NP0未所持、現在値／育成目標、再臨、スキル、アペンド、フォウ、Undo
- 物理コピー単位の概念礼装登録、Lv／限界突破編集、ATK導出
- Atlasスキル由来の支援元スタック、スキル使用状態とLvの保存
- float32演算境界、乱数900〜1099の200件評価、NP1〜5結果、直接入力、内訳・警告
- 全攻撃宝具をWorkerで計算するランキングと、所持・クラス・カード・範囲・レアリティfilter
- スキル・再臨・アペンド素材とQPの育成台帳、使用先内訳、検索・カテゴリ・並び順
- session単位の履歴確定、fingerprint重複排除、直近20件、ドラフト復元
- backup export、検証・件数preview、事前backup必須のatomic全置換
- URL fragment共有、版不一致時の履歴結果表示、許可リストJSON、結果PNG
- Web App Manifest、service worker、オフライン再起動とcache使用状態表示
- 320px、Chromium/mobile Chromium、axe serious/critical 0件の自動テスト

## Unsatisfied R1 release gates

1. 特殊宝具8種はFunction分類済みだが、独立golden/differential根拠が未完である。`damageNp`以外のhandlerは`approximate`、条件不足は`unsupported`を返し、UI全体もfail-closedで`approximate`表示する。`VITE_ENGINE_RELEASE_VALIDATED=true`は設定しない。
2. Atlasスキルは表示・保存できるが、対象、発動順、条件を解決して計算バフへ展開するeffect resolverは未完である。自身スキル、支援条件、魔術礼装を自動計算へ含めない。
3. 育成台帳は通常素材とQPを集計するが、レベル別経験値曲線、星5種火数、聖杯、サーヴァントコインを内部マスターへ正規化していない。推測値は表示しない。
4. 画像URLは構造化データと分離して保持するが、Blob cacheと画像表示UIは未実装である。名称・数値fallbackのみ動作する。
5. IndexedDB schemaは初版v1であり、実データを伴うv0→v1 migration drillは存在しない。未知の将来版は拒否する。
6. WebKitバイナリは取得済みだが、ローカルホストに必要な共有ライブラリがなく未実行である。CI既定はChromiumとmobile Chromiumである。

## Verification record

2026-08-24の最終確認では、format、lint、TypeScript、33 unit/golden tests、master validation、production build、Chromium/mobile Chromium E2E、axeを実行した。計算benchmarkはNP1〜5と200乱数の一括計算が平均約0.43〜0.47msだった。

公開前には上記未完ゲートを閉じ、全コマンドを再実行する。GitHub Pagesはrepository SettingsでPagesのsourceをGitHub Actionsへ設定し、manual deploy workflowを実行する。収益化や再配布へ用途を変える場合はデータ・画像・商標の条件を再審査する。
