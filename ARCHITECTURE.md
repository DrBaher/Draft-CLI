# Architecture

A walk-through of how `draft-cli` is shaped and why. Read this before
contributing — it explains the constraints that drove the design.

## Single-file CLI

`draft-cli.mjs` is one file. Helpers, tiers, command dispatchers, and
the main entry point all live in it. There is no `src/` directory, no
build step, no compiled output. Run it directly:

```sh
node draft-cli.mjs --demo
```

The file is exported as ESM so the test suite can `import` individual
functions. The `if (isMain)` block at the bottom runs `main()` only
when the file is invoked directly, not when imported.

Trade-off: the file is large (≈ 1000 LOC) and you have to scroll. The
upside is that the entire CLI is in one place, has one set of imports,
and can be vendored or audited as a single artifact.

## The cascade

`runCascade()` in `draft-cli.mjs` orchestrates the five detection tiers
in this order:

```
T1 bracket [Title Case]      ──► hits? stop.
   else
T2 mustache {{X}}            (only if --syntax mustache; else skip)
                              hits? stop.
   else
T3 .docx highlight runs      (only if input is .docx)
                              hits? stop.
   else
T4 heuristic dictionary      (skipped by --no-heuristic)
                              hits? stop. Gate output behind confirmation.
   else
T5 LLM                       (skipped by --no-llm or no env provider)
                              hits? stop.
   else
done with zero placeholders. Caller decides whether that's an error.
```

**Sequential-with-stop** is the locked semantic. A non-empty tier wins
and the others are skipped. This is predictable; it means a bracketed
template never accidentally invokes the LLM. The alternative — union
all tiers — was rejected during the design review because the conflict
resolution between tiers (same canonical key from two tiers with
different match texts) was a hidden complexity.

## Substitution model

`substitute()` does byte-level replacement on the original template
body. It does **not** parse the body, build an AST, and re-emit. This
means:

- Whitespace, line endings, and Markdown structure are preserved exactly.
- The output is the input with placeholder runs swapped out — nothing
  else changes.
- `.docx` input is the one exception: we extract text from
  `word/document.xml` first, then substitute on the extracted text.
  The output is plain markdown, not a re-written `.docx` (that's v2).

For T1/T2 (bracket/mustache), substitution uses literal string
replacement of the full match (`[Party A]` → `Acme`). For T3/T4/T5
(text-based tiers), substitution uses a whole-word regex
(`(?<![A-Za-z0-9])Acme Corporation(?![A-Za-z0-9])`) so we don't
overlap-substitute into adjacent words.

## Schema file handling

`loadSchema()` looks for a sibling file next to the template:
`<template>.params.json` or `<template_basename>.params.json`. If
neither exists, returns `null` and the cascade uses inferred keys.

If the parsed JSON has a top-level `_meta` key, it's long form
(`{ aliases, required, default }` per entry). Otherwise short form
(`key: [aliases…]`). The two forms are not mixable within one file —
the parser commits to one shape on the first call.

`findOrphans()` checks that every schema-declared key has a matching
detected placeholder. Orphans are exit-2 errors (locked decision Q4).

## Value resolution precedence

`resolveValues()` walks placeholders in order and assigns a value from
the first source that has one:

```
CLI flag (--key-name VALUE)
   → --params JSON file
      → --interactive prompt (only if --interactive set)
         → schema default (only if long form with "default")
            → error (exit 2 with a listing of missing keys)
```

The empty string is a valid CLI value (`--party-a ""`). Only **absence**
falls through to the next source.

## Why we shell out to template-vault

`resolveInput()` detects `<category>/<name>[@version]`-shaped args and
runs `template-vault get` as a subprocess. We do NOT import
template-vault-cli as a library, because:

1. template-vault-cli is Python; draft-cli is Node. No shared runtime.
2. Even if we re-implemented the vault read path in Node, we'd duplicate
   the lookup semantics (default sources, hash pinning, version
   resolution). The vault is the source of truth for its own data.
3. Subprocess isolation is a feature: a draft-cli bug can't corrupt a
   vault, and a vault bug can't crash draft-cli without a clear exit
   code (`3` for vault failure).

The `spawnSync` call is injectable via the `spawner` option on
`resolveInput()`, which is how the tests mock it without invoking a
real template-vault binary.

## `.docx` parsing

T3 uses `jszip` to unzip the `.docx`, reads `word/document.xml`, and
regex-extracts highlight runs (`<w:r>` containing
`<w:highlight w:val="..."/>`). The XML structure of a Word document is
well-known enough that regex is robust:

```js
const runRe = /<w:r\b[\s\S]*?<\/w:r>/g;
// inside each run: <w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>text</w:t>
```

We don't take a full XML parser dependency (`@xmldom/xmldom` or
similar) because the surface we care about is narrow and the regex is
under 10 lines.

