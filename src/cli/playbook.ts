/**
 * slsm playbook - Manage the playbook
 */

import { Command } from 'commander';

export const playbookCommand = new Command('playbook')
  .description('Manage the error pattern playbook');

playbookCommand
  .command('list')
  .description('List all patterns in the playbook')
  .option('--category <category>', 'Filter by category')
  .action(async (options: { category?: string }) => {
    const parent = playbookCommand.parent;
    const jsonOutput = parent?.opts().json || parent?.opts().robot;

    if (jsonOutput) {
      console.log(JSON.stringify({
        success: true,
        patterns: [],
        total: 0,
      }, null, 2));
    } else {
      console.log('Playbook Patterns');
      console.log('=================');
      if (options.category) {
        console.log(`  Category: ${options.category}`);
      }
      console.log();
      console.log('No patterns in playbook.');
      console.log('Run "slsm reflect" to extract patterns from logs.');
    }
  });

playbookCommand
  .command('add')
  .description('Add a new pattern manually')
  .requiredOption('--pattern <regex>', 'Pattern regex to match')
  .requiredOption('--title <title>', 'Pattern title')
  .option('--category <category>', 'Pattern category')
  .option('--severity <severity>', 'Severity: low, medium, high')
  .action(async (options: { pattern: string; title: string; category?: string; severity?: string }) => {
    const parent = playbookCommand.parent;
    const jsonOutput = parent?.opts().json || parent?.opts().robot;

    if (jsonOutput) {
      console.log(JSON.stringify({
        success: true,
        id: 'slsm-xxx',
        title: options.title,
        pattern: options.pattern,
      }, null, 2));
    } else {
      console.log(`Adding pattern: ${options.title}`);
      console.log(`  Pattern: ${options.pattern}`);
      if (options.category) {
        console.log(`  Category: ${options.category}`);
      }
      if (options.severity) {
        console.log(`  Severity: ${options.severity}`);
      }
      console.log();
      console.log('Pattern added (storage not yet implemented).');
    }
  });

playbookCommand
  .command('get')
  .description('Get details of a specific pattern')
  .argument('<id>', 'Pattern ID')
  .action(async (id: string) => {
    const parent = playbookCommand.parent;
    const jsonOutput = parent?.opts().json || parent?.opts().robot;

    if (jsonOutput) {
      console.log(JSON.stringify({
        success: false,
        error: `Pattern ${id} not found`,
      }, null, 2));
    } else {
      console.log(`Pattern: ${id}`);
      console.log();
      console.log('Pattern not found.');
    }
  });
