"""Rebuild FGO Lab's Atlas API inputs from pinned public source and raw commits."""

import argparse
import asyncio
import json
import subprocess
from pathlib import Path

import orjson

from app.config import EXTRA_SVT_ID_IN_NICE, Settings, project_root
from app.core.nice.battle_point import get_all_nice_battle_points
from app.core.nice.nice import get_nice_skill_with_reverse
from app.db.engine import async_engines
from app.db.helpers import fetch
from app.db.load import update_db
from app.models.raw import TABLES_TO_BE_LOADED
from app.export.constants import export_constants
from app.schemas.common import Language, Region
from app.schemas.enums import ALL_ENUMS, TRAIT_NAME
from app.schemas.raw import MstBattlePoint, MstEquip, MstItem, MstSvt
from app.tasks import (
    ExportUtil,
    dump_nice_battle_points,
    dump_nice_items,
    dump_nice_mcs,
    dump_normal,
    dump_svt,
    get_nice_items_from_raw,
    load_svt_extra,
)

REQUIRED_EXPORTS = (
    "NiceAttributeRelation",
    "NiceCard",
    "NiceClass",
    "NiceClassAttackRate",
    "NiceClassRelation",
    "NiceConstant",
    "nice_battle_point",
    "nice_enums",
    "nice_equip",
    "nice_item",
    "nice_mystic_code",
    "nice_servant",
    "nice_trait",
)

# These source columns are currently absent from Atlas's SQL tables. Keep the
# complete list explicit so a new source column cannot disappear during replay.
# A raw revision change still requires the separate raw inventory review.
EXPECTED_IGNORED_COLUMNS = {
    "mstBlankEarthSpot": {"script"},
    "mstBoxGachaBase": {"script"},
    "mstClassBoardBase": {"script"},
    "mstClassBoardClass": {"flag"},
    "mstEventSvt": {"svtStatusTypeOn"},
    "mstFuncDisp": {"targetId"},
    "mstGacha": {"gachaListGroupId", "featurePickupRarityGroupId"},
    "mstRestriction": {"priority"},
    "mstShopScript": {"commonReleaseId"},
    "mstSvtMultiPortrait": {"soloPhotoPosition"},
    "mstSvtPassiveSkill": {"condIndividuality"},
    "mstSvtTransform": {"script"},
}


def audit_ignored_columns(raw_path: Path) -> dict[str, list[str]]:
    observed: dict[str, set[str]] = {}
    for group in TABLES_TO_BE_LOADED:
        for table in group:
            path = raw_path / "master" / f"{table.name}.json"
            if not path.is_file():
                continue
            rows = orjson.loads(path.read_bytes())
            if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
                raise ValueError(f"invalid_raw_table:{table.name}")
            column_names = {column.name for column in table.columns}
            unknown: set[str] = set()
            for row in rows:
                unknown.update(set(row) - column_names)
            if unknown:
                observed[table.name] = unknown
            if table.name == "mstSvtPassiveSkill":
                for row in rows:
                    if "condIndividuality" not in row:
                        raise ValueError("missing_passive_trait_condition")
                    trait = row.get("condIndividuality")
                    if trait == []:
                        continue
                    script = row.get("script")
                    if (
                        trait != [184]
                        or row.get("eventId") != 80586
                        or row.get("skillId") != 940414
                        or not isinstance(script, dict)
                        or script.get("condIndividuality") != trait
                    ):
                        raise ValueError("unclassified_passive_trait_condition")
    if observed != EXPECTED_IGNORED_COLUMNS:
        raise ValueError(f"unclassified_raw_columns:{observed}")
    return {table: sorted(fields) for table, fields in sorted(observed.items())}


def git_head(path: Path) -> str:
    return subprocess.run(
        ["git", "-C", str(path), "rev-parse", "HEAD"],
        check=True,
        text=True,
        capture_output=True,
    ).stdout.strip()


def references(path: Path) -> list[int]:
    value = json.loads(path.read_bytes())
    if not isinstance(value, list) or any(type(item) is not int or item <= 0 for item in value):
        raise ValueError("invalid_reference_ids")
    if value != sorted(set(value)):
        raise ValueError("reference_ids_must_be_sorted_unique")
    return value


