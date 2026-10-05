/**
 * quizService — jogo de perguntas e respostas (geek).
 *
 * Funcionalidade real (não fantasma). Arquitetura: SQLite por grupo + comandos simples.
 */
import { getDb } from './databaseService';

export interface QuizItem {
  quiz_id: string;
  group_id: string;
  question: string;
  answer: string;
  category: string;
  created_at: number;
}

export async function initQuizTable(): Promise<void> {
  const db = await getDb();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS quiz_items (
      quiz_id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      category TEXT DEFAULT 'geek',
      created_at INTEGER NOT NULL
    );
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_quiz_group ON quiz_items(group_id);`);
}

export async function addQuiz(group_id: string, question: string, answer: string, category = 'geek'): Promise<string> {
  const db = await getDb();
  const id = `quiz_${group_id}_${Date.now()}`;
  await db.run(
    `INSERT INTO quiz_items (quiz_id, group_id, question, answer, category, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, group_id, question, answer, category, Date.now()]
  );
  return id;
}

export async function getRandomQuiz(group_id?: string): Promise<QuizItem | null> {
  const db = await getDb();
  if (group_id) {
    const row = await db.get(
      `SELECT * FROM quiz_items WHERE group_id = ? ORDER BY RANDOM() LIMIT 1`,
      [group_id]
    );
    return row ? (row as QuizItem) : null;
  }
  const row = await db.get(`SELECT * FROM quiz_items ORDER BY RANDOM() LIMIT 1`);
  return row ? (row as QuizItem) : null;
}

export async function listQuizzes(group_id?: string): Promise<QuizItem[]> {
  const db = await getDb();
  if (group_id) {
    return await db.all(`SELECT * FROM quiz_items WHERE group_id = ?`, [group_id]);
  }
  return await db.all(`SELECT * FROM quiz_items`);
}
