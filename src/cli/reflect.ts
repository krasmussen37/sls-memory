/**
 * slsm reflect - Extract new patterns from logs
 */

import { Command } from 'commander';
import { Database } from 'bun:sqlite';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { loadPlaybook, savePlaybook, createPattern, type Pattern } from '../core/playbook.js';
import { findMatchingPatterns } from '../core/matching.js';

interface RecurringError {
  message: string;
  count: number;
  level: string;
  service: string | null;
  firstSeen: number;
  lastSeen: number;
  fingerprint: string | null;
}

function getSlsDbPath(): string {
  return path.join(os.homedir(), '.sls', 'sls.db');
}

function generateFingerprint(message: string): string {
  // Normalize common patterns for fingerprinting
  return message
    .toLowerCase()
    .replace(/\d+\.\d+\.\d+\.\d+/g, '<ip>')      // IP addresses
    .replace(/:\d+/g, ':<port>')                   // Port numbers
    .replace(/\/[a-f0-9-]{36}/gi, '/<uuid>')       // UUIDs
    .replace(/\b\d+\b/g, '<n>')                    // Numbers
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

function categorizError(message: string): string {
  const lowerMsg = message.toLowerCase();
  if (lowerMsg.includes('econnrefused') || lowerMsg.includes('connection')) return 'network';
  if (lowerMsg.includes('permission') || lowerMsg.includes('eacces')) return 'filesystem';
  if (lowerMsg.includes('not found') || lowerMsg.includes('enoent')) return 'filesystem';
  if (lowerMsg.includes('timeout')) return 'network';
  if (lowerMsg.includes('database') || lowerMsg.includes('sql')) return 'database';
  if (lowerMsg.includes('memory') || lowerMsg.includes('heap')) return 'memory';
  return 'general';
}

export const reflectCommand = new Command('reflect')
  .description('Extract new patterns from recent logs')
  .option('--days <n>', 'Look back N days', '7')
  .option('--min-count <n>', 'Minimum occurrences to suggest', '3')
  .option('--dry-run', 'Show what would be extracted without saving')
  .action(async (options: { days: string; minCount: string; dryRun?: boolean }) => {
    const parent = reflectCommand.parent;
    const jsonOutput = parent?.opts().json || parent?.opts().robot;
    const days = parseInt(options.days, 10);
    const minCount = parseInt(options.minCount, 10);

    const slsDbPath = getSlsDbPath();

    // Check if SLS database exists
    if (!fs.existsSync(slsDbPath)) {
      if (jsonOutput) {
        console.log(JSON.stringify({
          success: false,
          error: 'SLS database not found. Run sls index first.',
          dbPath: slsDbPath,
        }, null, 2));
      } else {
        console.error(`Error: SLS database not found at ${slsDbPath}`);
        console.log('Run "sls index" first to create and populate the database.');
      }
      process.exit(1);
    }

    // Open SLS database
    const db = new Database(slsDbPath, { readonly: true });
    const cutoffTime = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);

    // Query for recurring error-level logs
    const query = `
      SELECT
        message,
        COUNT(*) as count,
        level,
        service,
        MIN(timestamp_utc) as firstSeen,
        MAX(timestamp_utc) as lastSeen,
        fingerprint
      FROM log_entries
      WHERE timestamp_utc >= ?
        AND (level = 'error' OR level = 'ERROR' OR level = 'err')
      GROUP BY COALESCE(fingerprint, message)
      HAVING COUNT(*) >= ?
      ORDER BY count DESC
      LIMIT 50
    `;

    const rows = db.prepare(query).all(cutoffTime, minCount) as RecurringError[];
    db.close();

    // Load existing playbook to check for known patterns
    const playbook = loadPlaybook();
    const newPatterns: Pattern[] = [];
    const suggestions: Array<{ error: RecurringError; pattern: Pattern; isNew: boolean }> = [];

    for (const row of rows) {
      // Check if this error already matches a known pattern
      const matches = findMatchingPatterns(playbook, row.message, 1);
      const isKnown = matches.length > 0 && matches[0].score > 80;

      if (!isKnown) {
        // Create a new pattern suggestion
        const fingerprint = row.fingerprint || generateFingerprint(row.message);
        const pattern = createPattern({
          fingerprint,
          pattern: row.message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 50) + '.*',
          severity: row.count >= 10 ? 'high' : row.count >= 5 ? 'medium' : 'low',
          category: categorizError(row.message),
          title: row.message.slice(0, 60) + (row.message.length > 60 ? '...' : ''),
          symptoms: [row.message],
          root_causes: ['Unknown - investigate logs'],
          fixes: [],
        });

        suggestions.push({ error: row, pattern, isNew: true });
        newPatterns.push(pattern);
      } else {
        suggestions.push({ error: row, pattern: matches[0].pattern, isNew: false });
      }
    }

    // Save new patterns if not dry-run
    if (!options.dryRun && newPatterns.length > 0) {
      for (const pattern of newPatterns) {
        playbook.patterns.push(pattern);
      }
      savePlaybook(playbook);
    }

    if (jsonOutput) {
      console.log(JSON.stringify({
        success: true,
        days,
        minCount,
        dryRun: options.dryRun || false,
        totalRecurringErrors: rows.length,
        newPatternsFound: newPatterns.length,
        knownPatternMatches: suggestions.filter(s => !s.isNew).length,
        patterns: suggestions.map(s => ({
          id: s.pattern.id,
          title: s.pattern.title,
          category: s.pattern.category,
          severity: s.pattern.severity,
          occurrences: s.error.count,
          isNew: s.isNew,
          firstSeen: new Date(s.error.firstSeen * 1000).toISOString(),
          lastSeen: new Date(s.error.lastSeen * 1000).toISOString(),
        })),
      }, null, 2));
    } else {
      console.log('Reflecting on logs...');
      console.log(`  Looking back: ${days} days`);
      console.log(`  Minimum occurrences: ${minCount}`);
      if (options.dryRun) {
        console.log('  Mode: dry-run (no changes will be saved)');
      }
      console.log();

      if (rows.length === 0) {
        console.log('No recurring errors found in the time window.');
        return;
      }

      console.log(`Found ${rows.length} recurring error patterns:\n`);

      const knownCount = suggestions.filter(s => !s.isNew).length;
      const newCount = suggestions.filter(s => s.isNew).length;

      if (knownCount > 0) {
        console.log(`Known patterns (${knownCount}):`);
        for (const s of suggestions.filter(s => !s.isNew)) {
          console.log(`  [${s.pattern.id}] ${s.pattern.title}`);
          console.log(`    Occurrences: ${s.error.count} | Last seen: ${new Date(s.error.lastSeen * 1000).toLocaleString()}`);
        }
        console.log();
      }

      if (newCount > 0) {
        console.log(`New patterns ${options.dryRun ? '(would be added)' : 'added'} (${newCount}):`);
        for (const s of suggestions.filter(s => s.isNew)) {
          console.log(`  [${s.pattern.id}] ${s.pattern.title}`);
          console.log(`    Category: ${s.pattern.category} | Severity: ${s.pattern.severity}`);
          console.log(`    Occurrences: ${s.error.count}`);
        }
        console.log();

        if (!options.dryRun) {
          console.log(`Added ${newCount} new patterns to playbook.`);
          console.log('Tip: Edit ~/.sls-memory/playbook.yaml to add root causes and fixes.');
        }
      }
    }
  });
