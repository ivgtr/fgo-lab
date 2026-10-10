# データ出典と画像の扱い

| 対象 | 出典 | 扱い |
| --- | --- | --- |
| JP構造化ゲームデータ | Atlas Academy API / static export | ODC-BY 1.0。取得元・データ版・checksum・変換版をmanifestへ記録 |
| 戦闘仕様 | Atlas Academy fgo-docs | 数式とfloat32挙動の参照元 |
| サーヴァント等の画像 | Atlas Academyが示す画像URL | 構造化データと分離し、非営利用途で表示。取得失敗時は名称表示 |
| クラス・カード画像 | Atlas Academyの公開画像素材 | 取得元・データ版またはcommit・checksumを画像manifestへ記録 |

構造化データは用途に必要な項目へ正規化した版付きmirrorとして配信します。変換後のmasterにも取得元と版を保持します。画像の権利は各権利者に帰属し、構造化データのライセンスを画像への利用許諾として扱いません。

権利者または上流から指摘があった場合は、画像機能を無効化し、該当画像を配信から外します。本プロジェクトはFate/Grand Orderの公式サービスと関係ありません。
