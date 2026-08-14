"""Rebuild the derived data files from data/promises.json.

`data/promises.json` is the single source of truth. This script regenerates
everything downstream of it:

    data/promises.csv     — spreadsheet-friendly flat export
    data/books.json       — promise count per book, in canonical order
    data/categories.json  — promise count per theme, most common first

Run from the repository root:

    python3 scripts/build_derived.py

Then run `python3 scripts/verify_promises.py` to confirm the result.
"""

from __future__ import annotations

import csv
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

CSV_COLUMNS = [
    "id",
    "promise",
    "reference",
    "book",
    "chapter",
    "verse_start",
    "verse_end",
    "speaker",
    "speaker_note",
    "recipient",
    "categories",
    "conditional",
    "volume",
]


def canonical_book_order() -> list[str]:
    """Bible book order, taken from the generated KJV data so it stays in sync."""
    bible = json.loads((DATA / "kjv-web.json").read_text(encoding="utf-8"))
    return [book["book"] for book in bible["books"]]


def write_json(path: Path, payload: object) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def build_csv(promises: list[dict]) -> None:
    with (DATA / "promises.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_COLUMNS, lineterminator="\n")
        writer.writeheader()
        for promise in sorted(promises, key=lambda p: p["id"]):
            row = {column: promise[column] for column in CSV_COLUMNS}
            row["categories"] = ";".join(promise["categories"])
            row["speaker_note"] = promise["speaker_note"] or ""
            writer.writerow(row)


def build_books(promises: list[dict]) -> None:
    counts = Counter(p["book"] for p in promises)
    order = canonical_book_order()
    known = [book for book in order if book in counts]
    # Anything the canonical list does not cover still gets reported rather than
    # silently dropped; verify_promises.py will flag it as an invalid book name.
    unknown = sorted(set(counts) - set(order))
    books = [{"book": book, "count": counts[book]} for book in known + unknown]
    write_json(DATA / "books.json", {"books": books})


def build_categories(promises: list[dict]) -> None:
    counts = Counter(category for p in promises for category in p["categories"])
    first_seen: dict[str, int] = {}
    for index, promise in enumerate(promises):
        for category in promise["categories"]:
            first_seen.setdefault(category, index)
    ordered = sorted(counts.items(), key=lambda item: (-item[1], first_seen[item[0]]))
    write_json(DATA / "categories.json", {"categories": [{"name": n, "count": c} for n, c in ordered]})


def main() -> None:
    promises = json.loads((DATA / "promises.json").read_text(encoding="utf-8"))
    build_csv(promises)
    build_books(promises)
    build_categories(promises)
    print(
        f"Rebuilt promises.csv, books.json and categories.json from "
        f"{len(promises)} promises."
    )


if __name__ == "__main__":
    main()
