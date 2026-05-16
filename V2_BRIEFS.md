# V2 Design Briefs

Planning doc for the seven items in `CHANGELOG.md`'s "Deferred" block. Each
brief covers shape, schema-contract impact, scope estimate, open design
questions that need DrBaher's call, and a draft CHANGELOG entry. **No
code yet** — design only. After review and ordering, each item ships on
its own `claude/<task>-<id>` branch with its own PR.

## Summary

| # | Item | Schema impact | Scope | Open Qs |
|---|------|--------------|-------|---------|
| 1 | `.docx` output round-trip | None directly | ~300 LOC (L) | 2 |
| 2 | Computed placeholders | Significant | ~400 LOC (L) | 2 |
| 3 | Typed parameters | Significant | ~200 LOC (M) | 3 |
| 4 | LLM from deal text | Medium | ~250 LOC (M) | 3 |
| 5 | `parties.json` registry | Significant | ~250 LOC (M) | 3 |
| 6 | Multi-document bundles | Medium | ~250 LOC (M) | 3 |
| 7 | Positional addressing | Significant | ~150 LOC (S) | 3 |

Smallest first: **#7 positional addressing**. Highest user-visible value:
**#1 `.docx` round-trip** (completes the input/output story).

---

## 1. `.docx` output round-trip

**Shape.** Read `.docx` (already supported via T3 highlight detection),
substitute, write back as `.docx` with runs, styles, and paragraph breaks
preserved. Output goes to `--output PATH` (defaults to
`<basename>-filled.docx` when input is `.docx` and no `--output` given).

**Schema-contract impact.** None directly — output format is orthogonal
to detection. Touches `PARAM_SCHEMA.md` §2 (inputs/outputs): defaults
table needs a new row for `.docx → .docx`. Touches the exit-code table
in §6 for `.docx` write failures.

**Scope.** ~300 LOC (large). `jszip` already a runtime dep. Tricky bit:
regex-replace on `word/document.xml` must preserve run boundaries so a
run like `<w:t>Acme [Effective Date] signs</w:t>` keeps the substitution
inside the same `<w:t>` element. Where Word has split a placeholder
across multiple runs (`<w:t>[Effective</w:t><w:t> Date]</w:t>`),
substitution must collapse them.

**Open design questions:**

- **Q1.1 Split-run handling.** Word sometimes splits runs at punctuation
  or auto-correct boundaries. When a placeholder spans multiple runs,
  do we (a) detect-and-warn-but-skip, or (b) merge the runs in the
  output? Merging loses fidelity in the rare case where two runs had
  different formatting; warning loses the substitution. **Need DrBaher
  decision before implementing.**
- **Q1.2 Output filename default.** When input is `.docx` and `--output`
  isn't given: append `-filled` suffix (`contract.docx` →
  `contract-filled.docx`), overwrite the input, or write bytes to
  stdout? Recommend `-filled` suffix (preserves the input, no
  surprising overwrites).

**Draft CHANGELOG entry:**

> **`.docx` output round-trip.** Templates read from `.docx` (tier 3
> highlight detection) now write back as `.docx` with runs, styles,
> and paragraph breaks preserved. Default output is
> `<basename>-filled.docx`; override with `--output`.

---

## 2. Computed placeholders

**Shape.** Schema files can declare derived parameters whose value is
computed from another placeholder at substitution time:

```json
{
  "[Effective Date]": ["effective_date"],
  "[Term End]": { "from": "[Effective Date]", "op": "+", "value": "2 years" }
}
```

`[Term End]` is computed, never asked for via CLI/interactive.

**Schema-contract impact.** Significant. New `_computed` schema field
shape. Detection tier remains unchanged (computed keys are still
bracketed in the template). Value-resolution precedence gets a new
"computed" step *after* schema-default and *before* error.
`PARAM_SCHEMA.md` needs a new section locking the expression grammar.

**Scope.** ~400 LOC (large). New expression parser + new evaluator.
Date math via stdlib `Date`. Cycle detection (A depends on B depends on
A) is a small but necessary chunk.

**Open design questions:**

- **Q2.1 Expression syntax location.** Expressions live only in the
  schema file, or also accepted inline in template text like
  `[Effective Date + 2 years]`? **Need DrBaher decision.** Recommend
  schema-file-only — keeps T1 detection rule unchanged and avoids
  conflating "discover" with "compute."
- **Q2.2 Operator scope for v2.** Just date arithmetic (`+ 2 years`,
  `- 6 months`), or also money (`+ 10%`), string concat (`+ " Inc."`)?
  Recommend dates only for v2; money/string in v3 once the date path
  proves the design.

**Draft CHANGELOG entry:**

> **Computed placeholders.** Schema entries can declare derived
> parameters: `{ "[Term End]": { from: "[Effective Date]", op: "+",
> value: "2 years" } }` resolves `[Term End]` from another
> placeholder's value at substitution time. v2 supports date
> arithmetic only.

