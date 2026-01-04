import { afterEach, beforeEach, expect, test } from "bun:test";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import * as os from "os";
import { join } from "path";
import { Command } from "commander";
import { Database } from "bun:sqlite";
import { reflectCommand } from "../cli/reflect.js";

let slsDir = "";
let dbPath = "";
let walPath = "";
let shmPath = "";
let backupDir = "";
let dbExisted = false;
let walExisted = false;
let shmExisted = false;
let dirExisted = false;
let playbookPath = "";
let playbookDir = "";
let playbookExisted = false;
let playbookDirExisted = false;
let playbookBackup: string | null = null;

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
  slsDir = join(os.homedir(), ".sls");
  dbPath = join(slsDir, "sls.db");
  walPath = `${dbPath}-wal`;
  shmPath = `${dbPath}-shm`;
  playbookDir = join(os.homedir(), ".sls-memory");
  playbookPath = join(playbookDir, "playbook.yaml");

  dirExisted = existsSync(slsDir);
  dbExisted = existsSync(dbPath);
  walExisted = existsSync(walPath);
  shmExisted = existsSync(shmPath);
  playbookDirExisted = existsSync(playbookDir);
  playbookExisted = existsSync(playbookPath);
  playbookBackup = playbookExisted ? readFileSync(playbookPath, "utf-8") : null;

  backupDir = mkdtempSync(join(os.tmpdir(), "slsm-reflect-backup-"));
  if (dbExisted) {
    copyFileSync(dbPath, join(backupDir, "sls.db"));
  }
  if (walExisted) {
    copyFileSync(walPath, join(backupDir, "sls.db-wal"));
  }
  if (shmExisted) {
    copyFileSync(shmPath, join(backupDir, "sls.db-shm"));
  }
  if (playbookExisted) {
    rmSync(playbookPath, { force: true });
  }

  if (dbExisted) {
    rmSync(dbPath, { force: true });
  }
  if (walExisted) {
    rmSync(walPath, { force: true });
  }
  if (shmExisted) {
    rmSync(shmPath, { force: true });
  }
});

afterEach(() => {
  if (dbExisted) {
    copyFileSync(join(backupDir, "sls.db"), dbPath);
  } else {
    rmSync(dbPath, { force: true });
  }
  if (walExisted) {
    copyFileSync(join(backupDir, "sls.db-wal"), walPath);
  } else {
    rmSync(walPath, { force: true });
  }
  if (shmExisted) {
    copyFileSync(join(backupDir, "sls.db-shm"), shmPath);
  } else {
    rmSync(shmPath, { force: true });
  }
  if (!dirExisted) {
    rmSync(slsDir, { recursive: true, force: true });
  }
  if (playbookExisted && playbookBackup !== null) {
    mkdirSync(playbookDir, { recursive: true });
    writeFileSync(playbookPath, playbookBackup, "utf-8");
  } else {
    rmSync(playbookPath, { force: true });
  }
  if (!playbookDirExisted) {
    rmSync(playbookDir, { recursive: true, force: true });
  }
  rmSync(backupDir, { recursive: true, force: true });
});

test("reflect command suggests new patterns from SLS db", async () => {
  mkdirSync(slsDir, { recursive: true });
  const db = new Database(dbPath);
  db.run(`
    CREATE TABLE log_entries (
      id INTEGER PRIMARY KEY,
      message TEXT NOT NULL,
      level TEXT,
      service TEXT,
      timestamp_utc INTEGER,
      fingerprint TEXT
    )
  `);

  const now = Math.floor(Date.now() / 1000);
  const insert = db.prepare(
    "INSERT INTO log_entries (message, level, service, timestamp_utc, fingerprint) VALUES (?, ?, ?, ?, ?)"
  );
  insert.run("ECONNREFUSED 127.0.0.1:5432", "error", "db", now, null);
  insert.run("ECONNREFUSED 127.0.0.1:5432", "error", "db", now, null);
  insert.finalize();
  db.close();

  const program = new Command();
  program.option("--json");
  program.addCommand(reflectCommand);

  const { output } = await captureLogsAsync(() =>
    program.parseAsync([
      "node",
      "slsm",
      "--json",
      "reflect",
      "--days",
      "1",
      "--min-count",
      "2",
      "--dry-run",
    ])
  );

  const parsed = JSON.parse(output);
  expect(parsed.success).toBe(true);
  expect(parsed.totalRecurringErrors).toBe(1);
  expect(parsed.newPatternsFound).toBe(1);
  expect(parsed.patterns[0].isNew).toBe(true);
});
