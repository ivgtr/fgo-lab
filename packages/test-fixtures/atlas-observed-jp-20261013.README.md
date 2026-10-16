# 固定Atlas公開応答

`atlas-observed-jp-20261013.tar.gz`は2026-10-12 19:05 UTCにAtlas Academyの公開JP APIから取得した13個のexportと、参照閉包で必要な25個のskill応答をそのまま格納する。SHA-256は`a8b19b5df248d402cc15be2069b7d3b633e8d910d5f77c890e6b5ff53b950892`。出典は[Atlas Academy](https://atlasacademy.io/about-us/)と[公開API](https://api.atlasacademy.io/openapi.json)。ゲームデータの製品配信には使わず、Nodeと実ブラウザーWorkerの同一入力検証だけに使う。

この固定応答は現行データの独立したraw出典を単独では証明しない。監査側のraw/API再生とbytes照合が証明書発行の条件である。試験成功のためにこのアーカイブや回帰期待値を再生成しない。

`atlas-observed-jp-20261013.certificate.json`は、固定raw/API再生と38応答のbytes一致を通して発行した開発用証明書である。ローカルの`pnpm dev`（`pnpm dev:local-certificate`も同じ）は開発専用routeからこれを取得する。ゲームデータ本文はAtlas APIから直接取得し、証明書と違う応答は拒否する。公開buildではこのrouteは404を返す。
