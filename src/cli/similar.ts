/**
 * slsm similar - Find similar error patterns using semantic similarity
 */

import { Command } from 'commander';
import { loadPlaybook, findPatternById } from '../core/playbook.js';
import { EmbeddingsManager } from '../core/embeddings.js';

export const similarCommand = new Command('similar')
  .description('Find similar error patterns using semantic similarity')
  .argument('<query>', 'Query to match against patterns')
  .option('--limit <n>', 'Maximum results to return', '10')
  .option('--rebuild', 'Rebuild embeddings from playbook')
  .action(async (query: string, options: { limit: string; rebuild?: boolean }) => {
    const parent = similarCommand.parent;
    const jsonOutput = parent?.opts().json || parent?.opts().robot;
    const limit = parseInt(options.limit, 10);

    const playbook = loadPlaybook();
    const embeddings = new EmbeddingsManager();

    // Rebuild embeddings if requested or if first run
    if (options.rebuild || playbook.patterns.length > 0) {
      embeddings.buildFromPatterns(playbook.patterns);
    }

    // Find similar patterns
    const matches = embeddings.findSimilar(query, limit);

    // Enrich matches with pattern data
    const enrichedMatches = matches.map(m => {
      const pattern = findPatternById(playbook, m.patternId);
      return {
        patternId: m.patternId,
        score: Math.round(m.score * 100),
        pattern,
      };
    }).filter(m => m.pattern !== undefined);

    embeddings.close();

    if (jsonOutput) {
      console.log(JSON.stringify({
        success: true,
        query,
        limit,
        matchCount: enrichedMatches.length,
        matches: enrichedMatches.map(m => ({
          id: m.patternId,
          score: m.score,
          title: m.pattern!.title,
          category: m.pattern!.category,
          severity: m.pattern!.severity,
          symptoms: m.pattern!.symptoms,
          root_causes: m.pattern!.root_causes,
          fixes: m.pattern!.fixes,
        })),
      }, null, 2));
    } else {
      console.log(`Finding patterns similar to: "${query}"`);
      console.log();

      if (enrichedMatches.length === 0) {
        console.log('No similar patterns found.');
        if (playbook.patterns.length === 0) {
          console.log('Tip: Run "slsm reflect" to populate the playbook with patterns.');
        }
        return;
      }

      console.log(`Found ${enrichedMatches.length} similar pattern(s):\n`);

      for (const match of enrichedMatches) {
        const p = match.pattern!;
        const severityIcon = p.severity === 'high' ? '!' : p.severity === 'medium' ? '*' : '-';

        console.log(`[${severityIcon}] ${p.id}: ${p.title}`);
        console.log(`    Similarity: ${match.score}% | Category: ${p.category}`);

        if (p.symptoms.length > 0) {
          console.log(`    Symptoms: ${p.symptoms[0]}`);
        }

        if (p.root_causes.length > 0) {
          console.log(`    Root cause: ${p.root_causes[0]}`);
        }
        console.log();
      }
    }
  });
