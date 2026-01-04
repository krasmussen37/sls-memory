/**
 * Pattern matching module
 */

import type { Pattern, Playbook } from './playbook.js';

export interface MatchResult {
  pattern: Pattern;
  score: number;
  matchedKeywords: string[];
}

/**
 * Extract keywords from an error message
 */
export function extractKeywords(message: string): string[] {
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

/**
 * Calculate similarity score between two keyword sets
 */
export function calculateScore(keywords1: string[], keywords2: string[]): number {
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

  // Jaccard-like similarity
  const union = new Set([...set1, ...set2]);
  return (matches / union.size) * 100;
}

/**
 * Find patterns matching an error message
 */
export function findMatchingPatterns(
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

  // Sort by score and return top matches
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
