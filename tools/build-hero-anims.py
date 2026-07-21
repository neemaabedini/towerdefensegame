#!/usr/bin/env python3
"""Merge art/hero_anim/anims.json into heroSheet.generated.ts (keep dirs)."""
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TS_PATH = ROOT / "src" / "render" / "heroSheet.generated.ts"
ANIMS_PATH = ROOT / "art" / "hero_anim" / "anims.json"


def emit_frame(fr: dict) -> str:
    parts = []
    for c in fr["data"]:
        parts.append("null" if c is None else json.dumps(c))
    return '{"w":%d,"h":%d,"data":[%s]}' % (fr["w"], fr["h"], ",".join(parts))


def emit_arr(arr: list) -> str:
    return "[" + ",".join(emit_frame(f) for f in arr) + "]"


def main() -> None:
    src = TS_PATH.read_text(encoding="utf-8")
    m = re.search(
        r"export const HERO_SHEET_DIRS: HeroSheetFrame\[\] = (\[.*\]);",
        src,
        re.S,
    )
    if not m:
        src = subprocess.check_output(
            ["git", "show", "HEAD:src/render/heroSheet.generated.ts"],
            cwd=ROOT,
            text=True,
        )
        m = re.search(
            r"export const HERO_SHEET_DIRS: HeroSheetFrame\[\] = (\[.*\]);",
            src,
            re.S,
        )
    if not m:
        raise SystemExit("could not find HERO_SHEET_DIRS")

    dirs_literal = m.group(1)
    anims = json.loads(ANIMS_PATH.read_text(encoding="utf-8"))
    idle = anims["walk"][:2]

    lines = [
        "// GENERATED — hero stand dirs + walk / stand_atk / walk_atk cycles",
        "// Source: art/hero.png (dirs) + art/hero_anim/* (cycles). Do not edit by hand.",
        "export interface HeroSheetFrame {",
        "  w: number;",
        "  h: number;",
        "  data: (string | null)[];",
        "}",
        f"export const HERO_SHEET_FRAMES: HeroSheetFrame[] = {emit_arr(idle)};",
        "// 8-direction standing set, indexed by octant (0=E … 7=NE).",
        f"export const HERO_SHEET_DIRS: HeroSheetFrame[] = {dirs_literal};",
        "/** Named animation cycles (east-facing; flip in renderer for west). */",
        "export const HERO_ANIMS: Record<string, HeroSheetFrame[]> = {",
        f"  walk: {emit_arr(anims['walk'])},",
        f"  stand_atk: {emit_arr(anims['stand_atk'])},",
        f"  walk_atk: {emit_arr(anims['walk_atk'])},",
        "};",
        "",
    ]
    TS_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(
        "wrote",
        TS_PATH,
        "walk",
        len(anims["walk"]),
        "stand_atk",
        len(anims["stand_atk"]),
        "walk_atk",
        len(anims["walk_atk"]),
    )


if __name__ == "__main__":
    main()
