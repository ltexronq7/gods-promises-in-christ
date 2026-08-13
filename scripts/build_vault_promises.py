"""Write a 'Promises in <Book>' section into every vault book note.

The promise index and the vault were two halves of one project that never
referred to each other. This puts the promises for a book inside that book's
note, each one linking to the chapter further down the same note, so the
index is usable from inside Obsidian rather than only from the website.

Run from the repository root:

    python3 scripts/build_vault_promises.py

The section is rewritten in place each run, so this is safe to re-run after
editing data/promises.json. It is inserted above '## Text (KJV)', which keeps
it clear of the verse text that scripts/generate_web_data.py parses.
"""

from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path
from urllib.parse import quote_plus

ROOT = Path(__file__).resolve().parents[1]
VAULT = ROOT / "vault"
DATA = ROOT / "data"
SITE = "https://ltexronq7.github.io/gods-promises-in-christ/"

TEXT_HEADING = "## Text (KJV)"


def promise_line(promise: dict) -> str:
    """One promise as a list item, linking to its chapter in this same note."""
    book = promise["book"]
    verses = promise["reference"].split(":", 1)[-1]
    passage = f"{book} {promise['chapter']}:{verses}"
    chapter_link = f"[[{book}#{book} {promise['chapter']}|{passage}]]"
    themes = " · ".join(promise["categories"])
    condition = "conditional" if promise["conditional"] else "unconditional"
    return (
        f"- [**#{promise['id']}**]({SITE}?promise={promise['id']}) · {chapter_link} — "
        f"{promise['promise']} *({themes} · {condition})*"
    )


def section_for(book: str, promises: list[dict]) -> str:
    """The whole '## Promises in <Book>' section, including its heading."""
    lines = [f"## Promises in {book}", ""]
    if not promises:
        lines += ["The promise index does not currently include entries from this book.", "", ""]
        return "\n".join(lines)

    count = len(promises)
    conditional = sum(1 for p in promises if p["conditional"])
    noun, verb = ("promise", "is") if count == 1 else ("promises", "are")
    lines += [
        f"**{count} {noun}** from this book {verb} indexed in "
        f"[the complete index of God's promises]({SITE}?in={quote_plus(book)}) "
        f"— {count - conditional} unconditional, {conditional} conditional. "
        "Promise numbers are permanent, so they can be cited.",
        "",
    ]
    lines += [promise_line(p) for p in promises]
    lines += ["", ""]
    return "\n".join(lines)


def apply_section(text: str, section: str, book: str) -> str:
    """Replace this note's promise section, or add one above the KJV text."""
    existing = re.compile(
        rf"(?ms)^## Promises in {re.escape(book)}\s*\n.*?(?=^## |\Z)"
    )
    if existing.search(text):
        return existing.sub(lambda _: section, text, count=1)
    if TEXT_HEADING not in text:
        raise ValueError(f"{book}: no '{TEXT_HEADING}' heading to insert above")
    return text.replace(TEXT_HEADING, f"{section}{TEXT_HEADING}", 1)


def main() -> None:
    promises = json.loads((DATA / "promises.json").read_text(encoding="utf-8"))
    by_book: dict[str, list[dict]] = defaultdict(list)
    for promise in promises:
        by_book[promise["book"]].append(promise)
    for entries in by_book.values():
        entries.sort(key=lambda p: (p["chapter"], p["verse_start"], p["id"]))

    written = 0
    linked = 0
    for folder in ("Old Testament", "New Testament"):
        for path in sorted((VAULT / folder).glob("*.md")):
            book = path.stem
            text = path.read_text(encoding="utf-8")
            updated = apply_section(text, section_for(book, by_book.get(book, [])), book)
            if updated != text:
                path.write_text(updated, encoding="utf-8")
                written += 1
            linked += len(by_book.get(book, []))

    unknown = sorted(set(by_book) - {p.stem for p in VAULT.rglob("*.md")})
    for book in unknown:
        print(f"warning: {len(by_book[book])} promises reference {book!r}, which has no vault note")
    print(f"Linked {linked} promises into the vault; updated {written} note(s).")


if __name__ == "__main__":
    main()
