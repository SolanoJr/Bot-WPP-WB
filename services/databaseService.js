// CommonJS implementation of the database service (same logic as src/services/databaseService.ts)
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');

const DB_DIR = 'data';
const DB_FILE = 'bot_database.db';

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const dbPath = path.join(process.cwd(), DB_DIR, DB_FILE);

async function initDatabase() {
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database ? sqlite3.Database : sqlite3.CJS,
  });

  await db.exec(
    `CREATE TABLE IF NOT EXISTS command_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      command_name TEXT,
      user_id TEXT,
      group_id TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );`
  );

  await db.exec(
    `CREATE TABLE IF NOT EXISTS feedbacks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      message TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );`
  );

  await db.exec(
    `CREATE TABLE IF NOT EXISTS custom_commands (
      id TEXT PRIMARY KEY,
      group_id TEXT,
      comando TEXT,
      resposta TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );`
  );

  await db.exec(
    `CREATE TABLE IF NOT EXISTS ai_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      prompt TEXT,
      response TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );`
  );

  return db;
}

async function getDb() {
  return await initDatabase();
}

module.exports = { initDatabase, getDb };
