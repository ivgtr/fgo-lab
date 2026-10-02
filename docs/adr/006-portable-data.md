---
title: "ADR-006: backupと共有の境界"
status: "accepted"
date: "2026-08-24"
---

# ADR-006: backupと共有の境界

- Status: accepted
- Date: 2026-08-24

`UserDataBackup`は全profileを含む復旧用データ、`CalculationShareSnapshot`は一計算の許可リストとする。共有snapshotにprofile ID、所持一覧、メモを含めない。URL fragmentは8 KiBを安全上限とし、超過時は共有専用JSONか画像を案内する。
