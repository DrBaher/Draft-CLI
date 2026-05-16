import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveInput, main, EXIT } from "../draft-cli.mjs";
import { fakeSpawnSuccess, fakeSpawnFail, runMain } from "./_helpers.mjs";

test("resolveInput uses template-vault for category/name refs", async () => {
  const spawner = fakeSpawnSuccess("Between [Party A] and [Party B].");
  const r = await resolveInput("nda/house-mutual", { spawner });
  assert.equal(r.kind, "text");
  assert.match(r.body, /Party A/);
});

test("resolveInput uses template-vault for category/name@version", async () => {
  const spawner = fakeSpawnSuccess("[Party A]");
  const r = await resolveInput("nda/house-mutual@v0.2", { spawner });
  assert.equal(r.body, "[Party A]");
});

test("resolveInput surfaces template-vault failure with exit 3", async () => {
  const spawner = fakeSpawnFail("no such template");
  await assert.rejects(
    () => resolveInput("nda/missing", { spawner }),
    (e) => e.exitCode === EXIT.VAULT && /no such template/.test(e.message)
  );
});

test("draft end-to-end pulls from template-vault and substitutes", async () => {
  const spawner = fakeSpawnSuccess("Between [Party A] and [Party B].");
  const { code, out } = await runMain(main, [
    "nda/house-mutual",
    "--party-a", "Acme",
    "--party-b", "Vendor",
  ], { spawner });
  assert.equal(code, 0);
  assert.equal(out, "Between Acme and Vendor.");
});

test("draft surfaces template-vault failure cleanly", async () => {
  const spawner = fakeSpawnFail("no such template");
  const { code, err } = await runMain(main, ["nda/missing", "--party-a", "Acme"], { spawner });
  assert.equal(code, EXIT.VAULT);
  assert.match(err, /no such template/);
});
