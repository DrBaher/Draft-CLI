# draft-cli examples

Real-world templates with schemas, demonstrating the cascade end-to-end. Each example here was used to validate the v0.1.0 release against a published industry-standard template — you can run them against the installed CLI and they will substitute cleanly.

## Common Paper Mutual NDA — cover page

[Common Paper](https://commonpaper.com/) publishes a widely-used standardized Mutual NDA. The cover page has five placeholders: party names, effective date, term, governing state, and jurisdiction.

**Files:**
- [`cp-mutual-nda-coverpage.md`](cp-mutual-nda-coverpage.md) — the markdown template (raw from `github.com/CommonPaper/Mutual-NDA`)
- [`cp-mutual-nda-coverpage.params.json`](cp-mutual-nda-coverpage.params.json) — schema mapping each bracket-shaped placeholder to a canonical key

**Run:**

```sh
draft examples/cp-mutual-nda-coverpage.md \
  --purpose "Evaluating a potential business partnership" \
  --effective-date "June 1, 2026" \
  --term "2 year(s)" \
  --governing-state "Delaware" \
  --jurisdiction "courts located in New Castle, DE" \
  --output cp-nda-filled.md
```

`draft --list-placeholders examples/cp-mutual-nda-coverpage.md` enumerates the five placeholders before you commit to values.

**Schema notes:** the upstream template uses sentence-shaped placeholders like `[Today's date]` and `[1 year(s)]`. The schema maps each to a clean snake_case key so the CLI flags read naturally (`--effective-date`, `--term`). This is exactly the case the schema-rescue mechanism was designed for — without the schema, the canonical-key derivation would produce keys like `today_s_date` and `_1_year_s`.

## Adding your own examples

Drop a `.md` (or `.docx`) template into this directory alongside a `<name>.params.json` schema and a one-paragraph README addition. PR welcome.

For larger validation against real templates (YC SAFE, Bonterms, internal MSA templates), see [`tests/fixtures/`](../tests/fixtures/) — the test suite runs every release against those, so any drift in the detection rules surfaces before publish.
