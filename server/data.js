// Unified data access layer: Supabase if configured, else SQLite fallback
const { getSupabase } = require('./supabase');
const sqlite = require('./db');

function usingSupabase(){ return !!getSupabase(); }

// Helper to standardize return after Supabase insert/select
function supaResult(res){
  if (res.error) throw res.error;
  return res.data;
}

// Users & Workspaces
async function registerOrLoginUser(email, passwordHash){
  if (!usingSupabase()) {
    // SQLite path delegated to auth.js existing logic
    throw new Error('SQLite user creation handled elsewhere');
  }
  const supa = getSupabase();
  const existing = supaResult(await supa.from('users').select('*').eq('email', email).limit(1));
  if (existing.length) return existing[0];
  const inserted = supaResult(await supa.from('users').insert({ email, password_hash: passwordHash }).select());
  return inserted[0];
}

async function ensureWorkspaceForUser(user){
  if (!usingSupabase()) return null;
  const supa = getSupabase();
  const slug = user.email.split('@')[0].replace(/[^a-z0-9]+/gi,'-').toLowerCase();
  const existing = supaResult(await supa.from('workspaces').select('*').eq('owner_user_id', user.id).limit(1));
  if (existing.length) return existing[0];
  const created = supaResult(await supa.from('workspaces').insert({ slug, name: slug, owner_user_id: user.id }).select());
  return created[0];
}

// Messages
async function saveMessage(record){
  if (!usingSupabase()) return sqlite.saveMessage(record);
  const supa = getSupabase();
  const inserted = supaResult(await supa.from('messages').insert({
    from_number: record.from_number,
    to_number: record.to_number,
    direction: record.direction,
    text: record.text,
    meta: record.meta || {},
  }).select());
  return inserted[0];
}

async function getMessages(limit=200, peer=null){
  if (!usingSupabase()) return sqlite.getMessages(limit, peer);
  const supa = getSupabase();
  let query = supa.from('messages').select('*').order('created_at', { ascending: false }).limit(limit);
  if (peer) {
    query = query.or(`from_number.eq.${peer},to_number.eq.${peer}`);
  }
  const rows = supaResult(await query);
  return rows;
}

