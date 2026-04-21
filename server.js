const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const TABLES = ['products', 'orders', 'customers', 'offers', 'chat_messages'];

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    const initial = Object.fromEntries(TABLES.map(t => [t, []]));
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2), 'utf8');
  }
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function writeDb(db) {
  ensureDb();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

function normalizeTable(table) {
  if (!TABLES.includes(table)) return null;
  return table;
}

function now() {
  return Date.now();
}

function makeId(prefix = 'id') {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function getIdPrefix(table) {
  return {
    products: 'prd',
    orders: 'ord',
    customers: 'cus',
    offers: 'off',
    chat_messages: 'msg'
  }[table] || 'id';
}

function sortRecords(items, sortKey) {
  if (!sortKey) return items;
  const desc = sortKey.startsWith('-');
  const key = desc ? sortKey.slice(1) : sortKey;
  return [...items].sort((a, b) => {
    const av = a[key] ?? 0;
    const bv = b[key] ?? 0;
    if (typeof av === 'string' && typeof bv === 'string') {
      return desc ? bv.localeCompare(av, 'ar') : av.localeCompare(bv, 'ar');
    }
    return desc ? (bv - av) : (av - bv);
  });
}

function applyLimit(items, limitValue) {
  const limit = Number(limitValue || 0);
  if (!limit || limit < 0) return items;
  return items.slice(0, limit);
}

function upsertCustomerFromOrder(db, order) {
  if (!order || !order.customer_name) return;
  const phone = String(order.phone || '').trim();
  const name = String(order.customer_name || '').trim();
  if (!name) return;
  const customers = db.customers || [];
  const existing = customers.find(c => String(c.phone || '').trim() === phone && phone) ||
                   customers.find(c => String(c.name || '').trim() === name);
  if (existing) {
    existing.name = name;
    existing.phone = phone || existing.phone || '';
    existing.is_member = Boolean(order.is_member ?? existing.is_member);
    existing.updated_at = now();
  } else {
    customers.unshift({
      id: makeId('cus'),
      name,
      phone,
      address: order.delivery_address || '',
      balance: 0,
      email: '',
      notes: order.notes || '',
      is_member: Boolean(order.is_member),
      created_at: now(),
      updated_at: now()
    });
  }
  db.customers = customers;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'alhabeshi-stores', timestamp: now() });
});

app.get('/tables/:table', (req, res) => {
  const table = normalizeTable(req.params.table);
  if (!table) return res.status(404).json({ error: 'Unknown table' });
  const db = readDb();
  let items = Array.isArray(db[table]) ? [...db[table]] : [];

  const q = String(req.query.q || '').trim().toLowerCase();
  if (q) {
    items = items.filter(row => JSON.stringify(row).toLowerCase().includes(q));
  }

  items = sortRecords(items, req.query.sort);
  const total = items.length;
  items = applyLimit(items, req.query.limit);
  res.json({ data: items, total });
});

app.get('/tables/:table/:id', (req, res) => {
  const table = normalizeTable(req.params.table);
  if (!table) return res.status(404).json({ error: 'Unknown table' });
  const db = readDb();
  const item = (db[table] || []).find(row => row.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

app.post('/tables/:table', (req, res) => {
  const table = normalizeTable(req.params.table);
  if (!table) return res.status(404).json({ error: 'Unknown table' });
  const db = readDb();
  const item = {
    id: makeId(getIdPrefix(table)),
    ...req.body,
    created_at: req.body.created_at || req.body.timestamp || req.body.order_date || now(),
    updated_at: now()
  };
  db[table] = Array.isArray(db[table]) ? db[table] : [];
  db[table].unshift(item);
  if (table === 'orders') upsertCustomerFromOrder(db, item);
  writeDb(db);
  res.status(201).json(item);
});

app.put('/tables/:table/:id', (req, res) => {
  const table = normalizeTable(req.params.table);
  if (!table) return res.status(404).json({ error: 'Unknown table' });
  const db = readDb();
  const list = Array.isArray(db[table]) ? db[table] : [];
  const index = list.findIndex(row => row.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Not found' });
  const updated = {
    id: list[index].id,
    created_at: list[index].created_at || now(),
    ...req.body,
    updated_at: now()
  };
  list[index] = updated;
  db[table] = list;
  writeDb(db);
  res.json(updated);
});

app.patch('/tables/:table/:id', (req, res) => {
  const table = normalizeTable(req.params.table);
  if (!table) return res.status(404).json({ error: 'Unknown table' });
  const db = readDb();
  const list = Array.isArray(db[table]) ? db[table] : [];
  const index = list.findIndex(row => row.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Not found' });
  list[index] = { ...list[index], ...req.body, updated_at: now() };
  db[table] = list;
  writeDb(db);
  res.json(list[index]);
});

app.delete('/tables/:table/:id', (req, res) => {
  const table = normalizeTable(req.params.table);
  if (!table) return res.status(404).json({ error: 'Unknown table' });
  const db = readDb();
  const list = Array.isArray(db[table]) ? db[table] : [];
  const index = list.findIndex(row => row.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Not found' });
  const removed = list.splice(index, 1)[0];
  db[table] = list;
  writeDb(db);
  res.json({ success: true, removed });
});

app.use(express.static(__dirname, {
  extensions: ['html']
}));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use((req, res, next) => {
  if (req.path.includes('.') || req.path.startsWith('/tables') || req.path.startsWith('/health')) return next();
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Alhabeshi Stores server running on port ${PORT}`);
});
