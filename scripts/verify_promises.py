"""Verify the promise index against the KJV text and the derived data files.

Run from the repository root:

    python3 scripts/verify_promises.py

Exit status is 0 when no errors are found and 1 otherwise, so this can guard
pull requests in CI. Warnings never fail the run: they mark entries a human
should look at, not entries that are known to be wrong.
"""

from __future__ import annotations

import csv
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

REFERENCE_PATTERN = re.compile(r"^(?P<book>.+?) (?P<chapter>\d+):(?P<start>\d+)(?:-(?P<end>\d+))?$")

# Book names that may legitimately appear in a `reference` string but are not
# the canonical `book` value. A single psalm is cited "Psalm 23:1", while the
# book itself is "Psalms".
REFERENCE_ALIASES = {"Psalm": "Psalms"}

REQUIRED_FIELDS = {
    "id": int,
    "promise": str,
    "reference": str,
    "book": str,
    "chapter": int,
    "verse_start": int,
    "verse_end": int,
    "recipient": str,
    "speaker": str,
    "categories": list,
    "category_raw": str,
    "conditional": bool,
    "volume": int,
}

# Words too common to say anything about whether a paraphrase matches its verse.
STOPWORDS = frozenset(
    """the a an and or of to in for be is are was were not no all with that this
    these those i you he she it they we me him her them my your his their our
    who whom which what when where shall will unto upon into from by as at on
    but so then thus there here have has had do does did""".split()
)


class Report:
    """Collects errors (must fix) and warnings (worth a human look)."""

    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def error(self, message: str) -> None:
        self.errors.append(message)

    def warn(self, message: str) -> None:
        self.warnings.append(message)


def load_json(name: str):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def build_kjv_bounds(bible: dict) -> tuple[dict[str, set[int]], dict[tuple[str, int], int]]:
    """Return the chapters present per book and the last verse of each chapter."""
    chapters: dict[str, set[int]] = defaultdict(set)
    last_verse: dict[tuple[str, int], int] = defaultdict(int)
    for verse in bible["verses"]:
        key = (verse["book"], verse["chapter"])
        chapters[verse["book"]].add(verse["chapter"])
        last_verse[key] = max(last_verse[key], verse["verse"])
    return chapters, last_verse


def check_record_shape(promise: dict, report: Report) -> bool:
    """Validate field presence and type. Returns False if the record is unusable."""
    usable = True
    for field, expected in REQUIRED_FIELDS.items():
        if field not in promise:
            report.error(f"promise #{promise.get('id', '?')}: missing field '{field}'")
            usable = False
        elif not isinstance(promise[field], expected):
            report.error(
                f"promise #{promise.get('id', '?')}: field '{field}' should be "
                f"{expected.__name__}, found {type(promise[field]).__name__}"
            )
            usable = False
    if "speaker_note" in promise and promise["speaker_note"] is not None:
        if not isinstance(promise["speaker_note"], str):
            report.error(f"promise #{promise['id']}: 'speaker_note' must be a string or null")
    return usable


def check_reference(promise: dict, report: Report) -> None:
    """The reference string must agree with the parsed book/chapter/verse fields."""
    match = REFERENCE_PATTERN.match(promise["reference"])
    if not match:
        report.error(
            f"promise #{promise['id']}: reference {promise['reference']!r} is not in "
            "'Book Chapter:Verse' or 'Book Chapter:Verse-Verse' form"
        )
        return

    cited_book = REFERENCE_ALIASES.get(match["book"], match["book"])
    cited = (cited_book, int(match["chapter"]), int(match["start"]), int(match["end"] or match["start"]))
    stored = (promise["book"], promise["chapter"], promise["verse_start"], promise["verse_end"])
    if cited != stored:
        report.error(
            f"promise #{promise['id']}: reference {promise['reference']!r} does not match "
            f"the parsed fields {stored}"
        )
    if promise["verse_end"] < promise["verse_start"]:
        report.error(f"promise #{promise['id']}: verse_end is before verse_start")


def check_passage_exists(
    promise: dict,
    chapters: dict[str, set[int]],
    last_verse: dict[tuple[str, int], int],
    report: Report,
) -> None:
    """The cited passage must exist in the KJV text shipped with this repository."""
    book = promise["book"]
    if book not in chapters:
        report.error(
            f"promise #{promise['id']}: book {book!r} is not a canonical Bible book "
            "(it will not join to data/kjv-web.json or the vault)"
        )
        return
    if promise["chapter"] not in chapters[book]:
        report.error(
            f"promise #{promise['id']}: {promise['reference']} — {book} has no chapter "
            f"{promise['chapter']} (last chapter is {max(chapters[book])})"
        )
        return
    limit = last_verse[(book, promise["chapter"])]
    if promise["verse_start"] < 1 or promise["verse_end"] > limit:
        report.error(
            f"promise #{promise['id']}: {promise['reference']} — {book} {promise['chapter']} "
            f"ends at verse {limit}"
        )


