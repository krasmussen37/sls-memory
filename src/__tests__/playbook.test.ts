import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "fs";
import * as os from "os";
import { join } from "path";
import {
  createPattern,
  loadPlaybook,
  recordFeedback,
  savePlaybook,
  validatePlaybook,
} from "../core/playbook.js";

let playbookPath = "";
let playbookDir = "";
let originalPlaybook: string | null = null;
let playbookExisted = false;
let dirExisted = false;

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

test("savePlaybook and loadPlaybook roundtrip YAML", () => {
  const pattern = createPattern({
    id: "slsm-123",
    fingerprint: "connection-refused",
    pattern: "ECONNREFUSED.*",
    severity: "high",
    category: "database",
    title: "Postgres connection refused",
    symptoms: ["ECONNREFUSED 127.0.0.1:5432"],
    root_causes: ["PostgreSQL not running"],
    fixes: [{ step: "Start postgres", command: "systemctl start postgresql" }],
    feedback: { helpful: 2, harmful: 0 },
  });

  savePlaybook({ patterns: [pattern] });
  const loaded = loadPlaybook();

  expect(loaded.patterns.length).toBe(1);
  expect(loaded.patterns[0].id).toBe("slsm-123");
  expect(loaded.patterns[0].severity).toBe("high");
  expect(loaded.patterns[0].fixes[0].command).toBe("systemctl start postgresql");
});

test("validatePlaybook flags duplicate IDs and invalid severity", () => {
  const data = {
    patterns: [
      {
        id: "slsm-001",
        fingerprint: "a",
        pattern: "test",
        severity: "critical",
        category: "general",
        title: "Bad severity",
        symptoms: [],
        root_causes: [],
        fixes: [],
        feedback: { helpful: 0, harmful: 0 },
      },
      {
        id: "slsm-001",
        fingerprint: "b",
        pattern: "test2",
        severity: "low",
        category: "general",
        title: "Duplicate ID",
        symptoms: [],
        root_causes: [],
        fixes: [],
        feedback: { helpful: 0, harmful: 0 },
      },
    ],
  };

  const errors = validatePlaybook(data);
  expect(errors.some(e => e.path.endsWith(".severity"))).toBe(true);
  expect(errors.some(e => e.message.includes("Duplicate pattern ID"))).toBe(true);
});

test("recordFeedback increments counters", () => {
  const pattern = createPattern({ feedback: { helpful: 1, harmful: 0 } });
  recordFeedback(pattern, "helpful");
  recordFeedback(pattern, "harmful");

  expect(pattern.feedback.helpful).toBe(2);
  expect(pattern.feedback.harmful).toBe(1);
});
