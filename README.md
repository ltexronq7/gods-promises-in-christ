# The Complete Index of God's Promises in Scripture

A structured, open dataset of **1,046 promises** spanning Genesis to Revelation, together with a complete KJV Obsidian vault that shows how the books of Scripture connect to Jesus Christ.

Built to spread the Word and equip the Church with a free, reusable tool for study, teaching, and building.

> *"For all the promises of God in Him are Yes, and in Him Amen, to the glory of God through us."* — 2 Corinthians 1:20 (NKJV)

## Start here

- **Use the live ministry site:** [search the promises, search the complete KJV, and read all 66 books](https://ltexronq7.github.io/gods-promises-in-christ/).
- Browse the underlying promise index in [`data/promises.json`](data/promises.json).
- Begin the downloadable Obsidian vault at [`vault/00 Start Here.md`](vault/00%20Start%20Here.md).
- Visit [`vault/Jesus Christ.md`](vault/Jesus%20Christ.md) to see the central message of the vault.
- Use [`vault/INDEX.md`](vault/INDEX.md) as the vault directory, or open `vault/` in Obsidian for the full graph view.

## The vault: all Scripture points to Jesus

The `vault/` folder is a complete KJV Bible organized as an Obsidian vault. Every biblical book connects to the central **Jesus Christ** note, and cross-book links show patterns of promise, prophecy, fulfillment, the Cross, the Resurrection, and Christ's return.

To experience it as intended, download the repository, open Obsidian, choose **Open folder as vault**, and select the `vault` folder. Then open Graph View. No Obsidian account or third-party plugin is required.

The vault's study introductions express a Christ-centered evangelical reading of Scripture. The biblical text and the editorial study material are kept visually distinct so readers can evaluate the connections from Scripture itself.

## What's inside

| File | Description |
|------|-------------|
| `data/promises.json` | Canonical dataset — one object per promise, fully structured |
| `data/promises.csv` | Same data as a spreadsheet-friendly CSV |
| `data/categories.json` | All 106 themes with counts |
| `data/books.json` | All 62 books with promise counts, in canonical order |
| `data/SCHEMA.json` | Data dictionary — what every field means |
| `index.html` | Main public ministry site with promise search, full-KJV search, Bible reader, and vault navigation |
| `assets/` | Website styles and browser code |
| `data/kjv-web.json` | The whole KJV and Christ-in-each-book study data in one file, for anyone who wants a single download |
| `data/bible/` | The same text split one file per book, plus a small index — this is what the website loads on demand |
| `scripts/verify_promises.py` | Checks every promise against the KJV text and the derived files |
| `scripts/build_derived.py` | Rebuilds `promises.csv`, `books.json`, and `categories.json` from `promises.json` |
| `scripts/generate_web_data.py` | Rebuilds `kjv-web.json` from the Obsidian vault notes |
| `sources/` | The original master-index spreadsheet, kept for provenance |
| `vault/` | Complete KJV book notes, Christ-centered introductions, hubs, and cross-links |
| `CONTRIBUTING.md` | How to propose fixes and additions |
| `SECURITY.md` | How to report a security or privacy concern without exposing it publicly |

## The numbers

- **1,046** promises indexed
- **62** books of Scripture represented
- **106** distinct themes (Provision, Presence, Messiah, Covenant, Mercy…)
- **723** unconditional / **323** conditional

## Data shape

Each promise looks like this:

```json
{
  "id": 55,
  "promise": "In Abraham's Seed all nations of the earth shall be blessed",
  "reference": "Genesis 22:18",
  "book": "Genesis",
  "chapter": 22,
  "verse_start": 18,
  "verse_end": 18,
  "speaker": "God",
  "speaker_note": null,
  "recipient": "All nations",
  "categories": ["Messiah"],
  "category_raw": "Messiah",
  "conditional": false,
  "volume": 1
}
```

Fields:

- **id** — stable, permanent number. Cite `promise #55` forever; it won't renumber.
- **reference / book / chapter / verse_start / verse_end** — parsed so you can sort canonically or join to other Bible datasets.
- **speaker / speaker_note** — the primary speaker (e.g. `God`) split from the mediator note (e.g. `through Isaiah`).
- **categories** — normalized array. The original compound tag (`Nation / Kingdom`) is preserved in `category_raw`.
- **conditional** — boolean. `true` = the promise carries a stated condition.

## Try it

Visit the [live searchable site](https://ltexronq7.github.io/gods-promises-in-christ/). Search the curated promises by word, theme, or book; switch to **Full KJV** to search all 31,102 verses; or use the Bible reader to browse every book and chapter.

## Methodology & editorial decisions

- **Translation basis:** Promise summaries are original paraphrases; references follow **NKJV** versification.
- **What counts as a "promise":** A declared commitment, oath, or assured word from God (or His messenger) about what He will do. Some entries include pronouncements of judgment where God pledges a specific outcome.
- **Conditional vs. unconditional:** "Conditional" marks promises with a stated human condition ("if you obey…"). Absence of a stated condition is marked "unconditional" — this is a classification of the text's *form*, not a theological claim about God's sovereignty.
- **Compound themes:** Where a promise carries more than one theme, all are listed in `categories`; the original combined label is kept in `category_raw`.
- Reasonable people will classify some edge cases differently. Issues and pull requests are welcome.

## Linking to a passage or a promise

Every view on the site has its own address, so anything you are looking at can be pasted into a group chat, a sermon outline, a lesson handout, or a bulletin.

| Link | Opens |
|------|-------|
| `?read=Isaiah&ch=53` | Isaiah 53 in the KJV reader |
| `?read=Jude` | Jude 1 (chapter 1 is assumed) |
| `?promise=55` | Promise #55 on its own |
| `?q=shepherd` | A search of the promise index for "shepherd" |
| `?q=shepherd&theme=Messiah` | The same search, narrowed to one theme |
| `?q=everlasting+life&scope=kjv&in=John` | A full-text KJV search inside John |

The reader has a **Copy link to this chapter** button, and every promise number and verse reference in the results is an ordinary link — so right-click and "copy link address" works the way it does anywhere else, and links open in a new tab normally.

Because `id` values never change, `?promise=55` is a permanent address. A citation printed in a handout today will still open the same promise years from now.

Back and forward behave as you would expect, and an unknown book, chapter, theme, or promise number falls back to the ordinary view rather than an error.

## How the site loads

The site is plain HTML, CSS, and JavaScript with no build step and no dependencies, but it does not make you download the whole Bible to read one page.

Landing on the site fetches the promise index and a small book index — about **70 KB compressed**. Everything on the front page works immediately. After that, text arrives only when you ask for it:

- Opening a chapter fetches just that book (the largest, Psalms, is 230 KB uncompressed).
- Searching the full KJV *within one book* fetches only that book.
- Searching the full KJV *across the whole Bible* is the one action that needs everything, so it fetches the remaining books once, with a progress indicator, and caches them for the rest of the visit.

A visitor who reads the promises and a few chapters never downloads the rest of Scripture. Books are cached in memory once loaded, so moving between chapters costs no further requests.

Both `data/kjv-web.json` and `data/bible/` are generated from `vault/` by the same script, so the single-file and split forms cannot drift apart; CI fails if either is out of date.

## Verification

The index is machine-checked against the full KJV text shipped in this repository:

```bash
python3 scripts/verify_promises.py
```

Every promise is verified for a unique and permanent `id`, a `reference` string that agrees with its parsed `book`/`chapter`/`verse_start`/`verse_end` fields, a book name that resolves to a real book of the Bible, a chapter and verse range that actually exists in that book, well-formed themes and classification fields, and agreement with `promises.csv`, `books.json`, and `categories.json`.

All 1,046 promises currently pass with no errors. The check runs on every pull request, so a bad reference can't land silently.

One note on versification: reference numbering follows the **NKJV**, while the text checked against is the **KJV**. The two share the same chapter and verse numbering throughout the passages indexed here, so the bounds check is sound — but the KJV wording will differ from the NKJV wording a summary was based on, which is expected and is why wording differences are reported as warnings rather than errors.

## Use it in your own project

**Python**
```python
import json
promises = json.load(open("data/promises.json"))
messiah = [p for p in promises if "Messiah" in p["categories"]]
print(len(messiah), "Messianic promises")
```

**JavaScript**
```js
const promises = await fetch("data/promises.json").then(r => r.json());
const unconditional = promises.filter(p => !p.conditional);
```

**Spreadsheet** — just open `data/promises.csv` in Excel, Google Sheets, or Numbers and filter away.

## License

**CC0 1.0 (public domain dedication).** The original promise summaries, classifications, indexes, and project code are dedicated to the public domain. See [`LICENSE`](LICENSE).

The full Bible text in the vault is the King James Version. The KJV is generally treated as public domain in the United States; different rights or restrictions may apply in other countries, including the United Kingdom. The repository contains no full NKJV text—only references and original promise summaries based on those references.

## Privacy and security

Everything committed to a public repository can be copied permanently. Do not contribute personal journals, private prayer requests, contact details, credentials, `.env` files, private keys, or Obsidian workspace/session files. Review [`SECURITY.md`](SECURITY.md) before reporting a sensitive problem.

## Contributing

Found a promise that should be added, a classification worth revisiting, or a reference typo? Open an issue or a pull request.