Output for `.docx` input is plain markdown — extracted text in document
order, paragraphs joined with `\n`. Round-tripping back into `.docx`
(preserving styles, numbering, run formatting) is intentionally out of
scope for v1.

## LLM tier

`detectLlm()` is invoked only at the bottom of the cascade. It accepts
a `fetcher` injection so tests can mock the HTTP call without a
network. The prompt is fixed at the top of `callLlm()`:

> Given the document text below, identify spans that look like
> placeholders — names, dates, or party-identifier text that a drafter
> would replace before sending. Do NOT detect cross-references or
> section labels. Output JSON ONLY in this exact shape: …

Response parsing is permissive: we look for a balanced `{…}` substring,
parse it, validate each entry has a string `text` and a snake_case
`suggested_key`. Anything else is dropped silently.

## ANSI color

`paint()` and `colorEnabled()` honor:

- `NO_COLOR` env (any non-empty value → off, per https://no-color.org/)
- `FORCE_COLOR` env (any non-empty value → on)
- Otherwise: on iff the target stream `isTTY`.

Color codes go to **stderr** only. Stdout is always plain so it pipes
cleanly into downstream tools.

## Test layout

```
tests/
  _helpers.mjs                — Shared fixtures, CaptureStream, mock fetchers, .docx synthesis.
  fixtures/                   — Template + schema files used by tests.
  test_args.mjs               — parseArgs and UsageError.
  test_cascade.mjs            — runCascade orchestration & tier-stop semantics.
  test_env.mjs                — .env reader, llmProviderFromEnv, color.
  test_modes.mjs              — Main 'draft', --list-placeholders, --validate end-to-end.
  test_output.mjs             — --why, --json, --output PATH, --demo.
  test_schema.mjs             — Short vs long form, orphans, key validity.
  test_substitution.mjs       — substitute(), resolveValues(), precedence.
  test_t1_bracket.mjs         — T1 detection rule + real Common Paper template.
  test_t2_mustache.mjs        — T2 detection.
  test_t3_docx.mjs            — T3 detection, jszip-synthesized .docx.
  test_t4_heuristic.mjs       — T4 detection + dictionary override.
  test_t5_llm.mjs             — T5 detection with mocked HTTP.
  test_template_vault.mjs     — Subprocess spawning with mock spawner.
```

One concern per file, modeled on template-vault-cli's test layout.
Run with `node --test tests/test_*.mjs`. Coverage with
`node --test --experimental-test-coverage tests/test_*.mjs`. Target:
≥ 80% line on `draft-cli.mjs`. Current: 87.2%.

## Forward-compatibility hooks

The locked schema reserves field names for v2:

- Long-form entries can grow `"type": "date" | "money" | "party" | ...`
  for typed parameters.
- Long-form entries can grow `"computed": "..."` for computed values
  (`[Effective Date + 2 years]`).
- Long-form entries can grow `"detect": "highlight" | "literal" | "bracket"`
  for tier-specific detection preferences.

These are reserved but unused in v1. Adding them in v2 will not break
existing v1 schema files.
