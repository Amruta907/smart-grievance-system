const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'grievance.db');

let _db = null;

function getDb() {
  if (_db) return _db;
  throw new Error('Database not initialized. Call initDb() first.');
}

async function initDb() {
  if (_db) return _db;
  const SQL = await initSqlJs();
  let db;
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  _db = createCompatLayer(db);
  runSchema(_db);
  return _db;
}

function createCompatLayer(db) {
  const save = () => {
    try {
      const data = db.export();
      fs.writeFileSync(dbPath, Buffer.from(data));
    } catch (e) {}
  };
  return {
    prepare(sql) {
      return {
        run(...params) {
          const stmt = db.prepare(sql);
          stmt.bind(params);
          stmt.step();
          stmt.free();
          save();
          const res = db.exec("SELECT last_insert_rowid() as id");
          const lastId = res.length && res[0].values && res[0].values[0] ? res[0].values[0][0] : 0;
          return { lastInsertRowid: lastId, changes: db.getRowsModified ? db.getRowsModified() : 0 };
        },
        get(...params) {
          const stmt = db.prepare(sql);
          stmt.bind(params);
          const row = stmt.step() ? stmt.getAsObject() : null;
          stmt.free();
          return row;
        },
        all(...params) {
          const stmt = db.prepare(sql);
          stmt.bind(params);
          const rows = [];
          while (stmt.step()) rows.push(stmt.getAsObject());
          stmt.free();
          return rows;
        }
      };
    },
    exec(sql) {
      db.exec(sql);
      save();
    }
  };
}

function runSchema(db) {
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
      name TEXT NOT NULL,
      description TEXT,
      department TEXT
    );
    CREATE TABLE IF NOT EXISTS grievances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_number TEXT UNIQUE NOT NULL,
      citizen_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      title TEXT ,
      description TEXT NOT NULL,
      location TEXT,
      latitude REAL,
      longitude REAL,
      image TEXT,
      status TEXT DEFAULT 'submitted' CHECK(status IN ('submitted', 'assigned', 'in_progress', 'resolved', 'rejected', 'reopened')),
      priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'urgent')),
      assigned_to INTEGER,
      department TEXT,
      resolution_notes TEXT,
      resolution_image TEXT,
      citizen_rating INTEGER,
      citizen_feedback TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      FOREIGN KEY (citizen_id) REFERENCES users(id),
      FOREIGN KEY (category_id) REFERENCES grievance_categories(id),
      FOREIGN KEY (assigned_to) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS grievance_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grievance_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      comment TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (grievance_id) REFERENCES grievances(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_grievances_citizen ON grievances(citizen_id);
    CREATE INDEX IF NOT EXISTS idx_grievances_status ON grievances(status);
    CREATE INDEX IF NOT EXISTS idx_grievances_assigned ON grievances(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_grievances_created ON grievances(created_at);
  `);
  const categories = [
    ['Potholes & Roads', 'Road damage, potholes, pavement issues', 'Public Works'],
    ['Street Lights', 'Non-functional street lights, dark areas', 'Municipal Corporation'],
    ['Waste Management', 'Garbage collection, dumping, sanitation', 'Sanitation Department'],
    ['Water Supply', 'Water leakage, supply issues', 'Water Board'],
    ['Drainage', 'Blocked drains, flooding', 'Drainage Department'],
    ['Parks & Green Spaces', 'Maintenance of parks and gardens', 'Horticulture'],
    ['Traffic & Parking', 'Traffic signals, parking issues', 'Traffic Police'],
    ['Noise Pollution', 'Noise complaints', 'Pollution Control'],
    ['Other', 'Other civic issues', 'General']
  ];
  categories.forEach(([name, desc, dept]) => {
    try {
      db.prepare('INSERT OR IGNORE INTO grievance_categories (name, description, department) VALUES (?, ?, ?)').run(name, desc, dept);
    } catch (e) {}
  });
  const adminHash = bcrypt.hashSync('admin123', 10);
  try {
    db.prepare(`INSERT OR IGNORE INTO users (email, password, name, role) VALUES (?, ?, ?, 'authority')`).run('admin@government.gov', adminHash, 'System Administrator');
  } catch (e) {}
}

module.exports = { initDb, getDb };