---

## 3. Typed parameters

**Shape.** Long-form schema entries gain `type` and `format` fields:

```json
{
  "[Effective Date]": { "type": "date",  "format": "MMMM d, yyyy" },
  "[Purchase Amount]": { "type": "money", "currency": "USD" },
  "[Party A]":        { "type": "party" }
}
```

Inputs get validated and normalized before substitution: `"01/15/2027"`
→ `"January 15, 2027"`; `"$5M"` → `"$5,000,000.00"`; `party` enforces
non-empty, no markdown, no trailing punctuation.

**Schema-contract impact.** Significant. New schema fields. Validation
runs after value resolution and before substitution. `--why` output
gains a normalization step. `PARAM_SCHEMA.md` needs new sections for
each type's parse rules.

**Scope.** ~200 LOC (medium). One `normalize<Type>(raw, schema)`
function per type, plus dispatcher. Lots of test cases (parse-rule
edge cases).

**Open design questions:**

- **Q3.1 Date input formats accepted.** ISO (`2027-01-15`), US
  (`01/15/2027`), European (`15/01/2027`), spelled
  (`January 15, 2027`)? Recommend ISO + spelled-with-month-name; US
  vs European is ambiguous and footgun-y. **Need DrBaher decision.**
- **Q3.2 Money currencies.** USD-only or all ISO 4217? Recommend USD
  for v2, expand in v3.
- **Q3.3 Bad-input policy.** Hard error (exit 4) or warn-and-pass-
  through? Recommend hard error — typed params are opt-in, the user
  asked for validation.

**Draft CHANGELOG entry:**

> **Typed parameters.** Schema entries can declare
> `type: date | money | party` with optional `format` / `currency`.
> Inputs are validated and normalized before substitution; `--why`
> output shows the normalization step.

---

## 4. LLM inference from a deal description

**Shape.** Today T5 LLM infers placeholder values from the *template
text*. v2 adds the inverse: a `--from-deal <path>` flag reads a
free-form deal description and asks the LLM to extract values for
the schema's declared parameters.

```sh
draft nda.md --from-deal deal-notes.txt --output draft.md
```

**Schema-contract impact.** Medium. Doesn't alter detection or
substitution. It's a *pre-substitution* value-resolution step. The
value-resolution precedence in `PARAM_SCHEMA.md` §4 becomes:
CLI flag > `--params` JSON > `--from-deal` > `--interactive` >
schema default > error.

**Scope.** ~250 LOC (medium). New flag, new prompt, new path through
value resolution. Reuses existing T5 LLM client.

**Open design questions:**

- **Q4.1 Provider source.** Same provider as T5 (Anthropic /
  OpenAI / explicit `DRAFT_LLM_*`), or a separately-configured one?
  Recommend same — one network surface, one set of env vars.
- **Q4.2 Extra-key handling.** LLM returns values for keys not in
  the schema (noise). Drop silently or warn? Recommend warn.
- **Q4.3 Auto-implies `--llm`.** Does `--from-deal` auto-enable the
  network call, or does it require `--llm` explicitly too? Recommend
  auto-imply (single gesture; `--no-llm` still disables).

**Draft CHANGELOG entry:**

> **LLM inference from deal text.** `--from-deal <path>` reads a
> free-form deal description and asks the T5 provider to fill the
> schema's parameters. Result feeds the substitution pipeline at
> the same precedence as `--params`.

---

## 5. Cross-template `parties.json` registry

**Shape.** A repo-local `parties.json` declares known parties once:

```json
{
  "acme_corp": { "name": "Acme Corporation", "state": "Delaware",
                 "cik": "0001234567" }
}
```

Template schemas reference them with `ref:`:

```json
{ "[Party A]": "ref:parties.acme_corp.name",
  "[Party A State]": "ref:parties.acme_corp.state" }
```

Resolves at value-resolution time, before substitution.

**Schema-contract impact.** Significant. New `ref:` value type. New
`parties.json` shape spec. New failure mode: broken ref (unknown
party or unknown field). `PARAM_SCHEMA.md` needs a new section.

**Scope.** ~250 LOC (medium). File loader, ref resolver,
integration into the value-resolution pipeline.

**Open design questions:**

- **Q5.1 File location.** CWD, alongside template, or
  `~/.draft-cli/parties.json`? Recommend CWD by default with an
  opt-in `--parties PATH` flag.
- **Q5.2 Ref scope.** Refs resolve only inside `.params.json` schema
  values, or also in CLI flags (`--party-a "ref:parties.acme_corp.name"`)?
  Recommend params-only initially; CLI flag refs add ambiguity.
- **Q5.3 Versioning.** When Acme Corporation is renamed,
  `parties.json` updates and *all* historical drafts now produce
  different output if re-run. Defer history/versioning to v3;
  document as a known property in PARAM_SCHEMA.md.

