import { test } from "node:test";
import assert from "node:assert/strict";
import { main, completionScript } from "../draft-cli.mjs";
import { runMain } from "./_helpers.mjs";

test("--completion bash emits a sourceable bash script", async () => {
  const { code, out } = await runMain(main, ["--completion", "bash"]);
  assert.equal(code, 0);
  assert.match(out, /^# bash completion for draft-cli/);
  assert.match(out, /_draft_completion\(\) \{/);
  assert.match(out, /complete -F _draft_completion draft/);
  assert.match(out, /compgen -W "bracket mustache"/);
});

test("--completion zsh emits a zsh completion script", async () => {
  const { code, out } = await runMain(main, ["--completion", "zsh"]);
  assert.equal(code, 0);
  assert.match(out, /^#compdef draft/);
  assert.match(out, /_arguments -s -S \$flags/);
  assert.match(out, /\(bracket mustache\)/);
});

test("--completion rejects unsupported shells", async () => {
  const { code, err } = await runMain(main, ["--completion", "fish"]);
  assert.equal(code, 1);
  assert.match(err, /--completion must be 'bash' or 'zsh'/);
});

test("completionScript() is exported and matches direct invocation", () => {
  const bashScript = completionScript("bash");
  assert.match(bashScript, /complete -F _draft_completion draft/);
  const zshScript = completionScript("zsh");
  assert.match(zshScript, /^#compdef draft/);
});

test("completionScript() throws on unsupported shell", () => {
  assert.throws(() => completionScript("fish"), /unsupported shell/);
});

test("--completion bash output is syntactically valid bash", async () => {
  const { spawnSync } = await import("node:child_process");
  const { writeFileSync, mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const { code, out } = await runMain(main, ["--completion", "bash"]);
  assert.equal(code, 0);
  const dir = mkdtempSync(join(tmpdir(), "draft-completion-test-"));
  const path = join(dir, "completion.bash");
  writeFileSync(path, out);
  const r = spawnSync("bash", ["-n", path], { encoding: "utf8" });
  assert.equal(r.status, 0, `bash -n failed: ${r.stderr}`);
});

test("--completion bash script behaviorally completes flag and value contexts", async () => {
  const { spawnSync } = await import("node:child_process");
  const { writeFileSync, mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const { out } = await runMain(main, ["--completion", "bash"]);
  const dir = mkdtempSync(join(tmpdir(), "draft-completion-test-"));
  const path = join(dir, "completion.bash");
  writeFileSync(path, out);

  // After --syntax we should complete to bracket|mustache.
  const r = spawnSync("bash", ["-c", `
    source ${path}
    COMP_WORDS=(draft --syntax "")
    COMP_CWORD=2
    _draft_completion
    printf '%s\\n' "\${COMPREPLY[@]}"
  `], { encoding: "utf8" });
  assert.equal(r.status, 0);
  const lines = r.stdout.trim().split("\n").sort();
  assert.deepEqual(lines, ["bracket", "mustache"]);
});
