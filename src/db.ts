import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "grievance.db");

let db: DatabaseSync | null = null;

export function initDb(): DatabaseSync {
  if (db) return db;
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      role TEXT NOT NULL CHECK(role IN ('citizen', 'authority')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS grievance_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS grievances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_number TEXT UNIQUE NOT NULL,
      citizen_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      reporter_name TEXT,
      reporter_email TEXT,
      reporter_mobile TEXT,
      assigned_department TEXT,
      location TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      images_json TEXT,
      priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'urgent')),
      status TEXT DEFAULT 'submitted' CHECK(status IN ('submitted', 'under_review', 'in_progress', 'awaiting_confirmation', 'closed', 'escalated', 'reopened')),
      complaint_status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (citizen_id) REFERENCES users(id),
      FOREIGN KEY (category_id) REFERENCES grievance_categories(id)
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS telegram_sessions (
      chat_id TEXT PRIMARY KEY,
      user_id INTEGER,
      state TEXT NOT NULL DEFAULT 'idle',
      language TEXT NOT NULL DEFAULT 'en',
      draft_json TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS telegram_updates (
      update_id INTEGER PRIMARY KEY,
      processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  ensureColumn(db, "users", "phone", "TEXT");
  ensureColumn(db, "users", "telegram_chat_id", "TEXT");
  ensureColumn(db, "grievances", "reporter_name", "TEXT");
  ensureColumn(db, "grievances", "reporter_email", "TEXT");
  ensureColumn(db, "grievances", "reporter_mobile", "TEXT");
  ensureColumn(db, "grievances", "assigned_department", "TEXT");
  ensureColumn(db, "grievances", "images_json", "TEXT");
  ensureColumn(db, "grievances", "complaint_status", "TEXT DEFAULT 'pending'");
  ensureColumn(db, "grievances", "source_channel", "TEXT");
  ensureColumn(db, "grievances", "source_user_id", "TEXT");

  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_chat_id ON users(telegram_chat_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_grievances_source_user ON grievances(source_channel, source_user_id)");

  seed(db);
  return db;
}

export function getDb(): DatabaseSync {
  if (!db) throw new Error("Database not initialized");
  return db;
}

function seed(database: DatabaseSync) {
  const categoryNames = [
    "Roads & Potholes",
    "Waste Management",
    "Street Lights",
    "Water Supply",
    "Drainage",
    "Public Safety"
  ];

  const insertCategory = database.prepare("INSERT OR IGNORE INTO grievance_categories (name) VALUES (?)");
  for (const name of categoryNames) {
    insertCategory.run(name);
  }

  const adminEmail = "admin@nagarseva.gov";
  const adminHash = bcrypt.hashSync("admin123", 10);
  database
    .prepare("INSERT OR IGNORE INTO users (email, password, name, role) VALUES (?, ?, ?, 'authority')")
    .run(adminEmail, adminHash, "Municipal Officer");

  const citizenEmail = "citizen@nagarseva.com";
  const citizenHash = bcrypt.hashSync("citizen123", 10);
  database
    .prepare("INSERT OR IGNORE INTO users (email, password, name, role) VALUES (?, ?, ?, 'citizen')")
    .run(citizenEmail, citizenHash, "Harsh");

  const existingCount = Number(database.prepare("SELECT COUNT(*) as count FROM grievances").get()?.count ?? 0);
  if (existingCount > 0) return;

  const citizen = database.prepare("SELECT id FROM users WHERE email = ?").get(citizenEmail) as { id: number } | undefined;
  if (!citizen) return;

  const categoryRows = database.prepare("SELECT id, name FROM grievance_categories").all() as Array<{ id: number; name: string }>;
  const byName = new Map(categoryRows.map((row) => [row.name, row.id]));

  const insertGrievance = database.prepare(`
    INSERT INTO grievances
      (ticket_number, citizen_id, category_id, title, description, location, latitude, longitude, priority, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertGrievance.run(
    "GRV-PNE001",
    citizen.id,
    byName.get("Roads & Potholes"),
    "Deep pothole near FC Road signal",
    "Large pothole causing bike accidents during evening hours.",
    "FC Road, Pune",
    18.5204,
    73.8567,
    "high",
    "in_progress"
  );

  insertGrievance.run(
    "GRV-PNE002",
    citizen.id,
    byName.get("Waste Management"),
    "Overflowing garbage bin",
    "Bin has not been collected for 4 days and is spilling on road.",
    "Kothrud Depot, Pune",
    18.5074,
    73.8077,
    "medium",
    "submitted"
  );

  insertGrievance.run(
    "GRV-PNE003",
    citizen.id,
    byName.get("Street Lights"),
    "Street lights not working",
    "Entire lane remains dark after sunset and feels unsafe.",
    "Baner Road, Pune",
    18.559,
    73.7868,
    "urgent",
    "under_review"
  );
}

function ensureColumn(database: DatabaseSync, table: string, column: string, definition: string) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  const exists = columns.some((item) => item.name === column);
  if (!exists) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
