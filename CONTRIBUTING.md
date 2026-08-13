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
- **Use the canonical book name in the `book` field** — `Psalms`, not `Psalm` — so records join cleanly to `data/kjv-web.json` and the vault. The `reference` string keeps ordinary citation style (`Psalm 23:1`).
- For classification changes, note the reasoning in your pull request so edge cases stay transparent.

## Regenerating the derived files

After editing `promises.json`, rebuild everything downstream of it:

```bash
python3 scripts/build_derived.py
python3 scripts/build_vault_promises.py
```

The first regenerates `data/promises.csv`, `data/books.json`, and `data/categories.json`. The second rewrites the **Promises in \<Book\>** section of each vault note so the vault matches the index. Both need nothing but a Python 3 install — no packages to install — and both are safe to re-run.

If you can't run the script, just edit the JSON and say so in your pull request — the maintainer will rebuild the rest.

## Checking your work

```bash
python3 scripts/verify_promises.py
```

This checks every promise against the KJV text shipped in this repository and against the derived files. It reports two kinds of finding:

- **Errors** — things that are definitely wrong: a duplicate `id`, a reference that disagrees with the parsed `book`/`chapter`/`verse` fields, a citation of a chapter or verse that does not exist, a book name that won't join to the Bible data, a derived file that has drifted out of sync. Errors fail the build.
- **Warnings** — entries worth a human glance, chiefly summaries that share almost no wording with the verse they cite. Because summaries are original paraphrases following NKJV wording, some drift from the KJV is expected and fine. A warning is a prompt to double-check the reference, not a defect.

The same checks run automatically on every pull request.
