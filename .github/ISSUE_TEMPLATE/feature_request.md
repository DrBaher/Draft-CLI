---
name: Feature request
about: Suggest a new flag, detection rule, or workflow.
title: ''
labels: enhancement
assignees: ''
---

**What problem are you trying to solve?**
The user-visible problem, not the proposed solution. "I keep having to
manually fill in dollar amounts in YC SAFEs" is more useful than "add
positional placeholder addressing."

**What workflow does this fit?**
Where in the contract-operations flow would this run? Standalone, or
chained with `template-vault-cli` / `nda-review-cli` / `docx2pdf-cli` /
`sign-cli`?

**Have you checked the deferred list?**
See [CHANGELOG.md](../../CHANGELOG.md) — there's a "Deferred" block for v2
candidates. If your request is already there, comment on the issue tracking
it instead of opening a new one.

**Scope-fit check**
`draft-cli` is **placeholder substitution only**. It deliberately doesn't:
- store templates (that's `template-vault-cli`)
- review/redline (`nda-review-cli`)
- convert to PDF (`docx2pdf-cli`)
- sign (`sign-cli`)

If your request pushes into one of those neighbors' lanes, the right place
to ask is probably the neighbor. Mention which sibling you considered.

**Proposed shape (optional)**
Rough CLI shape, flag name, or JSON output addition. Not required — the
problem statement is the more important half.
