"""Compare the original source workbook against data/promises.json.

`data/promises.json` is the source of truth. The workbook in `sources/` is the
original compilation, kept for provenance and deliberately not updated when the
JSON changes — so a difference reported here is information, not necessarily a
fault. It answers one question: how far has the published dataset moved from
the spreadsheet it came out of?

Run from the repository root:

    python3 scripts/check_source_workbook.py

Reads .xlsx with the standard library alone — no packages to install. Exits 1
if anything differs, so it can be run on demand, but it is deliberately not
part of CI: once promises.json legitimately moves ahead, a failing check here
would be noise rather than a signal.
"""

from __future__ import annotations

import json
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKBOOK = ROOT / "sources" / "GodsPromises_MasterIndex_v2.xlsx"
PROMISES = ROOT / "data" / "promises.json"

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

# Workbook column -> how to derive the same value from a promises.json record.
COLUMNS = {
    1: ("promise", lambda p: p["promise"]),
    2: ("reference", lambda p: p["reference"]),
    3: ("speaker", lambda p: p["speaker"] + (f" ({p['speaker_note']})" if p["speaker_note"] else "")),
    4: ("recipient", lambda p: p["recipient"]),
    5: ("category", lambda p: p["category_raw"]),
    6: ("conditional", lambda p: "Conditional" if p["conditional"] else "Unconditional"),
    7: ("volume", lambda p: str(p["volume"])),
}


def column_number(cell_ref: str) -> int:
    """'C7' -> 2 (zero-based column index)."""
    number = 0
    for char in cell_ref:
        if char.isalpha():
            number = number * 26 + (ord(char.upper()) - 64)
    return number - 1


def read_sheet(path: Path, sheet_name: str) -> list[list[str]]:
    """Rows of a worksheet as lists of strings."""
    archive = zipfile.ZipFile(path)
    shared: list[str] = []
    if "xl/sharedStrings.xml" in archive.namelist():
        for item in ET.fromstring(archive.read("xl/sharedStrings.xml")).iter(f"{NS}si"):
            shared.append("".join(node.text or "" for node in item.iter(f"{NS}t")))

    relations = {rel.attrib["Id"]: rel.attrib["Target"]
                 for rel in ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))}
    target = None
    for sheet in ET.fromstring(archive.read("xl/workbook.xml")).iter(f"{NS}sheet"):
        if sheet.attrib.get("name") == sheet_name:
            target = relations[sheet.attrib[f"{REL_NS}id"]]
    if target is None:
        raise KeyError(f"{path.name} has no sheet named {sheet_name!r}")

    rows = []
    for row in ET.fromstring(archive.read("xl/" + target.lstrip("/").removeprefix("xl/"))).iter(f"{NS}row"):
        cells: dict[int, str] = {}
        for cell in row.iter(f"{NS}c"):
            value_node = cell.find(f"{NS}v")
            inline_node = cell.find(f"{NS}is")
            if cell.attrib.get("t") == "s" and value_node is not None:
                value = shared[int(value_node.text)]
            elif inline_node is not None:
                value = "".join(node.text or "" for node in inline_node.iter(f"{NS}t"))
            elif value_node is not None:
                value = value_node.text or ""
            else:
                continue
            cells[column_number(cell.attrib.get("r", "A1"))] = value
        if cells:
            rows.append([cells.get(i, "") for i in range(max(cells) + 1)])
    return rows


def main() -> int:
    if not WORKBOOK.exists():
        print(f"No workbook at {WORKBOOK.relative_to(ROOT)} — nothing to compare.")
        return 0

    rows = read_sheet(WORKBOOK, "Promises")[1:]
    sheet = {int(row[0]): row for row in rows if row and row[0].strip().isdigit()}
    promises = {p["id"]: p for p in json.loads(PROMISES.read_text(encoding="utf-8"))}

    problems = 0
    for label, ids in (("only in the workbook", set(sheet) - set(promises)),
                       ("only in promises.json", set(promises) - set(sheet))):
        if ids:
            problems += len(ids)
            print(f"{len(ids)} promise(s) {label}: {sorted(ids)[:10]}")

    for index, (name, derive) in COLUMNS.items():
        differing = [i for i, row in sheet.items()
                     if i in promises and (row[index] if index < len(row) else "") != derive(promises[i])]
        if differing:
            problems += len(differing)
            print(f"{name}: {len(differing)} of {len(sheet)} rows differ — ids {sorted(differing)[:8]}")

    shared_ids = len(set(sheet) & set(promises))
    if problems:
        print(f"\nThe workbook and promises.json disagree in {problems} place(s).")
        print("If promises.json has been edited since the workbook was compiled, that is expected.")
        return 1
    print(f"The workbook and promises.json agree on all {shared_ids} promises, in every field.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
