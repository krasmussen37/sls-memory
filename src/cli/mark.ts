/**
 * slsm mark - Record feedback on a pattern
 */

import { Command } from 'commander';
import { loadPlaybook, savePlaybook, findPatternById, recordFeedback } from '../core/playbook.js';

export const markCommand = new Command('mark')
  .description('Record feedback on a pattern')
  .argument('<id>', 'Pattern ID (e.g., slsm-001)')
  .argument('<feedback>', 'Feedback type: helpful or harmful')
  .option('--reason <reason>', 'Reason for the feedback')
  .action(async (id: string, feedback: string, options: { reason?: string }) => {
    const parent = markCommand.parent;
    const jsonOutput = parent?.opts().json || parent?.opts().robot;

    const validFeedback = ['helpful', 'harmful'] as const;
    const normalizedFeedback = feedback.toLowerCase() as 'helpful' | 'harmful';
    if (!validFeedback.includes(normalizedFeedback)) {
      if (jsonOutput) {
        console.log(JSON.stringify({
          success: false,
          error: `feedback must be "helpful" or "harmful", got "${feedback}"`,
        }, null, 2));
      } else {
        console.error(`Error: feedback must be "helpful" or "harmful", got "${feedback}"`);
      }
      process.exit(1);
    }

    // Load playbook and find pattern
    const playbook = loadPlaybook();
    const pattern = findPatternById(playbook, id);

    if (!pattern) {
      if (jsonOutput) {
        console.log(JSON.stringify({
          success: false,
          error: `Pattern not found: ${id}`,
        }, null, 2));
      } else {
        console.error(`Error: Pattern not found: ${id}`);
        console.log('Available patterns:');
        for (const p of playbook.patterns) {
          console.log(`  - ${p.id}: ${p.title}`);
        }
      }
      process.exit(1);
    }

    // Record feedback
    recordFeedback(pattern, normalizedFeedback);
    savePlaybook(playbook);

    if (jsonOutput) {
      console.log(JSON.stringify({
        success: true,
        patternId: id,
        patternTitle: pattern.title,
        feedback: normalizedFeedback,
        reason: options.reason || null,
        newCounts: {
          helpful: pattern.feedback.helpful,
          harmful: pattern.feedback.harmful,
        },
      }, null, 2));
    } else {
      console.log(`Marked pattern ${id} as ${normalizedFeedback}`);
      console.log(`  Pattern: ${pattern.title}`);
      if (options.reason) {
        console.log(`  Reason: ${options.reason}`);
      }
      console.log(`  Helpful: ${pattern.feedback.helpful}, Harmful: ${pattern.feedback.harmful}`);
    }
  });
