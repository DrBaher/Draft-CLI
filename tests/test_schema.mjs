import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSchema, loadSchema, findOrphans } from "../draft-cli.mjs";

test("short form: keys map to alias arrays, all required by default", () => {
  const s = parseSchema({
    party_a: ["Party A", "Disclosing Party"],
    party_b: ["Party B"],
  });
  assert.equal(s.form, "short");
  assert.deepEqual(s.entries.party_a.aliases, ["Party A", "Disclosing Party"]);
  assert.equal(s.entries.party_a.required, true);
  assert.equal(s.entries.party_a.default, null);
});

test("long form: _meta switches parser, required defaults to true, default is honored", () => {
  const s = parseSchema({
    _meta: { schema_version: 1 },
    party_a: { aliases: ["Party A"] },
    effective_date: { aliases: ["Effective Date"], required: false, default: "TBD" },
  });
  assert.equal(s.form, "long");
  assert.equal(s.entries.party_a.required, true);
  assert.equal(s.entries.effective_date.required, false);
  assert.equal(s.entries.effective_date.default, "TBD");
});

test("invalid key rejected", () => {
  assert.throws(
    () => parseSchema({ "BadKey": ["X"] }),
    /invalid key/
  );
});

test("short-form value must be an array", () => {
  assert.throws(
    () => parseSchema({ party_a: "Party A" }),
    /must be an array/
  );
});

test("long-form entry must include aliases array", () => {
  assert.throws(
    () => parseSchema({ _meta: {}, party_a: { required: true } }),
    /aliases array/
  );
});

test("top-level non-object rejected", () => {
  assert.throws(() => parseSchema(["a", "b"]), /must be an object/);
});

test("loadSchema returns null when neither sibling JSON file exists", () => {
  assert.equal(loadSchema("/nonexistent/no-such-template.md"), null);
});

test("loadSchema returns null when path is null (stdin/vault input)", () => {
  assert.equal(loadSchema(null), null);
});

test("findOrphans surfaces schema-declared keys missing from detected placeholders", () => {
  const schema = parseSchema({ party_a: ["Party A"], party_c: ["Party C"] });
  const ph = [{ key: "party_a" }];
  const orphans = findOrphans(schema, ph);
  assert.equal(orphans.length, 1);
  assert.equal(orphans[0].key, "party_c");
});

test("findOrphans empty when no schema", () => {
  assert.deepEqual(findOrphans(null, [{ key: "party_a" }]), []);
});
