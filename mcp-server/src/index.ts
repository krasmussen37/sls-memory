#!/usr/bin/env bun
/**
 * SLSM MCP Server - Model Context Protocol wrapper for SLS Memory
 *
 * Exposes SLSM functionality to AI agents through MCP tools:
 * - slsm_context: Get context/fixes for error messages
 * - slsm_add_pattern: Add new error patterns to the playbook
 * - slsm_feedback: Record feedback on pattern suggestions
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// --- Type Definitions ---

interface Fix {
  step: string;
  command?: string;
}

interface Feedback {
  helpful: number;
  harmful: number;
}

interface Pattern {
  id: string;
  fingerprint: string;
  pattern: string;
  severity: 'low' | 'medium' | 'high';
  category: string;
  title: string;
  symptoms: string[];
  root_causes: string[];
  fixes: Fix[];
  feedback: Feedback;
}

interface Playbook {
  patterns: Pattern[];
}

interface MatchResult {
  pattern: Pattern;
  score: number;
  matchedKeywords: string[];
}

// --- Playbook Management ---

function getPlaybookPath(): string {
  return path.join(os.homedir(), '.sls-memory', 'playbook.yaml');
}

function loadPlaybook(): Playbook {
  const playbookPath = getPlaybookPath();

  if (!fs.existsSync(playbookPath)) {
    return { patterns: [] };
  }

  try {
    const content = fs.readFileSync(playbookPath, 'utf-8');
    // Simple YAML parsing for our use case
    const data = parseSimpleYaml(content);
    return data || { patterns: [] };
  } catch {
    return { patterns: [] };
  }
}

function savePlaybook(playbook: Playbook): void {
  const playbookPath = getPlaybookPath();
  const dir = path.dirname(playbookPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const content = stringifySimpleYaml(playbook);
  fs.writeFileSync(playbookPath, content, 'utf-8');
}

// Simple YAML parser for playbook format
function parseSimpleYaml(content: string): Playbook {
  try {
    // Try JSON first (for simplicity)
    if (content.trim().startsWith('{')) {
      return JSON.parse(content);
    }
    // For YAML, we'll use a simple approach
    // In production, use the yaml package
    return { patterns: [] };
  } catch {
    return { patterns: [] };
  }
}

function stringifySimpleYaml(playbook: Playbook): string {
  // Output as JSON for simplicity and compatibility
  return JSON.stringify(playbook, null, 2);
}

function findPatternById(playbook: Playbook, id: string): Pattern | undefined {
  return playbook.patterns.find(p => p.id === id);
}

function generatePatternId(): string {
  const num = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `slsm-${num}`;
}

// --- Pattern Matching ---

function extractKeywords(message: string): string[] {
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'to', 'of',
    'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
    'during', 'before', 'after', 'above', 'below', 'between', 'under',
    'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where',
    'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some',
    'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
    'very', 'just', 'and', 'but', 'or', 'if', 'because', 'until', 'while',
  ]);

  return message
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter(word => word.length >= 3 && !stopWords.has(word));
}

function calculateScore(keywords1: string[], keywords2: string[]): number {
  if (keywords1.length === 0 || keywords2.length === 0) {
    return 0;
  }

  const set1 = new Set(keywords1);
  const set2 = new Set(keywords2);

  let matches = 0;
  for (const word of set1) {
    if (set2.has(word)) {
      matches++;
    }
  }

  const union = new Set([...set1, ...set2]);
  return (matches / union.size) * 100;
}

function findMatchingPatterns(
  playbook: Playbook,
  errorMessage: string,
  limit: number = 10
): MatchResult[] {
  const keywords = extractKeywords(errorMessage);
  const results: MatchResult[] = [];

  for (const pattern of playbook.patterns) {
    // Try regex match first
    try {
      const regex = new RegExp(pattern.pattern, 'i');
      if (regex.test(errorMessage)) {
        results.push({
          pattern,
          score: 100,
          matchedKeywords: keywords,
        });
        continue;
      }
    } catch {
      // Invalid regex, fall through to keyword matching
    }

    // Keyword-based matching
    const patternKeywords = extractKeywords(pattern.title + ' ' + pattern.symptoms.join(' '));
    const score = calculateScore(keywords, patternKeywords);

    if (score > 20) {
      const matchedKeywords = keywords.filter(k => patternKeywords.includes(k));
      results.push({
        pattern,
        score,
        matchedKeywords,
      });
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// --- MCP Server Setup ---

const server = new McpServer({
  name: "sls-memory",
  version: "1.0.0"
});

// Tool: slsm_context - Get context/fixes for an error
server.tool(
  "slsm_context",
  {
    error: z.string().describe("The error message or stack trace to analyze"),
    limit: z.number().optional().describe("Maximum number of patterns to return (default: 5)")
  },
  async ({ error, limit }) => {
    const maxResults = limit ?? 5;
    const playbook = loadPlaybook();
    const results = findMatchingPatterns(playbook, error, maxResults);

    const output = {
      success: true,
      query: error.substring(0, 100) + (error.length > 100 ? '...' : ''),
      matchCount: results.length,
      patterns: results.map(r => ({
        id: r.pattern.id,
        title: r.pattern.title,
        score: Math.round(r.score),
        severity: r.pattern.severity,
        category: r.pattern.category,
        symptoms: r.pattern.symptoms,
        root_causes: r.pattern.root_causes,
        fixes: r.pattern.fixes,
        feedback: r.pattern.feedback,
      })),
    };

    return {
      content: [{
        type: "text",
        text: JSON.stringify(output, null, 2)
      }]
    };
  }
);

// Tool: slsm_add_pattern - Add a new error pattern
server.tool(
  "slsm_add_pattern",
  {
    title: z.string().describe("Human-readable title for the pattern"),
    pattern: z.string().describe("Regex pattern to match error messages"),
    category: z.string().describe("Category (e.g., 'database', 'network', 'filesystem')"),
    severity: z.enum(['low', 'medium', 'high']).optional().describe("Severity level (default: medium)"),
    symptoms: z.array(z.string()).optional().describe("List of symptom strings"),
    root_causes: z.array(z.string()).optional().describe("Known root causes"),
    fixes: z.array(z.object({
      step: z.string(),
      command: z.string().optional()
    })).optional().describe("Fix steps with optional commands")
  },
  async ({ title, pattern, category, severity, symptoms, root_causes, fixes }) => {
    const playbook = loadPlaybook();

    // Generate fingerprint from title
    const fingerprint = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const newPattern: Pattern = {
      id: generatePatternId(),
      fingerprint,
      pattern,
      severity: severity ?? 'medium',
      category,
      title,
      symptoms: symptoms ?? [],
      root_causes: root_causes ?? [],
      fixes: fixes ?? [],
      feedback: { helpful: 0, harmful: 0 }
    };

    playbook.patterns.push(newPattern);
    savePlaybook(playbook);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          message: "Pattern added successfully",
          pattern: {
            id: newPattern.id,
            title: newPattern.title,
            fingerprint: newPattern.fingerprint
          }
        }, null, 2)
      }]
    };
  }
);

// Tool: slsm_feedback - Record feedback on a pattern
server.tool(
  "slsm_feedback",
  {
    id: z.string().describe("The ID of the pattern (e.g., 'slsm-001')"),
    helpful: z.boolean().describe("Whether the suggestion was helpful (true) or not (false)")
  },
  async ({ id, helpful }) => {
    const playbook = loadPlaybook();
    const pattern = findPatternById(playbook, id);

    if (!pattern) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: false,
            error: `Pattern not found: ${id}`
          }, null, 2)
        }]
      };
    }

    // Record feedback
    if (helpful) {
      pattern.feedback.helpful++;
    } else {
      pattern.feedback.harmful++;
    }

    savePlaybook(playbook);

    const total = pattern.feedback.helpful + pattern.feedback.harmful;
    const ratio = total > 0 ? Math.round((pattern.feedback.helpful / total) * 100) : 0;

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          message: "Feedback recorded",
          pattern: {
            id: pattern.id,
            title: pattern.title,
            feedback: pattern.feedback,
            helpfulRatio: `${ratio}%`
          }
        }, null, 2)
      }]
    };
  }
);

// --- Main Entry Point ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("SLSM MCP Server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
