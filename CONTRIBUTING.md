# Contributing

Thank you for helping strengthen this index. Everything here is released into the public domain (CC0), so your contributions are a gift to the whole Church.

## Ways to help

- **Fix a typo** in a promise summary or reference.
- **Revisit a classification** — a category, speaker, recipient, or conditional/unconditional call you think should change. Bring your reasoning from the text.
- **Add a missing promise.** Include the reference and proposed classification.

## Ground rules for edits

- **`data/promises.json` is the source of truth.** Edit there; the CSV and indexes are regenerated from it.
- **Never reuse an `id`.** IDs are permanent so people can cite `promise #55` forever. New entries get the next unused number.
- **Keep summaries as original paraphrase** — do not paste full copyrighted verse text into the data.
- **References follow NKJV versification** in `Book Chapter:Verse` form.
- For classification changes, note the reasoning in your pull request so edge cases stay transparent.

## Regenerating the derived files

After editing `promises.json`, the maintainer regenerates `promises.csv`, `categories.json`, and `books.json` from it (a small script does this). If you can't run the script, just edit the JSON and note it — the maintainer will rebuild the rest.
