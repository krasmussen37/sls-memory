/**
 * Playbook management module
 *
 * The playbook stores error patterns with known fixes.
 * Format: YAML file at ~/.sls-memory/playbook.yaml
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import YAML from 'yaml';

/**
 * A single error pattern in the playbook
 */
export interface Pattern {
  /** Unique identifier (e.g., slsm-001) */
  id: string;
  /** Fingerprint for deduplication (e.g., "connection-refused-postgres") */
  fingerprint: string;
  /** Regex pattern to match error messages */
  pattern: string;
  /** Severity level */
  severity: 'low' | 'medium' | 'high';
  /** Category (e.g., "database", "network", "filesystem") */
  category: string;
  /** Human-readable title */
  title: string;
  /** List of symptom strings that match this pattern */
  symptoms: string[];
  /** Known root causes */
  root_causes: string[];
  /** Fix steps */
  fixes: Fix[];
  /** User feedback counts */
  feedback: Feedback;
}

/**
 * A fix step for a pattern
 */
export interface Fix {
  /** Description of the fix step */
  step: string;
  /** Optional command to run */
  command?: string;
}

/**
 * Feedback tracking for a pattern
 */
export interface Feedback {
  /** Number of helpful votes */
  helpful: number;
  /** Number of harmful votes */
  harmful: number;
}

/**
 * The complete playbook structure
 */
export interface Playbook {
  patterns: Pattern[];
}

/**
 * Validation errors
 */
export interface ValidationError {
  path: string;
  message: string;
}

export function getPlaybookPath(): string {
  return path.join(os.homedir(), '.sls-memory', 'playbook.yaml');
}

export function loadPlaybook(): Playbook {
  const playbookPath = getPlaybookPath();
  
  if (!fs.existsSync(playbookPath)) {
    return { patterns: [] };
  }
  
  const content = fs.readFileSync(playbookPath, 'utf-8');
  const data = YAML.parse(content);
  return data || { patterns: [] };
}

export function savePlaybook(playbook: Playbook): void {
  const playbookPath = getPlaybookPath();
  const dir = path.dirname(playbookPath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  const content = YAML.stringify(playbook);
  fs.writeFileSync(playbookPath, content, 'utf-8');
}

export function findPatternById(playbook: Playbook, id: string): Pattern | undefined {
  return playbook.patterns.find(p => p.id === id);
}

export function generatePatternId(): string {
  const num = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `slsm-${num}`;
}

/**
 * Validate a pattern object
 */
export function validatePattern(pattern: unknown, index: number): ValidationError[] {
  const errors: ValidationError[] = [];
  const prefix = `patterns[${index}]`;

  if (typeof pattern !== 'object' || pattern === null) {
    errors.push({ path: prefix, message: 'Pattern must be an object' });
    return errors;
  }

  const p = pattern as Record<string, unknown>;

  // Required string fields
  const requiredStrings = ['id', 'fingerprint', 'pattern', 'category', 'title'];
  for (const field of requiredStrings) {
    if (typeof p[field] !== 'string' || p[field] === '') {
      errors.push({ path: `${prefix}.${field}`, message: `${field} is required and must be a non-empty string` });
    }
  }

  // Severity validation
  const validSeverities = ['low', 'medium', 'high'];
  if (!validSeverities.includes(p.severity as string)) {
    errors.push({ path: `${prefix}.severity`, message: `severity must be one of: ${validSeverities.join(', ')}` });
  }

  // Array fields
  const arrayFields = ['symptoms', 'root_causes', 'fixes'];
  for (const field of arrayFields) {
    if (!Array.isArray(p[field])) {
      errors.push({ path: `${prefix}.${field}`, message: `${field} must be an array` });
    }
  }

  // Feedback validation
  if (typeof p.feedback !== 'object' || p.feedback === null) {
    errors.push({ path: `${prefix}.feedback`, message: 'feedback must be an object' });
  } else {
    const fb = p.feedback as Record<string, unknown>;
    if (typeof fb.helpful !== 'number') {
      errors.push({ path: `${prefix}.feedback.helpful`, message: 'helpful must be a number' });
    }
    if (typeof fb.harmful !== 'number') {
      errors.push({ path: `${prefix}.feedback.harmful`, message: 'harmful must be a number' });
    }
  }

  // Validate regex pattern
  if (typeof p.pattern === 'string') {
    try {
      new RegExp(p.pattern);
    } catch {
      errors.push({ path: `${prefix}.pattern`, message: 'Invalid regex pattern' });
    }
  }

  return errors;
}

/**
 * Validate the entire playbook
 */
export function validatePlaybook(data: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  if (typeof data !== 'object' || data === null) {
    errors.push({ path: '', message: 'Playbook must be an object' });
    return errors;
  }

  const playbook = data as Record<string, unknown>;

  if (!Array.isArray(playbook.patterns)) {
    errors.push({ path: 'patterns', message: 'patterns must be an array' });
    return errors;
  }

  // Check for duplicate IDs
  const ids = new Set<string>();
  for (let i = 0; i < playbook.patterns.length; i++) {
    const pattern = playbook.patterns[i] as Record<string, unknown>;
    if (typeof pattern?.id === 'string') {
      if (ids.has(pattern.id)) {
        errors.push({ path: `patterns[${i}].id`, message: `Duplicate pattern ID: ${pattern.id}` });
      }
      ids.add(pattern.id);
    }

    errors.push(...validatePattern(pattern, i));
  }

  return errors;
}

/**
 * Create a new pattern with default values
 */
export function createPattern(overrides: Partial<Pattern> = {}): Pattern {
  return {
    id: generatePatternId(),
    fingerprint: '',
    pattern: '',
    severity: 'medium',
    category: 'general',
    title: '',
    symptoms: [],
    root_causes: [],
    fixes: [],
    feedback: { helpful: 0, harmful: 0 },
    ...overrides,
  };
}

/**
 * Add a fix to a pattern
 */
export function addFix(pattern: Pattern, step: string, command?: string): void {
  pattern.fixes.push({ step, command });
}

/**
 * Record feedback on a pattern
 */
export function recordFeedback(pattern: Pattern, type: 'helpful' | 'harmful'): void {
  pattern.feedback[type]++;
}
