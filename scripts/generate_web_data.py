"""Generate browser-friendly KJV and vault data from the Obsidian source notes.

Writes two things, both derived from `vault/`:

    data/kjv-web.json   — the whole Bible in one file, for data consumers who
                          want a single download
    data/bible/         — the same text split per book, plus a small index,
                          which is what the website loads on demand so a
                          visitor never waits on the full Bible to read a page

Keeping both in one generator is deliberate: they cannot drift apart.
"""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VAULT = ROOT / "vault"
DATA = ROOT / "data"
BIBLE = DATA / "bible"


def book_slug(book: str) -> str:
    """File-safe name for a book, e.g. '1 Samuel' -> '1-samuel'."""
    return re.sub(r"[^a-z0-9]+", "-", book.lower()).strip("-")


def strip_frontmatter(text: str) -> str:
    return re.sub(r"\A---\s*\n.*?\n---\s*\n", "", text, count=1, flags=re.S)


def section(text: str, heading: str) -> str:
    match = re.search(
        rf"(?ms)^## {re.escape(heading)}\s*\n(.*?)(?=^## |\Z)", text
    )
    return match.group(1).strip() if match else ""


def plain_markdown(text: str) -> str:
    text = re.sub(r"\[\[([^]|]+)(?:\|([^]]+))?\]\]", lambda m: m.group(2) or m.group(1), text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"\*([^*]+)\*", r"\1", text)
    text = re.sub(r"^>\s?", "", text, flags=re.M)
    return re.sub(r"\s+", " ", text).strip()


def parse_book(path: Path, testament: str) -> tuple[dict, list[dict]]:
    text = strip_frontmatter(path.read_text(encoding="utf-8"))
    book = path.stem
    intro = {
        "book": book,
        "testament": testament,
        "christ": plain_markdown(section(text, f"Christ in {book}")),
        "keyVerse": plain_markdown(section(text, "Key Verse")),
        "application": plain_markdown(section(text, "Take It Home")),
        "connections": plain_markdown(section(text, "Connections")),
    }

    verses: list[dict] = []
    chapter = None
    in_text = False
    for line in text.splitlines():
        if line.strip() == "## Text (KJV)":
            in_text = True
            continue
        if not in_text:
            continue
        chapter_match = re.match(r"^###\s+.+\s+(\d+)\s*$", line)
        if chapter_match:
            chapter = int(chapter_match.group(1))
            continue
        verse_match = re.match(r"^\*\*(\d+)\*\*\s+(.*?)\s*$", line)
        if verse_match and chapter is not None:
            verse_text = re.sub(r"\*([^*]+)\*", r"\1", verse_match.group(2)).strip()
            verse = int(verse_match.group(1))
            verses.append(
                {
                    "reference": f"{book} {chapter}:{verse}",
                    "book": book,
                    "chapter": chapter,
                    "verse": verse,
                    "text": verse_text,
                }
            )
    return intro, verses


def main() -> None:
    books: list[dict] = []
    verses: list[dict] = []
    for folder, testament in (("Old Testament", "Old Testament"), ("New Testament", "New Testament")):
        for path in sorted((VAULT / folder).glob("*.md")):
            intro, book_verses = parse_book(path, testament)
            intro["chapters"] = max((v["chapter"] for v in book_verses), default=0)
            intro["verseCount"] = len(book_verses)
            books.append(intro)
            verses.extend(book_verses)

    # Restore canonical order from the source notes' existing book sequence.
    canonical = [
        "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth",
        "1 Samuel", "2 Samuel", "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra",
        "Nehemiah", "Esther", "Job", "Psalms", "Proverbs", "Ecclesiastes", "Song of Solomon",
        "Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
        "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah",
        "Malachi", "Matthew", "Mark", "Luke", "John", "Acts", "Romans", "1 Corinthians",
        "2 Corinthians", "Galatians", "Ephesians", "Philippians", "Colossians", "1 Thessalonians",
        "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews", "James",
        "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation",
    ]
    order = {name: index for index, name in enumerate(canonical)}
    books.sort(key=lambda item: order[item["book"]])
    verses.sort(key=lambda item: (order[item["book"]], item["chapter"], item["verse"]))

    jesus = plain_markdown(strip_frontmatter((VAULT / "Jesus Christ.md").read_text(encoding="utf-8")))
    payload = {"translation": "KJV", "books": books, "verses": verses, "jesusHub": jesus}
    DATA.mkdir(exist_ok=True)
    (DATA / "kjv-web.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )

    write_split_bible(books, verses, jesus)
    print(f"Generated {len(books)} books and {len(verses)} verses")


def write_split_bible(books: list[dict], verses: list[dict], jesus: str) -> None:
    """Write data/bible/: one file per book plus a small index.

    Verse text is stored as nested arrays rather than one object per verse.
    Chapter and verse numbers are the array positions, and the reference is
    rebuilt in the browser, which drops roughly a third of the bytes without
    losing anything.
    """
    by_book: dict[str, list[dict]] = {}
    for verse in verses:
        by_book.setdefault(verse["book"], []).append(verse)

    if BIBLE.exists():
        shutil.rmtree(BIBLE)
    BIBLE.mkdir(parents=True)

    index_books = []
    for book in books:
        name = book["book"]
        chapters: list[list[str]] = [[] for _ in range(book["chapters"])]
        for verse in by_book.get(name, []):
            chapters[verse["chapter"] - 1].append(verse["text"])

        slug = book_slug(name)
        (BIBLE / f"{slug}.json").write_text(
            json.dumps(
                {
                    "book": name,
                    "testament": book["testament"],
                    "christ": book["christ"],
                    "keyVerse": book["keyVerse"],
                    "application": book["application"],
                    "connections": book["connections"],
                    "text": chapters,
                },
                ensure_ascii=False,
                separators=(",", ":"),
            ),
            encoding="utf-8",
        )
        index_books.append(
            {
                "book": name,
                "testament": book["testament"],
                "chapters": book["chapters"],
                "verseCount": book["verseCount"],
                "slug": slug,
            }
        )

    (BIBLE / "index.json").write_text(
        json.dumps(
            {"translation": "KJV", "books": index_books, "jesusHub": jesus},
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