def check_classification(promise: dict, report: Report) -> None:
    if not promise["categories"]:
        report.error(f"promise #{promise['id']}: 'categories' is empty")
    if any(not isinstance(c, str) or not c.strip() for c in promise["categories"]):
        report.error(f"promise #{promise['id']}: 'categories' contains a blank or non-string tag")
    expanded = [part.strip() for part in promise["category_raw"].split("/")]
    if expanded != promise["categories"]:
        report.error(
            f"promise #{promise['id']}: category_raw {promise['category_raw']!r} does not "
            f"expand to {promise['categories']}"
        )
    if promise["volume"] not in (1, 2):
        report.error(f"promise #{promise['id']}: unexpected volume {promise['volume']}")
    for field in ("promise", "speaker", "recipient"):
        if not promise[field].strip():
            report.error(f"promise #{promise['id']}: '{field}' is blank")


def significant_words(text: str) -> set[str]:
    """Crude stems of the content words in a string, for overlap scoring."""
    words = re.findall(r"[a-z]+", text.lower())
    return {word[:5] for word in words if len(word) > 3 and word not in STOPWORDS}


def check_paraphrase_overlap(
    promises: list[dict],
    verse_text: dict[tuple[str, int, int], str],
    report: Report,
    threshold: float = 0.2,
) -> None:
    """Warn when a summary shares almost no vocabulary with the verse it cites.

    Summaries are original paraphrases following NKJV wording, so some drift
    from the KJV is expected and healthy. A near-zero score is still the
    cheapest signal that a reference may point at the wrong passage.
    """
    for promise in promises:
        text = " ".join(
            verse_text.get((promise["book"], promise["chapter"], verse), "")
            for verse in range(promise["verse_start"], promise["verse_end"] + 1)
        )
        summary_words = significant_words(promise["promise"])
        if not summary_words or not text:
            continue
        overlap = len(summary_words & significant_words(text)) / len(summary_words)
        if overlap < threshold:
            report.warn(
                f"promise #{promise['id']}: {promise['reference']} shares little wording "
                f"with the KJV text ({overlap:.0%}) — confirm the reference is right"
            )


def check_derived_files(promises: list[dict], report: Report) -> None:
    """books.json, categories.json and promises.csv must agree with promises.json."""
    book_counts = Counter(p["book"] for p in promises)
    for entry in load_json("books.json")["books"]:
        if book_counts.get(entry["book"]) != entry["count"]:
            report.error(
                f"books.json: {entry['book']} lists {entry['count']} promises, "
                f"promises.json has {book_counts.get(entry['book'], 0)}"
            )
    missing_books = set(book_counts) - {e["book"] for e in load_json("books.json")["books"]}
    for book in sorted(missing_books):
        report.error(f"books.json: {book} is missing entirely")

    category_counts = Counter(c for p in promises for c in p["categories"])
    for entry in load_json("categories.json")["categories"]:
        if category_counts.get(entry["name"]) != entry["count"]:
            report.error(
                f"categories.json: {entry['name']} lists {entry['count']}, "
                f"promises.json has {category_counts.get(entry['name'], 0)}"
            )
    missing_categories = set(category_counts) - {
        e["name"] for e in load_json("categories.json")["categories"]
    }
    for category in sorted(missing_categories):
        report.error(f"categories.json: {category} is missing entirely")

    with (DATA / "promises.csv").open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    by_id = {p["id"]: p for p in promises}
    if {int(row["id"]) for row in rows} != set(by_id):
        report.error("promises.csv and promises.json do not contain the same ids")
        return
    for row in rows:
        promise = by_id[int(row["id"])]
        for field in ("promise", "reference", "book", "speaker", "recipient"):
            if row[field] != promise[field]:
                report.error(f"promises.csv: id {row['id']} field '{field}' differs from promises.json")
        if row["categories"] != ";".join(promise["categories"]):
            report.error(f"promises.csv: id {row['id']} categories differ from promises.json")
        if row["conditional"] != str(promise["conditional"]):
            report.error(f"promises.csv: id {row['id']} conditional differs from promises.json")


def main() -> int:
    report = Report()
    promises = load_json("promises.json")
    bible = load_json("kjv-web.json")
    chapters, last_verse = build_kjv_bounds(bible)
    verse_text = {(v["book"], v["chapter"], v["verse"]): v["text"] for v in bible["verses"]}

    ids = Counter(p.get("id") for p in promises)
    for promise_id, count in ids.items():
        if count > 1:
            report.error(f"id {promise_id} is used {count} times — ids must be unique and permanent")

    for promise in promises:
        if not check_record_shape(promise, report):
            continue
        check_reference(promise, report)
        check_passage_exists(promise, chapters, last_verse, report)
        check_classification(promise, report)

    check_paraphrase_overlap(promises, verse_text, report)
    check_derived_files(promises, report)

    print(f"Checked {len(promises)} promises against {len(bible['verses'])} KJV verses.")
    if report.warnings:
        print(f"\n{len(report.warnings)} warning(s) — review, but not a failure:")
        for warning in report.warnings:
            print(f"  ! {warning}")
    if report.errors:
        print(f"\n{len(report.errors)} error(s):")
        for error in report.errors:
            print(f"  x {error}")
        return 1
    print("\nNo errors found.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
