/**
 * slsm context - Get fixes for an error
 */

import { Command } from 'commander';
import { loadPlaybook } from '../core/playbook.js';
import { findMatchingPatterns } from '../core/matching.js';

export const contextCommand = new Command('context')
  .description('Get known fixes for an error')
  .argument('<error>', 'Error message to look up')
  .option('--service <service>', 'Filter by service name')
  .option('--workspace <workspace>', 'Filter by workspace path')
  .option('-l, --limit <n>', 'Maximum patterns to return', '5')
  .action(async (error: string, options: { service?: string; workspace?: string; limit?: string }) => {
    const parent = contextCommand.parent;
    const jsonOutput = parent?.opts().json || parent?.opts().robot;
    const limit = parseInt(options.limit || '5', 10);

    // Load playbook and find matching patterns
    const playbook = loadPlaybook();
    let results = findMatchingPatterns(playbook, error, limit);

    // Filter by category if service is specified
    if (options.service) {
      results = results.filter(r =>
        r.pattern.category.toLowerCase().includes(options.service!.toLowerCase())
      );
    }

    if (jsonOutput) {
      // JSON output for agent consumption
      const output = {
        success: true,
        query: error,
        matchCount: results.length,
        patterns: results.map(r => ({
          id: r.pattern.id,
          title: r.pattern.title,
          score: r.score,
          severity: r.pattern.severity,
          category: r.pattern.category,
          symptoms: r.pattern.symptoms,
          root_causes: r.pattern.root_causes,
          fixes: r.pattern.fixes,
          feedback: r.pattern.feedback,
        })),
      };
      console.log(JSON.stringify(output, null, 2));
    } else {
      // Human-readable output
      console.log(`Looking up: "${error}"`);
      if (options.service) {
        console.log(`  Service filter: ${options.service}`);
      }
      console.log();

      if (results.length === 0) {
        console.log('No known patterns found for this error.');
        console.log('Tip: Run "slsm reflect" to extract patterns from recent logs.');
        return;
      }

      console.log(`Found ${results.length} matching pattern(s):\n`);

      for (const result of results) {
        const p = result.pattern;
        const severityIcon = p.severity === 'high' ? '!' : p.severity === 'medium' ? '*' : '-';

        console.log(`[${severityIcon}] ${p.id}: ${p.title}`);
        console.log(`    Category: ${p.category} | Score: ${result.score.toFixed(0)}%`);

        if (p.root_causes.length > 0) {
          console.log(`    Root causes:`);
          for (const cause of p.root_causes) {
            console.log(`      - ${cause}`);
          }
        }

        if (p.fixes.length > 0) {
          console.log(`    Fixes:`);
          for (const fix of p.fixes) {
            console.log(`      ${fix.step}`);
            if (fix.command) {
              console.log(`        $ ${fix.command}`);
            }
          }
        }

        const total = p.feedback.helpful + p.feedback.harmful;
        if (total > 0) {
          const ratio = ((p.feedback.helpful / total) * 100).toFixed(0);
          console.log(`    Feedback: ${ratio}% helpful (${total} votes)`);
        }
        console.log();
      }
    }
  });