async def replay(raw_path: Path, ids: list[int]) -> dict[str, object]:
    settings = Settings()
    if (
        set(settings.data) != {Region.JP}
        or Path(settings.data[Region.JP].gamedata).resolve() != raw_path.resolve()
        or not settings.write_postgres_data
        or settings.write_redis_data
        or not settings.skip_script_fulltext
        or settings.export_all_nice
    ):
        raise ValueError("unsafe_or_incomplete_replay_config")
    export_path = project_root / "export" / "JP"
    export_path.mkdir(parents=True, exist_ok=True)
    if any((export_path / f"{key}.json").exists() for key in REQUIRED_EXPORTS):
        raise ValueError("replay_output_must_be_new")

    ignored_columns = audit_ignored_columns(raw_path)
    update_db({Region.JP: raw_path})
    await load_svt_extra(None, {Region.JP: raw_path})
    await export_constants({Region.JP: raw_path})
    await dump_normal(export_path, "nice_trait", TRAIT_NAME)
    await dump_normal(export_path, "nice_enums", ALL_ENUMS)
    util = ExportUtil(None, Region.JP, export_path)
    engine = async_engines[Region.JP]
    try:
        async with engine.connect() as conn:
            all_svts = await fetch.get_everything(conn, MstSvt)
            all_mcs = await fetch.get_everything(conn, MstEquip)
            all_items = await fetch.get_everything(conn, MstItem)
            all_battle_points = await fetch.get_everything(conn, MstBattlePoint)
            await dump_nice_mcs(conn, util, all_mcs)
            await dump_nice_battle_points(
                util, await get_all_nice_battle_points(conn, all_battle_points)
            )
        await dump_nice_items(util, get_nice_items_from_raw(util, all_items))
        servants = [
            svt
            for svt in all_svts
            if (svt.collectionNo != 0 and svt.isServant()) or svt.id in EXTRA_SVT_ID_IN_NICE
        ]
        equips = [svt for svt in all_svts if svt.collectionNo != 0 and svt.isEquip()]
        async with engine.connect() as conn:
            await dump_svt(conn, util, "nice_servant", servants)
        async with engine.connect() as conn:
            await dump_svt(conn, util, "nice_equip", equips)
        raw_passives = orjson.loads(
            (raw_path / "master" / "mstSvtPassiveSkill.json").read_bytes()
        )
        conditioned_owners = {
            row["svtId"] for row in raw_passives if row["condIndividuality"]
        }
        published_servants = orjson.loads((export_path / "nice_servant.json").read_bytes())
        published_conditioned_owners: set[int] = set()
        for servant in published_servants:
            if any(
                skill.get("id") == 940414
                for source in ("classPassive", "appendPassive")
                for skill in servant[source]
            ):
                raise ValueError("ignored_trait_condition_reaches_combat_passive")
            for skill in servant["extraPassive"]:
                if skill.get("id") != 940414:
                    continue
                if not skill["functions"] or any(
                    func.get("funcType") != "eventDropUp" for func in skill["functions"]
                ):
                    raise ValueError("ignored_trait_condition_reaches_non_drop_effect")
                published_conditioned_owners.add(servant["id"])
        if conditioned_owners != published_conditioned_owners:
            raise ValueError("ignored_trait_condition_owner_mismatch")
        refs_path = export_path / "referenced_skills"
        refs_path.mkdir()
        async with engine.connect() as conn:
            for skill_id in ids:
                skill = await get_nice_skill_with_reverse(
                    conn, None, Region.JP, skill_id, Language.jp
                )
                (refs_path / f"{skill_id}.json").write_text(
                    skill.model_dump_json(exclude_unset=True, exclude_none=True),
                    encoding="utf-8",
                )
        for key in REQUIRED_EXPORTS:
            if not (export_path / f"{key}.json").is_file():
                raise ValueError(f"missing_replayed_export:{key}")
        return {
            "servants": len(servants),
            "craftEssences": len(equips),
            "references": len(ids),
            "ignoredRawColumns": ignored_columns,
        }
    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-repo", type=Path, required=True)
    parser.add_argument("--raw-commit", required=True)
    parser.add_argument("--api-commit", required=True)
    parser.add_argument("--reference-ids", type=Path, required=True)
    parser.add_argument("--audit-only", action="store_true")
    args = parser.parse_args()
    raw_path = args.raw_repo.resolve(strict=True)
    if git_head(raw_path) != args.raw_commit or git_head(project_root) != args.api_commit:
        raise ValueError("replay_revision_mismatch")
    if args.audit_only:
        print(json.dumps(audit_ignored_columns(raw_path), sort_keys=True))
        return
    ids = references(args.reference_ids)
    result = asyncio.run(replay(raw_path, ids))
    marker = project_root / "export" / "JP" / "fgo-lab-replay.json"
    with marker.open("x", encoding="utf-8") as file:
        json.dump(
            {
                "format": "fgo-lab-atlas-replay-v1",
                "rawCommit": args.raw_commit,
                "exporterCommit": args.api_commit,
                "referenceIds": ids,
                "result": result,
            },
            file,
            sort_keys=True,
        )
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
