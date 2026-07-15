# Claude Code Build Prompt — God's Promises Index + KJV + Vault

Paste everything below the line into Claude Code, running from inside the `gods-promises/` folder.

---

You are working inside a repository called `gods-promises`. It already contains:

- `data/promises.json` — 1,046 biblical promises, each with fields including `id`, `promise`, `reference`, `book`, `chapter`, `verse_start`, `verse_end`, `speaker`, `recipient`, `categories`, `conditional`, `volume`.
- `data/promises.csv`, `data/categories.json`, `data/books.json`, `data/SCHEMA.json`
- `demo/index.html` — a standalone search page
- `sources/` — the original master-index spreadsheet
- `vault/` — an Obsidian vault of Bible study notes, hub-linked to a central "Jesus Christ" note (may be present; if the folder is missing, skip all vault steps and tell me)
- `README.md`, `LICENSE` (CC0), `CONTRIBUTING.md`, `.gitignore`

Do the following, in order. Show me a plan and wait for my go-ahead before writing files.

## 1. Build the KJV verse database

- Fetch the King James Version (public domain) from a clean, reputable public-domain source of raw verse text — plain verse text only, NOT a publisher's study edition with copyrighted footnotes, headings, or editorial apparatus. Good candidates: a well-known open KJV JSON/XML dataset on GitHub, or the `scrollmapper/bible_databases` repo. Verify the source is public-domain KJV before using it.
- Produce `data/kjv.json` as an object keyed by a canonical reference id in the form `"Book C:V"` (e.g. `"Genesis 3:15"`), each value being the verse text as a string. Use the SAME book-name spellings already used in `data/promises.json` (check them first — note "Psalm" is used, and confirm the exact spellings of multi-word books like "Song of Solomon", "1 Samuel", etc.). Normalize the fetched source's book names to match ours.
- Also emit `data/kjv.csv` with columns: `reference,book,chapter,verse,text`.
- Sanity-check: KJV has 31,102 verses across 66 books. Report the count you loaded and flag any shortfall.

## 2. Link promises to their KJV text

- For every promise in `data/promises.json`, resolve its `reference` (which may be a range like `Genesis 9:9-10`) to the KJV verse text. For ranges, join the verses in order into one `reference_text` string.
- Write a NEW file `data/promises_with_text.json` — the same records as `promises.json` PLUS a `reference_text` field. Do NOT overwrite `promises.json`; keep the paraphrase-only dataset clean and separate from the KJV-text-joined version.
- Any reference that fails to resolve: collect into a `data/unresolved_references.json` report so I can fix book-name or versification mismatches. Do not silently drop them.

## 3. Wire the demo to show verse text

- Update `demo/index.html` so each result card can reveal the full KJV `reference_text` (e.g. a "Show verse" toggle). Keep it dependency-free and offline-friendly (data embedded or fetched from the local JSON). Preserve the existing navy/gold styling.

## 4. Fold in the Obsidian vault

- Confirm `vault/` exists. Treat its `.md` files as public content to be shared as-is; do NOT rewrite the devotional/theological prose (these are sermon/study documents — leave the wording untouched).
- Generate `vault/INDEX.md`: a simple, human-readable table of contents listing the notes and the hub structure, so someone browsing on GitHub (who can't see Obsidian's graph view) can still navigate.
- In the main `README.md`, add a short "The Vault" section explaining that `vault/` is an Obsidian vault centered on a "Jesus Christ" hub note, that every book links to Christ, and how to open it in Obsidian (download the folder, Open folder as vault). Note the graph view as the intended way to experience it.

## 5. Add a regenerate script

- Create `scripts/regenerate.py` that rebuilds `data/promises.csv`, `data/categories.json`, and `data/books.json` from `data/promises.json` (source of truth), so future edits stay in sync. Keep it dependency-light (standard library + pandas only if already needed).

## 6. Licensing/attribution hygiene

- In `README.md`, add a one-line note under License: the KJV text is public domain; note the KJV's UK Crown-copyright asterisk applies only within the United Kingdom and does not affect use elsewhere. Confirm no copyrighted Bible text (e.g. NKJV full verses) is present anywhere in the repo — only KJV full text and our own paraphrases.

## 7. Publish to GitHub

- Initialize git if needed, stage everything, and walk me through creating the repo and pushing. Before the first commit, show me `git status` and a summary of new/changed files so I can review. Do not force-push or commit secrets. If `vault/` contains anything private I should exclude, flag it and ask before committing.

At each numbered step, pause and summarize what you did and what you found before moving on.
