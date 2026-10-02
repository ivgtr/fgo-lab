---
title: "ADR-003: マスターデータ配信"
status: "accepted"
date: "2026-08-24"
---

# ADR-003: マスターデータ配信

- Status: accepted
- Date: 2026-08-24

Atlas AcademyのJP静的exportをpipeline入力とし、正規化したimmutable版をGitHub Pagesから配信する。manifestは各fileのbytesとSHA-256、最小app版、取得元を持つ。candidateをstagingで完全検証後、active pointerだけをtransactionで切り替える。現行と直前正常版を保持し、画像manifestは分離する。
