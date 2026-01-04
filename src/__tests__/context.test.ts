import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "fs";
import * as os from "os";
import { join } from "path";
import { Command } from "commander";
import { contextCommand } from "../cli/context.js";
import { savePlaybook, type Playbook } from "../core/playbook.js";

let playbookPath = "";
let playbookDir = "";
let originalPlaybook: string | null = null;
let playbookExisted = false;
let dirExisted = false;

async function captureLogsAsync<T>(fn: () => Promise<T>): Promise<{ output: string; result: T }> {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };

  try {
    const result = await fn();
    return { output: logs.join("\n"), result };
  } finally {
    console.log = originalLog;
  }
}

beforeEach(() => {
  playbookDir = join(os.homedir(), ".sls-memory");
  playbookPath = join(playbookDir, "playbook.yaml");
  dirExisted = existsSync(playbookDir);
  playbookExisted = existsSync(playbookPath);
  originalPlaybook = playbookExisted ? readFileSync(playbookPath, "utf-8") : null;
});

afterEach(() => {
  if (playbookExisted && originalPlaybook !== null) {
    writeFileSync(playbookPath, originalPlaybook, "utf-8");
  } else {
    rmSync(playbookPath, { force: true });
  }
  if (!dirExisted) {
    rmSync(playbookDir, { recursive: true, force: true });
  }
});

test("context command returns JSON matches with service filter", async () => {
  const playbook: Playbook = {
    patterns: [
      {
        id: "slsm-010",
        fingerprint: "conn-refused",
        pattern: "ECONNREFUSED",
        severity: "high",
        category: "database",
        title: "Postgres connection refused",
        symptoms: ["ECONNREFUSED 127.0.0.1:5432"],
        root_causes: ["Postgres down"],
        fixes: [],
        feedback: { helpful: 0, harmful: 0 },
      },
    ],
  };

  savePlaybook(playbook);

  const program = new Command();
  program.option("--json");
  program.addCommand(contextCommand);

  const { output } = await captureLogsAsync(() =>
    program.parseAsync([
      "node",
      "slsm",
      "--json",
      "context",
      "ECONNREFUSED 127.0.0.1:5432",
      "--service",
      "data",
    ])
  );

  const parsed = JSON.parse(output);
  expect(parsed.success).toBe(true);
  expect(parsed.matchCount).toBe(1);
  expect(parsed.patterns[0].category).toContain("database");
});
