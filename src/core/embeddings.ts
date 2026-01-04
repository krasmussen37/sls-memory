/**
 * Embeddings module for semantic similarity matching
 *
 * Uses TF-IDF based embeddings as a baseline. Can be enhanced with
 * neural embeddings (e.g., from a local model or API) in the future.
 */

import { Database } from 'bun:sqlite';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import type { Pattern } from './playbook.js';

/**
 * TF-IDF document representation
 */
interface TfIdfVector {
  terms: Map<string, number>;
  magnitude: number;
}

/**
 * Stored embedding for a pattern
 */
export interface StoredEmbedding {
  patternId: string;
  vector: number[];
  text: string;
  updatedAt: number;
}

/**
 * Get the embeddings database path
 */
export function getEmbeddingsDbPath(): string {
  return path.join(os.homedir(), '.sls-memory', 'embeddings.db');
}

/**
 * Initialize the embeddings database
 */
export function initEmbeddingsDb(): Database {
  const dbPath = getEmbeddingsDbPath();
  const dir = path.dirname(dbPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS embeddings (
      pattern_id TEXT PRIMARY KEY,
      vector BLOB NOT NULL,
      text TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS vocabulary (
      term TEXT PRIMARY KEY,
      doc_count INTEGER NOT NULL DEFAULT 1,
      idf REAL
    )
  `);

  return db;
}

/**
 * Tokenize text into terms
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_\s]/g, ' ')
    .split(/\s+/)
    .filter(term => term.length >= 2);
}

/**
 * Compute term frequency for a document
 */
function computeTf(terms: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const term of terms) {
    tf.set(term, (tf.get(term) || 0) + 1);
  }
  // Normalize by document length
  const docLength = terms.length;
  for (const [term, count] of tf) {
    tf.set(term, count / docLength);
  }
  return tf;
}

/**
 * Compute IDF values for vocabulary
 */
function computeIdf(documents: string[][], vocabulary: Set<string>): Map<string, number> {
  const docCount = documents.length;
  const idf = new Map<string, number>();

  for (const term of vocabulary) {
    let termDocCount = 0;
    for (const doc of documents) {
      if (doc.includes(term)) {
        termDocCount++;
      }
    }
    // IDF with smoothing
    idf.set(term, Math.log((docCount + 1) / (termDocCount + 1)) + 1);
  }

  return idf;
}

/**
 * Convert TF-IDF to vector and compute magnitude
 */
function toVector(tf: Map<string, number>, idf: Map<string, number>): TfIdfVector {
  const terms = new Map<string, number>();
  let sumSquares = 0;

  for (const [term, tfValue] of tf) {
    const idfValue = idf.get(term) || 1;
    const tfidf = tfValue * idfValue;
    terms.set(term, tfidf);
    sumSquares += tfidf * tfidf;
  }

  return {
    terms,
    magnitude: Math.sqrt(sumSquares),
  };
}

/**
 * Compute cosine similarity between two TF-IDF vectors
 */
function cosineSimilarity(v1: TfIdfVector, v2: TfIdfVector): number {
  if (v1.magnitude === 0 || v2.magnitude === 0) {
    return 0;
  }

  let dotProduct = 0;
  for (const [term, value1] of v1.terms) {
    const value2 = v2.terms.get(term);
    if (value2 !== undefined) {
      dotProduct += value1 * value2;
    }
  }

  return dotProduct / (v1.magnitude * v2.magnitude);
}

/**
 * Embeddings manager for pattern similarity
 */
export class EmbeddingsManager {
  private db: Database;
  private idf: Map<string, number> = new Map();
  private vectors: Map<string, TfIdfVector> = new Map();

  constructor() {
    this.db = initEmbeddingsDb();
  }

  /**
   * Build embeddings from patterns
   */
  buildFromPatterns(patterns: Pattern[]): void {
    if (patterns.length === 0) return;

    // Tokenize all patterns
    const documents: string[][] = [];
    const vocabulary = new Set<string>();

    for (const pattern of patterns) {
      const text = this.patternToText(pattern);
      const terms = tokenize(text);
      documents.push(terms);
      for (const term of terms) {
        vocabulary.add(term);
      }
    }

    // Compute IDF
    this.idf = computeIdf(documents, vocabulary);

    // Compute and store vectors
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO embeddings (pattern_id, vector, text, updated_at)
      VALUES (?, ?, ?, ?)
    `);

    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
      const text = this.patternToText(pattern);
      const terms = tokenize(text);
      const tf = computeTf(terms);
      const vector = toVector(tf, this.idf);

      this.vectors.set(pattern.id, vector);

      // Serialize vector for storage
      const vectorData = JSON.stringify(Array.from(vector.terms.entries()));
      stmt.run(pattern.id, vectorData, text, Math.floor(Date.now() / 1000));
    }

    // Store vocabulary IDF values
    const vocabStmt = this.db.prepare(`
      INSERT OR REPLACE INTO vocabulary (term, doc_count, idf)
      VALUES (?, ?, ?)
    `);
    for (const [term, idfValue] of this.idf) {
      vocabStmt.run(term, 1, idfValue);
    }
  }

  /**
   * Convert pattern to searchable text
   */
  private patternToText(pattern: Pattern): string {
    return [
      pattern.title,
      pattern.category,
      ...pattern.symptoms,
      ...pattern.root_causes,
      pattern.fixes.map(f => f.step).join(' '),
    ].join(' ');
  }

  /**
   * Find similar patterns using embeddings
   */
  findSimilar(query: string, limit: number = 5): Array<{ patternId: string; score: number }> {
    // Load IDF from database if not in memory
    if (this.idf.size === 0) {
      const rows = this.db.prepare('SELECT term, idf FROM vocabulary').all() as Array<{term: string; idf: number}>;
      for (const row of rows) {
        this.idf.set(row.term, row.idf);
      }
    }

    // Load vectors from database if not in memory
    if (this.vectors.size === 0) {
      const rows = this.db.prepare('SELECT pattern_id, vector FROM embeddings').all() as Array<{pattern_id: string; vector: string}>;
      for (const row of rows) {
        const entries = JSON.parse(row.vector) as Array<[string, number]>;
        const terms = new Map(entries);
        let sumSquares = 0;
        for (const value of terms.values()) {
          sumSquares += value * value;
        }
        this.vectors.set(row.pattern_id, { terms, magnitude: Math.sqrt(sumSquares) });
      }
    }

    // Compute query vector
    const queryTerms = tokenize(query);
    const queryTf = computeTf(queryTerms);
    const queryVector = toVector(queryTf, this.idf);

    // Find similar patterns
    const results: Array<{ patternId: string; score: number }> = [];

    for (const [patternId, patternVector] of this.vectors) {
      const score = cosineSimilarity(queryVector, patternVector);
      if (score > 0) {
        results.push({ patternId, score });
      }
    }

    // Sort by score and return top matches
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}
