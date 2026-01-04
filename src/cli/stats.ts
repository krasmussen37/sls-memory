/**
 * slsm stats - Show statistics
 */

import { Command } from 'commander';
import { loadPlaybook, getPlaybookPath } from '../core/playbook.js';

export const statsCommand = new Command('stats')
  .description('Show playbook statistics')
  .action(async () => {
    const parent = statsCommand.parent;
    const jsonOutput = parent?.opts().json || parent?.opts().robot;

    const playbookPath = getPlaybookPath();
    const playbook = loadPlaybook();

    // Compute statistics
    const patternsByCategory: Record<string, number> = {};
    const patternsBySeverity: Record<string, number> = { low: 0, medium: 0, high: 0 };
    let totalHelpful = 0;
    let totalHarmful = 0;

    for (const pattern of playbook.patterns) {
      patternsByCategory[pattern.category] = (patternsByCategory[pattern.category] || 0) + 1;
      patternsBySeverity[pattern.severity] = (patternsBySeverity[pattern.severity] || 0) + 1;
      totalHelpful += pattern.feedback.helpful;
      totalHarmful += pattern.feedback.harmful;
    }

    const stats = {
      patternsTotal: playbook.patterns.length,
      patternsByCategory,
      patternsBySeverity,
      feedbackStats: {
        helpful: totalHelpful,
        harmful: totalHarmful,
        total: totalHelpful + totalHarmful,
      },
      playbookPath,
    };

    if (jsonOutput) {
      console.log(JSON.stringify({
        success: true,
        ...stats,
      }, null, 2));
    } else {
      console.log('SLSM Statistics');
      console.log('===============');
      console.log(`Total patterns: ${stats.patternsTotal}`);
      console.log();

      if (stats.patternsTotal > 0) {
        console.log('By category:');
        for (const [category, count] of Object.entries(patternsByCategory)) {
          console.log(`  ${category}: ${count}`);
        }
        console.log();

        console.log('By severity:');
        console.log(`  High: ${patternsBySeverity.high}`);
        console.log(`  Medium: ${patternsBySeverity.medium}`);
        console.log(`  Low: ${patternsBySeverity.low}`);
        console.log();

        console.log('Feedback:');
        console.log(`  Helpful votes: ${totalHelpful}`);
        console.log(`  Harmful votes: ${totalHarmful}`);
        if (totalHelpful + totalHarmful > 0) {
          const ratio = ((totalHelpful / (totalHelpful + totalHarmful)) * 100).toFixed(1);
          console.log(`  Approval rate: ${ratio}%`);
        }
      } else {
        console.log('No patterns in playbook yet.');
        console.log('Tip: Run "slsm reflect" to extract patterns from logs.');
      }
      console.log();
      console.log(`Playbook: ${playbookPath}`);
    }
  });
