# ADR-002: ローカル保存とmigration

- Status: accepted
- Date: 2026-08-24

IndexedDBをrepository interface越しに利用する。ユーザー領域とmaster領域を分け、migration/importは事前backup、staging検証、単一transaction切替、失敗時旧版維持の順に行う。R1 schemaは複数profileを保持するがUIはactive profileだけを表示する。
