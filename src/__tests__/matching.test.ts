import { expect, test } from "bun:test";
import { calculateScore, extractKeywords, findMatchingPatterns } from "../core/matching.js";
import type { Playbook } from "../core/playbook.js";

test("extractKeywords removes stop words and short tokens", () => {
  const keywords = extractKeywords("The database is down and the connection failed");
  expect(keywords).toContain("database");
  expect(keywords).toContain("connection");
  expect(keywords).not.toContain("the");
  expect(keywords).not.toContain("is");
});

test("calculateScore returns 0 when no overlap", () => {
  const score = calculateScore(["alpha"], ["beta"]);
  expect(score).toBe(0);
});

test("findMatchingPatterns prefers regex matches", () => {
  const playbook: Playbook = {
    patterns: [
      {
        id: "slsm-001",
        fingerprint: "conn-refused",
        pattern: "ECONNREFUSED",
        severity: "high",
        category: "network",
        title: "Connection refused",
        symptoms: ["ECONNREFUSED 127.0.0.1:5432"],
        root_causes: ["Service down"],
        fixes: [],
        feedback: { helpful: 0, harmful: 0 },
      },
    ],
  };

  const results = findMatchingPatterns(playbook, "ECONNREFUSED 127.0.0.1:5432");
  expect(results.length).toBe(1);
  expect(results[0].score).toBe(100);
});

test("findMatchingPatterns falls back to keyword matching", () => {
  const playbook: Playbook = {
    patterns: [
      {
        id: "slsm-002",
        fingerprint: "invalid-regex",
        pattern: "[",
        severity: "medium",
        category: "database",
        title: "Database timeout",
        symptoms: ["Query timeout", "Connection timeout"],
        root_causes: ["DB overload"],
        fixes: [],
        feedback: { helpful: 0, harmful: 0 },
      },
    ],
  };

  const results = findMatchingPatterns(playbook, "Database connection timeout during query");
  expect(results.length).toBe(1);
  expect(results[0].score).toBeGreaterThan(20);
});
