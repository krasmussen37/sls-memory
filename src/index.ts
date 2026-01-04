#!/usr/bin/env bun
/**
 * SLSM - SLS Memory
 * 
 * Extract recurring error patterns into a playbook. When agents encounter
 * known errors, surface fixes immediately.
 */

import { Command } from 'commander';
import { contextCommand } from './cli/context.js';
import { similarCommand } from './cli/similar.js';
import { reflectCommand } from './cli/reflect.js';
import { markCommand } from './cli/mark.js';
import { playbookCommand } from './cli/playbook.js';
import { statsCommand } from './cli/stats.js';

const program = new Command();

program
  .name('slsm')
  .description('SLS Memory - Extract and apply error pattern knowledge')
  .version('0.1.0');

// Global options
program
  .option('--json', 'Output in JSON format')
  .option('--robot', 'Machine-readable output (alias for --json)');

// Core commands
program.addCommand(contextCommand);
program.addCommand(similarCommand);
program.addCommand(reflectCommand);
program.addCommand(markCommand);
program.addCommand(playbookCommand);
program.addCommand(statsCommand);

// Parse and run
program.parse();
