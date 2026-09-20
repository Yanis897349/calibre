import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const frontend = fileURLToPath(new URL("../", import.meta.url));

function lint(source) {
  const directory = mkdtempSync(join(frontend, "src", ".lint-probe-"));
  const filename = join(directory, "probe.ts");

  try {
    writeFileSync(filename, source);

    const result = spawnSync(
      process.execPath,
      ["node_modules/oxlint/bin/oxlint", "--format", "json", filename],
      { cwd: frontend, encoding: "utf8" },
    );

    assert.ifError(result.error);
    assert.ok(result.status === 0 || result.status === 1, result.stderr);

    const report = JSON.parse(result.stdout);
    assert.equal(report.number_of_files, 1);

    return { status: result.status, diagnostics: report.diagnostics };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("anti-slop rejects unsafe assertions, unknown parameters, and eager passes", () => {
  const result = lint(`
export function parse(value: unknown) {
  return value as string;
}

export const ids = [1, 2, 3].filter(value => value > 1).map(value => value + 1);
`);

  assert.equal(result.status, 1);

  const codes = new Set(
    result.diagnostics.map((diagnostic) => diagnostic.code),
  );

  assert.ok(codes.has("anti-slop(no-unknown-parameters)"));
  assert.ok(codes.has("anti-slop(require-safety-comment-for-type-assertion)"));
  assert.ok(codes.has("anti-slop(no-array-filter-map)"));
});

function branches(count) {
  return `export function score(value: number) {
  let result = 0;

${Array.from({ length: count }, (_, index) => `  if (value > ${index}) result += 1;`).join("\n\n")}

  return result;
}
`;
}

test("cyclomatic complexity accepts 20 paths and rejects 21", () => {
  assert.equal(lint(branches(19)).status, 0);
  const result = lint(branches(20));
  assert.equal(result.status, 1);
  assert.ok(
    result.diagnostics.some((item) => item.code === "eslint(complexity)"),
  );
});

test("typed code passes the installed plugin", () => {
  const result = lint(`export function increment(value: number) {
  return value + 1;
}
`);

  assert.equal(result.status, 0);
  assert.deepEqual(result.diagnostics, []);
});
