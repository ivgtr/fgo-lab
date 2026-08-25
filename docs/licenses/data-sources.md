# データ出典台帳

| 対象                 | 出典                              | 扱い                                                            |
| -------------------- | --------------------------------- | --------------------------------------------------------------- |
| JP構造化ゲームデータ | Atlas Academy API / static export | ODC-BY 1.0。取得日時・上流URL・checksum・変換版をmanifestへ記録 |
| 戦闘仕様             | Atlas Academy fgo-docs            | 数式とfloat32挙動の一次根拠として出典表示                       |
| サーヴァント等の画像 | Atlas Academyが示す画像URL        | 非営利用途、遅延cache、構造化データと分離、名称fallback         |
| 絞り込み用クラスPNG | Atlas Academy JP ClassIcons       | 取得元・データ版・checksumを画像manifestへ記録                  |
| 絞り込み用カードPNG | Atlas Academy DB公開画像素材      | 取得元commit・checksumを画像manifestへ記録                       |

公開artifactは原データそのものではなく、用途に必要な項目へ正規化した版付きmirrorとする。権利者または上流から指摘があった場合は画像feature switchを無効化し、画像artifactだけを配信から外す。