**Draft CHANGELOG entry:**

> **Cross-template `parties.json` registry.** A repo-local
> `parties.json` declares known parties once; schema files reference
> them with `ref:parties.<key>.<field>`. Eliminates duplicating
> party metadata across every template.

---

## 6. Multi-document bundles

**Shape.** Some deals span multiple templates (MSA + Order Form + DPA).
v2 lets you run `draft` once on a bundle definition with one set of
parameters and get all docs filled:

```sh
draft bundle msa-order-dpa.json --params deal.json
```

Bundle file:

```json
{
  "outputs": [
    { "template": "msa/v3.md",       "output": "out/msa.md" },
    { "template": "order-form/v3.md", "output": "out/order-form.md" }
  ]
}
```

**Schema-contract impact.** Medium. New "bundle" input mode. Each
bundle entry is a (template, output) pair. `PARAM_SCHEMA.md` needs a
new section for bundle file shape and union-rescue behavior.

**Scope.** ~250 LOC (medium). Mostly orchestration over the existing
single-doc pipeline. Tricky bit: schema rescue needs to union across
all templates' schemas in the bundle — placeholders declared in one
template's schema apply to all.

**Open design questions:**

- **Q6.1 Bundle file format.** JSON or simpler `bundle.txt`
  (one template-path per line)? Recommend JSON for per-doc output
  paths and per-doc overrides.
- **Q6.2 Partial-failure policy.** 3 of 4 templates resolved, 1
  missing a required param — abort everything, or write the 3?
  Recommend abort-all (atomicity is the v2 promise).
- **Q6.3 Schema union semantics.** Key declared in template A's
  schema applies to template B too? Recommend yes — that's the
  whole point of a bundle: one resolved value used across docs.

**Draft CHANGELOG entry:**

> **Multi-document bundles.** `draft bundle <bundle.json> --params
> deal.json` resolves placeholders once across multiple templates
> and emits all docs. Per-template schemas are unioned for detection
> and value resolution.

---

## 7. Positional addressing

**Shape.** Some templates have the same placeholder text appearing
twice with *different* semantic roles. Confirmed real case (YC SAFE):
`$[_____________]` appears twice — once as valuation cap, once as
purchase amount. v2 disambiguates by position:

```json
{
  "[_____________]": {
    "positions": [
      { "role": "valuation_cap",  "aliases": ["valuation cap"] },
      { "role": "purchase_amount", "aliases": ["purchase amount"] }
    ]
  }
}
```

CLI:

```sh
draft safe.docx --value "[_____________]@0=$5,000,000" \
                --value "[_____________]@1=$100,000"
```

**Schema-contract impact.** Significant. New `positions` schema
field. Detection tier output gains a positional index per occurrence.
`PARAM_SCHEMA.md` needs a new section locking the addressing scheme
and the `@N` CLI grammar.

**Scope.** ~150 LOC (small-medium). Smallest of the seven items.
Mostly threading positional info through detection → resolution →
substitution.

**Open design questions:**

- **Q7.1 Index base.** Index from 0 or 1? Recommend 0 (programmer
  convention; the `@N` CLI grammar is geek territory anyway).
- **Q7.2 Length mismatch.** Schema declares 2 positions but
  detection finds 3 occurrences — error or fill remaining with
  default? Recommend hard error (schema and template are out of sync;
  silent fill hides bugs).
- **Q7.3 Bare-key CLI semantics.** `--value KEY=VALUE` (no `@N`)
  auto-applies to all positions, or is it an error when the key is
  positional in the schema? Recommend auto-apply to all
  (backward-compatible with existing CLI usage).

**Draft CHANGELOG entry:**

> **Positional addressing.** Identical placeholder text with
> different semantic roles can be disambiguated by position in
> schema: `{ "[_____________]": { positions: [{role: "valuation_cap"},
> {role: "purchase_amount"}] } }`. CLI uses `--value "<text>@<index>=<value>"`.

---

## Reading + ordering

Pick the next implementation by considering effort × user value × locked-
contract risk. Suggested orderings:

- **Quick wins first**: #7 → #3 → #1 → #2 → #5 → #6 → #4
  (smallest LOC progressively; ends with the new LLM workflow as the
  exploratory finale)
- **User-value first**: #1 → #7 → #3 → #6 → #5 → #2 → #4
  (`.docx` output completes the most common ask; #7 unblocks YC SAFE;
  then the rest in increasing schema-impact order)
- **Schema risk last**: #1 → #4 → #6 → #3 → #5 → #2 → #7
  (defer the items that lock new shape into `PARAM_SCHEMA.md` until
  the simpler items have proven the v2 patterns)

Each item, once approved and ordered, gets its own
`claude/<task>-<id>` branch and its own PR. Schema-contract changes
get an `[X]` checklist gate in the PR description for explicit
DrBaher sign-off before merge.
