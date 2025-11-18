const Database = require('better-sqlite3');
const db = new Database('./caribchat.db');

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_number TEXT,
      to_number TEXT,
      direction TEXT,
      text TEXT,
      meta TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE,
      name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id TEXT UNIQUE,
      workspace TEXT,
      plan TEXT,
      amount REAL,
      currency TEXT,
      status TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace TEXT,
      plan TEXT,
      status TEXT,
      started_at DATETIME,
      expires_at DATETIME
    );
    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      category TEXT,
      content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME
    );
    CREATE TABLE IF NOT EXISTS automations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      flow_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password_hash TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE,
      name TEXT,
      owner_user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function saveMessage({ from_number, to_number, direction, text, meta }) {
  const stmt = db.prepare(`INSERT INTO messages (from_number,to_number,direction,text,meta) VALUES (?,?,?,?,?)`);
  const info = stmt.run(from_number, to_number, direction, text, JSON.stringify(meta || {}));
  return info.lastInsertRowid;
}

function getMessages(limit = 200, peer = null) {
  if (peer) {
    return db.prepare(`
      SELECT * FROM messages
      WHERE from_number = ? OR to_number = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(peer, peer, limit);
  }
  return db.prepare(`SELECT * FROM messages ORDER BY created_at DESC LIMIT ?`).all(limit);
}

function upsertContact(phone, name = null) {
  const exists = db.prepare(`SELECT id FROM contacts WHERE phone = ?`).get(phone);
  if (exists) return exists.id;
  const info = db.prepare(`INSERT INTO contacts (phone,name) VALUES (?,?)`).run(phone, name);
  return info.lastInsertRowid;
}

function createInvoice({ invoice_id, workspace, plan, amount, currency }) {
  const stmt = db.prepare(`INSERT INTO invoices (invoice_id,workspace,plan,amount,currency,status) VALUES (?,?,?,?,?,?)`);
  const info = stmt.run(invoice_id, workspace, plan, amount, currency, 'pending');
  return info.lastInsertRowid;
}

function getInvoiceByInvoiceId(invoice_id) {
  return db.prepare(`SELECT * FROM invoices WHERE invoice_id = ?`).get(invoice_id);
}

function listInvoices(limit = 100) {
  return db.prepare(`SELECT * FROM invoices ORDER BY created_at DESC LIMIT ?`).all(limit);
}

function markInvoicePaid(invoice_id) {
  const stmt = db.prepare(`UPDATE invoices SET status='paid' WHERE invoice_id = ?`);
  stmt.run(invoice_id);
  return getInvoiceByInvoiceId(invoice_id);
}

function createSubscription({ workspace, plan, months=1 }) {
  const started = new Date().toISOString();
  const expires = new Date(Date.now() + months*30*24*60*60*1000).toISOString();
  const stmt = db.prepare(`INSERT INTO subscriptions (workspace,plan,status,started_at,expires_at) VALUES (?,?,?,?,?)`);
  const info = stmt.run(workspace, plan, 'active', started, expires);
  return { id: info.lastInsertRowid, workspace, plan, status:'active', started_at: started, expires_at: expires };
}

function getSubscriptionByWorkspace(workspace) {
  return db.prepare(`SELECT * FROM subscriptions WHERE workspace = ? ORDER BY id DESC LIMIT 1`).get(workspace);
}

// Analytics helpers
function getTotals() {
  const inbound = db.prepare(`SELECT COUNT(*) as c FROM messages WHERE direction='in'`).get().c;
  const outbound = db.prepare(`SELECT COUNT(*) as c FROM messages WHERE direction='out'`).get().c;
  return { in: inbound, out: outbound };
}

function getCountsByDay(days=14) {
  const rows = db.prepare(`
    SELECT date(created_at) as day,
      SUM(CASE WHEN direction='in' THEN 1 ELSE 0 END) as in_count,
      SUM(CASE WHEN direction='out' THEN 1 ELSE 0 END) as out_count
    FROM messages
    WHERE created_at >= datetime('now', ?)
    GROUP BY day
    ORDER BY day ASC
  `).all(`-${days} days`);
  return rows.map(r => ({ date: r.day, in: r.in_count, out: r.out_count }));
}

function getTopContacts(limit=5) {
  return db.prepare(`
    SELECT peer, COUNT(*) as count FROM (
      SELECT CASE WHEN direction='in' THEN from_number ELSE to_number END as peer
      FROM messages
    )
    GROUP BY peer
    ORDER BY count DESC
    LIMIT ?
  `).all(limit);
}

// Templates
function createTemplate({ name, category=null, content }) {
  const now = new Date().toISOString();
  const stmt = db.prepare(`INSERT INTO templates (name,category,content,updated_at) VALUES (?,?,?,?)`);
  const info = stmt.run(name, category, content, now);
  return getTemplateById(info.lastInsertRowid);
}

function listTemplates(limit=200) {
  return db.prepare(`SELECT * FROM templates ORDER BY updated_at DESC, created_at DESC LIMIT ?`).all(limit);
}

function getTemplateById(id) {
  return db.prepare(`SELECT * FROM templates WHERE id = ?`).get(id);
}

function updateTemplate(id, { name, category, content }) {
  const now = new Date().toISOString();
  const existing = getTemplateById(id);
  if (!existing) return null;
  const n = name ?? existing.name;
  const c = category ?? existing.category;
  const t = content ?? existing.content;
  db.prepare(`UPDATE templates SET name=?, category=?, content=?, updated_at=? WHERE id=?`).run(n, c, t, now, id);
  return getTemplateById(id);
}

function deleteTemplate(id) {
  db.prepare(`DELETE FROM templates WHERE id = ?`).run(id);
  return { success: true };
}

// Automations
function createAutomation({ name, flow_json }) {
  const now = new Date().toISOString();
  const stmt = db.prepare(`INSERT INTO automations (name,flow_json,updated_at) VALUES (?,?,?)`);
  const info = stmt.run(name, JSON.stringify(flow_json || {}), now);
  return getAutomationById(info.lastInsertRowid);
}

function listAutomations(limit=200) {
  return db.prepare(`SELECT * FROM automations ORDER BY updated_at DESC, created_at DESC LIMIT ?`).all(limit);
}

function getAutomationById(id) {
  const row = db.prepare(`SELECT * FROM automations WHERE id = ?`).get(id);
  if (!row) return null;
  try { row.flow_json = JSON.parse(row.flow_json || '{}'); } catch { row.flow_json = {}; }
  return row;
}

function updateAutomation(id, { name, flow_json }) {
  const now = new Date().toISOString();
  const existing = db.prepare(`SELECT * FROM automations WHERE id = ?`).get(id);
  if (!existing) return null;
  const n = name ?? existing.name;
  const fj = flow_json ? JSON.stringify(flow_json) : existing.flow_json;
  db.prepare(`UPDATE automations SET name=?, flow_json=?, updated_at=? WHERE id=?`).run(n, fj, now, id);
  return getAutomationById(id);
}

function deleteAutomation(id) {
  db.prepare(`DELETE FROM automations WHERE id = ?`).run(id);
  return { success: true };
}

module.exports = { init, saveMessage, getMessages, upsertContact, createInvoice, getInvoiceByInvoiceId, listInvoices, markInvoicePaid, createSubscription, getSubscriptionByWorkspace, createTemplate, listTemplates, getTemplateById, updateTemplate, deleteTemplate, createAutomation, listAutomations, getAutomationById, updateAutomation, deleteAutomation, getTotals, getCountsByDay, getTopContacts };