async function upsertContact(phone, name=null){
  if (!usingSupabase()) return sqlite.upsertContact(phone, name);
  const supa = getSupabase();
  const existing = supaResult(await supa.from('contacts').select('id').eq('phone', phone).limit(1));
  if (existing.length) return existing[0].id;
  const inserted = supaResult(await supa.from('contacts').insert({ phone, name }).select('id');
  return inserted[0].id;
}

// Templates CRUD
async function createTemplate({ name, category=null, content }){
  if (!usingSupabase()) return sqlite.createTemplate({ name, category, content });
  const supa = getSupabase();
  const inserted = supaResult(await supa.from('templates').insert({ name, category, content, updated_at: new Date().toISOString() }).select());
  return inserted[0];
}
async function listTemplates(limit=200){
  if (!usingSupabase()) return sqlite.listTemplates(limit);
  const supa = getSupabase();
  const rows = supaResult(await supa.from('templates').select('*').order('updated_at', { ascending:false }).order('created_at', { ascending:false }).limit(limit));
  return rows;
}
async function getTemplateById(id){
  if (!usingSupabase()) return sqlite.getTemplateById(id);
  const supa = getSupabase();
  const rows = supaResult(await supa.from('templates').select('*').eq('id', id).limit(1));
  return rows[0]||null;
}
async function updateTemplate(id, { name, category, content }){
  if (!usingSupabase()) return sqlite.updateTemplate(id, { name, category, content });
  const supa = getSupabase();
  const updated = supaResult(await supa.from('templates').update({ name, category, content, updated_at: new Date().toISOString() }).eq('id', id).select());
  return updated[0]||null;
}
async function deleteTemplate(id){
  if (!usingSupabase()) return sqlite.deleteTemplate(id);
  const supa = getSupabase();
  await supa.from('templates').delete().eq('id', id);
  return { success:true };
}

// Automations CRUD
async function createAutomation({ name, flow_json }){
  if (!usingSupabase()) return sqlite.createAutomation({ name, flow_json });
  const supa = getSupabase();
  const inserted = supaResult(await supa.from('automations').insert({ name, flow_json, updated_at: new Date().toISOString() }).select());
  return inserted[0];
}
async function listAutomations(limit=200){
  if (!usingSupabase()) return sqlite.listAutomations(limit);
  const supa = getSupabase();
  const rows = supaResult(await supa.from('automations').select('*').order('updated_at',{ascending:false}).order('created_at',{ascending:false}).limit(limit));
  return rows;
}
async function getAutomationById(id){
  if (!usingSupabase()) return sqlite.getAutomationById(id);
  const supa = getSupabase();
  const rows = supaResult(await supa.from('automations').select('*').eq('id', id).limit(1));
  return rows[0]||null;
}
async function updateAutomation(id, { name, flow_json }){
  if (!usingSupabase()) return sqlite.updateAutomation(id, { name, flow_json });
  const supa = getSupabase();
  const updated = supaResult(await supa.from('automations').update({ name, flow_json, updated_at: new Date().toISOString() }).eq('id', id).select());
  return updated[0]||null;
}
async function deleteAutomation(id){
  if (!usingSupabase()) return sqlite.deleteAutomation(id);
  const supa = getSupabase();
  await supa.from('automations').delete().eq('id', id);
  return { success:true };
}

// Invoices / Subscriptions
async function createInvoice({ invoice_id, workspace, plan, amount, currency }){
  if (!usingSupabase()) return sqlite.createInvoice({ invoice_id, workspace, plan, amount, currency });
  const supa = getSupabase();
  const inserted = supaResult(await supa.from('invoices').insert({ invoice_id, workspace, plan, amount, currency, status:'pending' }).select());
  return inserted[0];
}
async function getInvoiceByInvoiceId(invoice_id){
  if (!usingSupabase()) return sqlite.getInvoiceByInvoiceId(invoice_id);
  const supa = getSupabase();
  const rows = supaResult(await supa.from('invoices').select('*').eq('invoice_id', invoice_id).limit(1));
  return rows[0]||null;
}
async function listInvoices(limit=100){
  if (!usingSupabase()) return sqlite.listInvoices(limit);
  const supa = getSupabase();
  const rows = supaResult(await supa.from('invoices').select('*').order('created_at',{ascending:false}).limit(limit));
  return rows;
}
async function markInvoicePaid(invoice_id){
  if (!usingSupabase()) return sqlite.markInvoicePaid(invoice_id);
  const supa = getSupabase();
  await supa.from('invoices').update({ status:'paid' }).eq('invoice_id', invoice_id);
  return getInvoiceByInvoiceId(invoice_id);
}
async function createSubscription({ workspace, plan, months=1 }){
  if (!usingSupabase()) return sqlite.createSubscription({ workspace, plan, months });
  const started = new Date();
  const expires = new Date(Date.now() + months*30*24*60*60*1000);
  const supa = getSupabase();
  const inserted = supaResult(await supa.from('subscriptions').insert({ workspace, plan, status:'active', started_at: started.toISOString(), expires_at: expires.toISOString() }).select());
  return inserted[0];
}
async function getSubscriptionByWorkspace(workspace){
  if (!usingSupabase()) return sqlite.getSubscriptionByWorkspace(workspace);
  const supa = getSupabase();
  const rows = supaResult(await supa.from('subscriptions').select('*').eq('workspace', workspace).order('id',{ascending:false}).limit(1));
  return rows[0]||null;
}

// Analytics
async function getTotals(){
  if (!usingSupabase()) return sqlite.getTotals();
  const supa = getSupabase();
  const inbound = supaResult(await supa.from('messages').select('id', { count:'exact', head:true }).eq('direction','in')).length;
  const outbound = supaResult(await supa.from('messages').select('id', { count:'exact', head:true }).eq('direction','out')).length;
  return { in: inbound, out: outbound };
}
async function getCountsByDay(days=14){
  if (!usingSupabase()) return sqlite.getCountsByDay(days);
  const supa = getSupabase();
  const since = new Date(Date.now() - days*24*60*60*1000).toISOString();
  const rows = supaResult(await supa.from('messages').select('created_at,direction').gte('created_at', since));
  const bucket = {};
  for (const r of rows){
    const day = r.created_at.slice(0,10);
    if (!bucket[day]) bucket[day] = { in:0, out:0 };
    bucket[day][r.direction]++;
  }
  return Object.entries(bucket).sort(([a],[b])=> a.localeCompare(b)).map(([date, counts]) => ({ date, in: counts.in, out: counts.out }));
}
async function getTopContacts(limit=5){
  if (!usingSupabase()) return sqlite.getTopContacts(limit);
  const supa = getSupabase();
  const rows = supaResult(await supa.from('messages').select('from_number,to_number,direction'));
  const tally = {};
  for (const m of rows){
    const peer = m.direction==='in' ? m.from_number : m.to_number;
    tally[peer] = (tally[peer]||0) + 1;
  }
  return Object.entries(tally).sort((a,b)=> b[1]-a[1]).slice(0,limit).map(([peer,count])=>({peer,count}));
}

module.exports = {
  usingSupabase,
  // user/workspace (partial for now)
  registerOrLoginUser,
  ensureWorkspaceForUser,
  // messaging
  saveMessage,
  getMessages,
  upsertContact,
  // templates
  createTemplate, listTemplates, getTemplateById, updateTemplate, deleteTemplate,
  // automations
  createAutomation, listAutomations, getAutomationById, updateAutomation, deleteAutomation,
  // billing/subscriptions
  createInvoice, getInvoiceByInvoiceId, listInvoices, markInvoicePaid, createSubscription, getSubscriptionByWorkspace,
  // analytics
  getTotals, getCountsByDay, getTopContacts
};
