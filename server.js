require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const Parser = require('rss-parser');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const app = express();
const parser = new Parser({ timeout: 15000 });
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-render';
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'yamenameen97@gmail.com';
const BASE_URL = process.env.BASE_URL || '';
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'alhabeshi.sqlite');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(cookieParser());
app.use(express.static(__dirname, { extensions: ['html'] }));

let db;
let transporter = null;
let transporterReady = false;

const DEFAULT_PRODUCTS = [
  { name: 'أسمنت وطني 50 كجم', category: 'مواد البناء', price: 4300, unit: 'كيس', stock: 120, is_new: 0, discount: 0, icon: '🧱', description: 'أسمنت عالي الجودة للأعمال الإنشائية والتشطيبات.' },
  { name: 'حديد تسليح 12 مم', category: 'مواد البناء', price: 18500, unit: 'سيخ', stock: 75, is_new: 0, discount: 3, icon: '🔩', description: 'حديد تسليح متين مناسب لمشاريع البناء المختلفة.' },
  { name: 'رمل ناعم مغسول', category: 'مواد البناء', price: 9500, unit: 'متر', stock: 40, is_new: 0, discount: 0, icon: '🏗️', description: 'رمل تشطيب ناعم ونظيف جاهز للاستخدام.' },
  { name: 'بلك إسمنتي', category: 'مواد البناء', price: 350, unit: 'حبة', stock: 600, is_new: 0, discount: 0, icon: '🧱', description: 'بلك إسمنتي عملي للبناء الداخلي والخارجي.' },
  { name: 'مواسير PVC 4 إنش', category: 'السباكة', price: 6400, unit: 'قطعة', stock: 55, is_new: 1, discount: 5, icon: '🚰', description: 'مواسير سباكة قوية ومقاومة للتسرب.' },
  { name: 'خلاط مغسلة فاخر', category: 'السباكة', price: 12500, unit: 'قطعة', stock: 22, is_new: 1, discount: 10, icon: '🚿', description: 'خلاط عملي بتصميم أنيق وعمر استخدام طويل.' },
  { name: 'حنفية زاوية', category: 'السباكة', price: 2200, unit: 'قطعة', stock: 80, is_new: 0, discount: 0, icon: '🚿', description: 'قطعة سباكة عالية الاعتمادية للتركيب الداخلي.' },
  { name: 'سلك كهرباء 2.5 مم', category: 'الكهرباء', price: 16500, unit: 'لفة', stock: 30, is_new: 1, discount: 7, icon: '💡', description: 'سلك كهربائي معزول بجودة ممتازة.' },
  { name: 'قاطع كهرباء 63 أمبير', category: 'الكهرباء', price: 4800, unit: 'قطعة', stock: 44, is_new: 0, discount: 0, icon: '⚡', description: 'قاطع حماية موثوق للاستخدام المنزلي والتجاري.' },
  { name: 'لمبة LED 18W', category: 'الكهرباء', price: 950, unit: 'قطعة', stock: 110, is_new: 0, discount: 12, icon: '💡', description: 'إضاءة اقتصادية وعمر افتراضي طويل.' },
  { name: 'شنيور كهربائي', category: 'عدد ومعدات', price: 28500, unit: 'قطعة', stock: 12, is_new: 1, discount: 4, icon: '🛠️', description: 'شنيور عملي للأعمال اليومية والاحترافية.' },
  { name: 'مطرقة نجارة', category: 'عدد ومعدات', price: 2700, unit: 'قطعة', stock: 60, is_new: 0, discount: 0, icon: '🔨', description: 'مطرقة متوازنة ومريحة في الاستخدام.' }
];

const DEFAULT_OFFERS = [
  { title: 'خصم الافتتاح على السباكة', description: 'خصومات مختارة على مستلزمات السباكة لفترة محدودة.', discount_percent: 10, is_active: 1, type: 'عرض' },
  { title: 'مسابقة أفضل صورة مشروع', description: 'ارفع صورة مشروعك وادخل السحب على قسيمة شراء.', discount_percent: 0, is_active: 1, type: 'مسابقة' },
  { title: 'أسبوع الكهرباء الذكي', description: 'عروض على الكوابل والقواطع والإنارة الحديثة.', discount_percent: 12, is_active: 1, type: 'حدث' }
];

const DEFAULT_SPORTS_SOURCES = [
  { name: 'BBC Sport Football', url: 'https://feeds.bbci.co.uk/sport/football/rss.xml', is_active: 1 },
  { name: 'ESPN Soccer', url: 'https://www.espn.com/espn/rss/soccer/news', is_active: 1 }
];

const allowedTables = {
  products: ['id','name','category','price','unit','stock','is_new','discount','icon','description','image_url','external_link','created_at','updated_at','search_name'],
  orders: ['id','customer_name','phone','is_member','member_id','items','total','status','notes','order_mode','delivery_address','delivery_time','payment_method','payment_reference','notification_email','order_date','created_at','updated_at'],
  customers: ['id','name','phone','address','balance','is_member','email','created_at','updated_at','search_name'],
  offers: ['id','title','description','discount_percent','is_active','type','created_at','updated_at'],
  chat_messages: ['id','sender_name','message','is_admin','created_at'],
  members: ['id','full_name','phone','email','password_hash','is_active','can_order','wants_notifications','created_at','updated_at','search_name'],
  newsletter_subscribers: ['id','full_name','email','source','is_active','created_at','updated_at'],
  sports_sources: ['id','name','url','is_active','created_at','updated_at'],
  sports_articles: ['id','source_name','title','summary','link','published_at','image_url','guid','created_at','search_title'],
  admin_users: ['id','email','password_hash','display_name','created_at','updated_at']
};

const publicTableRules = {
  products: ['GET'],
  offers: ['GET'],
  orders: ['POST'],
  chat_messages: ['GET', 'POST'],
  sports_articles: ['GET'],
  members: []
};

function slugId() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

function normalizeArabic(text = '') {
  return String(text)
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLowerCase()
    .trim();
}

function isTableAllowed(table) {
  return Object.prototype.hasOwnProperty.call(allowedTables, table);
}

function filterColumns(table, payload = {}) {
  const allowed = allowedTables[table] || [];
  const out = {};
  for (const key of allowed) {
    if (key in payload && !['id', 'created_at', 'updated_at', 'password_hash', 'search_name', 'search_title'].includes(key)) {
      out[key] = payload[key];
    }
  }
  if (table === 'products' && 'name' in payload) out.search_name = normalizeArabic(payload.name);
  if (table === 'customers' && 'name' in payload) out.search_name = normalizeArabic(payload.name);
  if (table === 'members' && 'full_name' in payload) out.search_name = normalizeArabic(payload.full_name);
  if (table === 'sports_articles' && 'title' in payload) out.search_title = normalizeArabic(payload.title);
  return out;
}

function authCookie(res, tokenName, payload) {
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
  res.cookie(tokenName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000
  });
}

function clearAuthCookie(res, tokenName) {
  res.clearCookie(tokenName, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  });
}

function getTokenPayload(req, tokenName) {
  try {
    const token = req.cookies[tokenName];
    if (!token) return null;
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function requireAdmin(req, res, next) {
  const payload = getTokenPayload(req, 'admin_token');
  if (!payload || !payload.id) return res.status(401).json({ error: 'غير مصرح' });
  req.admin = payload;
  next();
}

function requireMember(req, res, next) {
  const payload = getTokenPayload(req, 'member_token');
  if (!payload || !payload.id) return res.status(401).json({ error: 'غير مصرح' });
  req.member = payload;
  next();
}

async function setupTransporter() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return;
  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: { user, pass }
  });
  try {
    await transporter.verify();
    transporterReady = true;
    console.log('SMTP ready');
  } catch (err) {
    transporterReady = false;
    console.warn('SMTP verify failed:', err.message);
  }
}


async function ensureColumn(table, column, definition) {
  const cols = await db.all(`PRAGMA table_info(${table})`);
  if (!cols.some(col => col.name === column)) {
    await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

async function upsertNewsletterSubscriber(fullName, email, source = 'page') {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return null;
  const timestamp = now();
  const existing = await queryOne('SELECT * FROM newsletter_subscribers WHERE email = ?', [normalizedEmail]);
  if (existing) {
    await run('UPDATE newsletter_subscribers SET full_name = ?, source = ?, is_active = 1, updated_at = ? WHERE email = ?', [fullName || existing.full_name || '', source, timestamp, normalizedEmail]);
    return queryOne('SELECT * FROM newsletter_subscribers WHERE email = ?', [normalizedEmail]);
  }
  const id = slugId();
  await run('INSERT INTO newsletter_subscribers (id,full_name,email,source,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', [id, fullName || '', normalizedEmail, source, 1, timestamp, timestamp]);
  return queryOne('SELECT * FROM newsletter_subscribers WHERE id = ?', [id]);
}

async function collectNewsletterRecipients(targetEmails = []) {
  const members = await queryAll(`
    SELECT full_name, email, COALESCE(wants_notifications, 1) AS wants_notifications
    FROM members
    WHERE is_active = 1 AND email IS NOT NULL AND email <> ''
  `);
  const subscribers = await queryAll(`
    SELECT full_name, email
    FROM newsletter_subscribers
    WHERE is_active = 1 AND email IS NOT NULL AND email <> ''
  `);

  const allowed = new Map();
  const blocked = new Set();
  const filterSet = Array.isArray(targetEmails) && targetEmails.length
    ? new Set(targetEmails.map(email => String(email || '').trim().toLowerCase()).filter(Boolean))
    : null;

  members.forEach(row => {
    const email = String(row.email || '').trim().toLowerCase();
    if (!email) return;
    if (Number(row.wants_notifications || 0) === 1) {
      allowed.set(email, row.full_name || '');
    } else {
      blocked.add(email);
      allowed.delete(email);
    }
  });

  subscribers.forEach(row => {
    const email = String(row.email || '').trim().toLowerCase();
    if (!email || blocked.has(email) || allowed.has(email)) return;
    allowed.set(email, row.full_name || '');
  });

  const recipients = Array.from(allowed.keys());
  return filterSet ? recipients.filter(email => filterSet.has(email)) : recipients;
}

async function getStoreSetting(key, fallback = '') {
  const row = await queryOne('SELECT value FROM store_settings WHERE key = ? LIMIT 1', [key]);
  return row?.value ?? fallback;
}

async function setStoreSetting(key, value) {
  const timestamp = now();
  await run(`
    INSERT INTO store_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `, [key, String(value ?? ''), timestamp]);
  return getStoreSetting(key, '');
}

async function sendNewProductNotification(product) {
  if (!transporter || !transporterReady) return { sent: false, reason: 'smtp_not_configured' };
  const recipients = await collectNewsletterRecipients(recipientEmails);
  if (!recipients.length) return { sent: false, reason: 'no_recipients' };

  const siteBase = BASE_URL ? BASE_URL.replace(/\/$/, '') : '';
  const productLink = siteBase ? `${siteBase}/new-products.html` : '#';
  const safeImage = product.image_url && !String(product.image_url).startsWith('data:') ? product.image_url : '';
  const html = `
    <div style="font-family:Arial,sans-serif;direction:rtl;text-align:right;line-height:1.8;background:#f7fafc;padding:20px">
      <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #e6eef4">
        <div style="background:linear-gradient(135deg,#1a5276,#2e86c1);padding:24px;color:#fff">
          <div style="font-size:26px;font-weight:800;margin-bottom:6px">🆕 منتج جديد في محلات الحبيشي</div>
          <div style="opacity:.92">تمت إضافة منتج جديد ويمكنك الاطلاع عليه الآن من خلال الموقع</div>
        </div>
        <div style="padding:24px">
          ${safeImage ? `<img src="${safeImage}" alt="${product.name}" style="width:100%;max-height:280px;object-fit:cover;border-radius:14px;margin-bottom:16px">` : ''}
          <h2 style="margin:0 0 12px;color:#1a5276">${product.name}</h2>
          <p style="margin:6px 0"><strong>السعر:</strong> ${Number(product.price || 0).toLocaleString('ar-YE')} ريال</p>
          <p style="margin:6px 0"><strong>الكمية المتاحة:</strong> ${Number(product.stock || 0).toLocaleString('ar-YE')}</p>
          <p style="margin:6px 0"><strong>الفئة:</strong> ${product.category || 'منتج جديد'}</p>
          <p style="margin:6px 0"><strong>الملاحظة:</strong> ${product.description || 'تمت إضافة المنتج حديثاً وهو متوفر حالياً داخل الموقع.'}</p>
          <div style="margin-top:18px">
            <a href="${productLink}" style="display:inline-block;background:#f39c12;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">عرض الأصناف الجديدة</a>
          </div>
        </div>
      </div>
    </div>
  `;

  const chunkSize = 40;
  for (let i = 0; i < recipients.length; i += chunkSize) {
    const batch = recipients.slice(i, i + chunkSize);
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: OWNER_EMAIL,
      bcc: batch,
      subject: `منتج جديد: ${product.name}`,
      html
    });
  }

  return { sent: true, count: recipients.length };
}

async function sendSubscriberCampaign({ subject, message, ctaLink = '', ctaLabel = 'زيارة الموقع', recipientEmails = [] }) {
  if (!transporter || !transporterReady) {
    return { sent: false, reason: 'smtp_not_configured', count: 0 };
  }

  const recipients = await collectNewsletterRecipients();
  if (!recipients.length) {
    return { sent: false, reason: 'no_recipients', count: 0 };
  }

  const safeSubject = String(subject || '').trim();
  const safeMessage = String(message || '').trim();
  const safeLink = String(ctaLink || '').trim();
  if (!safeSubject || !safeMessage) {
    return { sent: false, reason: 'invalid_payload', count: 0 };
  }

  const finalLink = safeLink || (BASE_URL ? `${BASE_URL.replace(/\/$/, '')}/new-products.html` : '');
  const safeCtaLabel = String(ctaLabel || 'زيارة الموقع').trim() || 'زيارة الموقع';
  const html = `
    <div style="font-family:Arial,sans-serif;direction:rtl;text-align:right;line-height:1.8;background:#f7fafc;padding:20px">
      <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #e6eef4">
        <div style="background:linear-gradient(135deg,#1a5276,#2e86c1);padding:24px;color:#fff">
          <div style="font-size:26px;font-weight:800;margin-bottom:6px">📢 إشعار من محلات الحبيشي</div>
          <div style="opacity:.92">رسالة جديدة للمشتركين في الصفحة والبريد الإلكتروني</div>
        </div>
        <div style="padding:24px">
          <h2 style="margin:0 0 14px;color:#1a5276">${safeSubject}</h2>
          <div style="white-space:pre-line;color:#243447;font-size:15px">${safeMessage}</div>
          ${finalLink ? `<div style="margin-top:20px"><a href="${finalLink}" style="display:inline-block;background:#f39c12;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">${safeCtaLabel}</a></div>` : ''}
        </div>
      </div>
    </div>
  `;

  const chunkSize = 40;
  for (let i = 0; i < recipients.length; i += chunkSize) {
    const batch = recipients.slice(i, i + chunkSize);
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: OWNER_EMAIL,
      bcc: batch,
      subject: safeSubject,
      html
    });
  }

  return { sent: true, count: recipients.length };
}

async function sendOrderEmail(order) {
  if (!transporter || !transporterReady) return { sent: false, reason: 'smtp_not_configured' };
  let items = [];
  try { items = JSON.parse(order.items || '[]'); } catch {}
  const html = `
    <div style="font-family:Arial,sans-serif;direction:rtl;text-align:right;line-height:1.8">
      <h2 style="color:#1a5276">طلب جديد من موقع محلات الحبيشي</h2>
      <p><strong>العميل:</strong> ${order.customer_name}</p>
      <p><strong>الجوال:</strong> ${order.phone}</p>
      <p><strong>رقم الطلب:</strong> ${order.id}</p>
      <p><strong>نوع الطلب:</strong> ${order.order_mode || 'delivery'}</p>
      <p><strong>طريقة الدفع:</strong> ${order.payment_method || '-'}</p>
      <p><strong>العنوان:</strong> ${order.delivery_address || '-'}</p>
      <p><strong>الوقت المفضل:</strong> ${order.delivery_time || '-'}</p>
      <p><strong>الإجمالي:</strong> ${Number(order.total || 0).toLocaleString('ar-YE')} ريال</p>
      <h3>الأصناف</h3>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr>
            <th style="border:1px solid #ddd;padding:8px;background:#f4f6f8">الصنف</th>
            <th style="border:1px solid #ddd;padding:8px;background:#f4f6f8">الكمية</th>
            <th style="border:1px solid #ddd;padding:8px;background:#f4f6f8">الوحدة</th>
            <th style="border:1px solid #ddd;padding:8px;background:#f4f6f8">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => `
            <tr>
              <td style="border:1px solid #ddd;padding:8px">${item.name || '-'}</td>
              <td style="border:1px solid #ddd;padding:8px">${item.quantity || '-'}</td>
              <td style="border:1px solid #ddd;padding:8px">${item.unit || '-'}</td>
              <td style="border:1px solid #ddd;padding:8px">${Number(item.total || 0).toLocaleString('ar-YE')} ريال</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <p><strong>ملاحظات:</strong> ${order.notes || '-'}</p>
    </div>
  `;
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: OWNER_EMAIL,
    subject: `طلب جديد - ${order.customer_name}`,
    html
  });
  return { sent: true };
}

async function queryAll(sql, params = []) {
  return db.all(sql, params);
}

async function queryOne(sql, params = []) {
  return db.get(sql, params);
}

async function run(sql, params = []) {
  return db.run(sql, params);
}

async function seedIfEmpty() {
  const productCount = await queryOne('SELECT COUNT(*) as count FROM products');
  if (productCount.count === 0) {
    for (const p of DEFAULT_PRODUCTS) {
      const id = slugId();
      const timestamp = now();
      await run(`INSERT INTO products (id,name,category,price,unit,stock,is_new,discount,icon,description,created_at,updated_at,search_name)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [id, p.name, p.category, p.price, p.unit, p.stock, p.is_new, p.discount, p.icon, p.description, timestamp, timestamp, normalizeArabic(p.name)]);
    }
  }

  const offersCount = await queryOne('SELECT COUNT(*) as count FROM offers');
  if (offersCount.count === 0) {
    for (const o of DEFAULT_OFFERS) {
      const id = slugId();
      const timestamp = now();
      await run(`INSERT INTO offers (id,title,description,discount_percent,is_active,type,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?)`, [id, o.title, o.description, o.discount_percent, o.is_active, o.type, timestamp, timestamp]);
    }
  }

  const sportsCount = await queryOne('SELECT COUNT(*) as count FROM sports_sources');
  if (sportsCount.count === 0) {
    for (const s of DEFAULT_SPORTS_SOURCES) {
      const id = slugId();
      const timestamp = now();
      await run(`INSERT INTO sports_sources (id,name,url,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?)`, [id, s.name, s.url, s.is_active, timestamp, timestamp]);
    }
  }
}

async function initDb() {
  db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  await db.exec('PRAGMA journal_mode=WAL;');

  await db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      price REAL DEFAULT 0,
      unit TEXT,
      stock INTEGER DEFAULT 0,
      is_new INTEGER DEFAULT 0,
      discount REAL DEFAULT 0,
      icon TEXT,
      description TEXT,
      image_url TEXT,
      external_link TEXT,
      created_at TEXT,
      updated_at TEXT,
      search_name TEXT
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      is_member INTEGER DEFAULT 0,
      member_id TEXT,
      items TEXT,
      total REAL DEFAULT 0,
      status TEXT DEFAULT 'جديد',
      notes TEXT,
      order_mode TEXT,
      delivery_address TEXT,
      delivery_time TEXT,
      payment_method TEXT,
      payment_reference TEXT,
      notification_email TEXT,
      order_date TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      balance REAL DEFAULT 0,
      is_member INTEGER DEFAULT 0,
      email TEXT,
      created_at TEXT,
      updated_at TEXT,
      search_name TEXT
    );
    CREATE TABLE IF NOT EXISTS offers (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      discount_percent REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      type TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      sender_name TEXT NOT NULL,
      message TEXT NOT NULL,
      is_admin INTEGER DEFAULT 0,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      phone TEXT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      wants_notifications INTEGER DEFAULT 1,
      created_at TEXT,
      updated_at TEXT,
      search_name TEXT
    );
    CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id TEXT PRIMARY KEY,
      full_name TEXT,
      email TEXT UNIQUE NOT NULL,
      source TEXT DEFAULT 'page',
      is_active INTEGER DEFAULT 1,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS sports_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT UNIQUE NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS sports_articles (
      id TEXT PRIMARY KEY,
      source_name TEXT,
      title TEXT NOT NULL,
      summary TEXT,
      link TEXT UNIQUE,
      published_at TEXT,
      image_url TEXT,
      guid TEXT UNIQUE,
      created_at TEXT,
      search_title TEXT
    );
    CREATE TABLE IF NOT EXISTS store_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_products_search_name ON products(search_name);
    CREATE INDEX IF NOT EXISTS idx_customers_search_name ON customers(search_name);
    CREATE INDEX IF NOT EXISTS idx_members_search_name ON members(search_name);
    CREATE INDEX IF NOT EXISTS idx_newsletter_email ON newsletter_subscribers(email);
    CREATE INDEX IF NOT EXISTS idx_sports_articles_published_at ON sports_articles(published_at);
  `);

  await ensureColumn('products', 'image_url', 'TEXT');
  await ensureColumn('products', 'external_link', 'TEXT');
  await ensureColumn('members', 'wants_notifications', 'INTEGER DEFAULT 1');
  await ensureColumn('members', 'can_order', 'INTEGER DEFAULT 1');
  await run(
    'INSERT OR IGNORE INTO store_settings (key, value, updated_at) VALUES (?, ?, ?)',
    ['store_description', 'وجهتك الأولى لمواد البناء والسباكة والكهرباء ومستلزمات الورش والأسمنت والمستلزمات الطبية في إب والمنطقة.', now()]
  );

  await seedIfEmpty();
}

async function syncSportsFeeds() {
  try {
    const feeds = await queryAll('SELECT * FROM sports_sources WHERE is_active = 1 ORDER BY created_at DESC');
    for (const feed of feeds) {
      try {
        const data = await parser.parseURL(feed.url);
        const items = (data.items || []).slice(0, 15);
        for (const item of items) {
          const id = slugId();
          const title = (item.title || '').trim();
          if (!title || !item.link) continue;
          const guid = item.guid || item.link;
          const image = item.enclosure?.url || item.thumbnail || item.itunes?.image || null;
          const summary = (item.contentSnippet || item.content || item.summary || '').replace(/<[^>]+>/g, '').trim().slice(0, 500);
          await run(`
            INSERT OR IGNORE INTO sports_articles
            (id, source_name, title, summary, link, published_at, image_url, guid, created_at, search_title)
            VALUES (?,?,?,?,?,?,?,?,?,?)
          `, [id, feed.name, title, summary, item.link, item.pubDate || now(), image, guid, now(), normalizeArabic(title)]);
        }
      } catch (err) {
        console.warn('RSS sync failed for', feed.url, err.message);
      }
    }
    await run(`
      DELETE FROM sports_articles
      WHERE id NOT IN (
        SELECT id FROM sports_articles ORDER BY datetime(COALESCE(published_at, created_at)) DESC LIMIT 120
      )
    `);
    return true;
  } catch (err) {
    console.warn('Sports sync error:', err.message);
    return false;
  }
}

async function ensureCustomerFromOrder(order) {
  const existing = await queryOne('SELECT * FROM customers WHERE phone = ? LIMIT 1', [order.phone]);
  const timestamp = now();
  if (existing) {
    await run('UPDATE customers SET name = ?, is_member = ?, updated_at = ?, search_name = ? WHERE id = ?', [order.customer_name, order.is_member ? 1 : 0, timestamp, normalizeArabic(order.customer_name), existing.id]);
    return existing.id;
  }
  const id = slugId();
  await run(`INSERT INTO customers (id,name,phone,address,balance,is_member,email,created_at,updated_at,search_name)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, [id, order.customer_name, order.phone, order.delivery_address || '', 0, order.is_member ? 1 : 0, '', timestamp, timestamp, normalizeArabic(order.customer_name)]);
  return id;
}

async function hasAdminAccount() {
  const row = await queryOne('SELECT COUNT(*) as count FROM admin_users');
  return row.count > 0;
}

app.get('/api/health', async (_req, res) => {
  const adminExists = await hasAdminAccount();
  res.json({ ok: true, adminExists, emailReady: transporterReady, ownerEmail: OWNER_EMAIL });
});

app.get('/api/auth/admin/me', async (req, res) => {
  const payload = getTokenPayload(req, 'admin_token');
  if (!payload) return res.status(401).json({ authenticated: false });
  const admin = await queryOne('SELECT id,email,display_name,created_at FROM admin_users WHERE id = ?', [payload.id]);
  if (!admin) return res.status(401).json({ authenticated: false });
  res.json({ authenticated: true, user: admin });
});

app.post('/api/auth/admin/setup', async (req, res) => {
  if (await hasAdminAccount()) {
    return res.status(400).json({ error: 'تم إنشاء حساب الإدارة مسبقاً' });
  }
  const { email, password, display_name } = req.body || {};
  if (!email || !password || String(password).length < 6) {
    return res.status(400).json({ error: 'أدخل بريدًا صحيحًا وكلمة مرور لا تقل عن 6 أحرف' });
  }
  const id = slugId();
  const timestamp = now();
  const password_hash = await bcrypt.hash(String(password), 10);
  await run('INSERT INTO admin_users (id,email,password_hash,display_name,created_at,updated_at) VALUES (?,?,?,?,?,?)', [id, String(email).trim().toLowerCase(), password_hash, display_name || 'مدير الموقع', timestamp, timestamp]);
  authCookie(res, 'admin_token', { id, role: 'admin', email: String(email).trim().toLowerCase() });
  res.json({ success: true, user: { id, email: String(email).trim().toLowerCase(), display_name: display_name || 'مدير الموقع' } });
});

app.post('/api/auth/admin/login', async (req, res) => {
  const { email, password } = req.body || {};
  const admin = await queryOne('SELECT * FROM admin_users WHERE email = ?', [String(email || '').trim().toLowerCase()]);
  if (!admin) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  const ok = await bcrypt.compare(String(password || ''), admin.password_hash);
  if (!ok) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  authCookie(res, 'admin_token', { id: admin.id, role: 'admin', email: admin.email });
  res.json({ success: true, user: { id: admin.id, email: admin.email, display_name: admin.display_name } });
});

app.post('/api/auth/admin/logout', (req, res) => {
  clearAuthCookie(res, 'admin_token');
  res.json({ success: true });
});

app.post('/api/members/register', async (req, res) => {
  const { full_name, phone, email, password, wants_notifications } = req.body || {};
  if (!full_name || !email || !password || String(password).length < 6) {
    return res.status(400).json({ error: 'يرجى إكمال البيانات وكلمة المرور لا تقل عن 6 أحرف' });
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  const exists = await queryOne('SELECT id FROM members WHERE email = ?', [normalizedEmail]);
  if (exists) return res.status(400).json({ error: 'هذا البريد مسجل مسبقاً' });
  const id = slugId();
  const timestamp = now();
  const password_hash = await bcrypt.hash(String(password), 10);
  const wantsNotifications = wants_notifications === undefined ? 1 : (wants_notifications ? 1 : 0);
  await run(`INSERT INTO members (id,full_name,phone,email,password_hash,is_active,can_order,wants_notifications,created_at,updated_at,search_name)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [id, full_name, phone || '', normalizedEmail, password_hash, 1, 1, wantsNotifications, timestamp, timestamp, normalizeArabic(full_name)]);
  if (wantsNotifications) await upsertNewsletterSubscriber(full_name, normalizedEmail, 'member');
  authCookie(res, 'member_token', { id, role: 'member', email: normalizedEmail });
  res.json({ success: true, member: { id, full_name, phone, email: normalizedEmail, wants_notifications: !!wantsNotifications, can_order: true, is_active: true } });
});

app.post('/api/members/login', async (req, res) => {
  const { email, password } = req.body || {};
  const member = await queryOne('SELECT * FROM members WHERE email = ? AND is_active = 1', [String(email || '').trim().toLowerCase()]);
  if (!member) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  const ok = await bcrypt.compare(String(password || ''), member.password_hash);
  if (!ok) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  authCookie(res, 'member_token', { id: member.id, role: 'member', email: member.email });
  res.json({ success: true, member: { id: member.id, full_name: member.full_name, phone: member.phone, email: member.email, wants_notifications: !!member.wants_notifications, can_order: !!member.can_order, is_active: !!member.is_active } });
});

app.get('/api/members/me', async (req, res) => {
  const payload = getTokenPayload(req, 'member_token');
  if (!payload) return res.status(401).json({ authenticated: false });
  const member = await queryOne('SELECT id,full_name,phone,email,wants_notifications,is_active,can_order,created_at FROM members WHERE id = ?', [payload.id]);
  if (!member) return res.status(401).json({ authenticated: false });
  res.json({ authenticated: true, member });
});

app.post('/api/members/logout', (req, res) => {
  clearAuthCookie(res, 'member_token');
  res.json({ success: true });
});


app.post('/api/newsletter/subscribe', async (req, res) => {
  const { full_name, email } = req.body || {};
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ error: 'يرجى إدخال بريد إلكتروني صحيح' });
  }

  const row = await upsertNewsletterSubscriber(String(full_name || '').trim(), normalizedEmail, 'page');
  res.json({ success: true, subscriber: row });
});

app.post('/api/newsletter/unsubscribe', async (req, res) => {
  const normalizedEmail = String(req.body?.email || '').trim().toLowerCase();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ error: 'يرجى إدخال بريد إلكتروني صحيح' });
  }
  const member = await queryOne('SELECT id FROM members WHERE email = ? LIMIT 1', [normalizedEmail]);
  if (member) {
    await run('UPDATE members SET wants_notifications = 0, updated_at = ? WHERE id = ?', [now(), member.id]);
  }
  await run('UPDATE newsletter_subscribers SET is_active = 0, updated_at = ? WHERE email = ?', [now(), normalizedEmail]);
  res.json({ success: true });
});

app.get('/api/store/settings', async (_req, res) => {
  const store_description = await getStoreSetting('store_description', 'وجهتك الأولى لمواد البناء والسباكة والكهرباء ومستلزمات الورش والأسمنت والمستلزمات الطبية في إب والمنطقة.');
  res.json({ store_description });
});

app.patch('/api/store/settings', requireAdmin, async (req, res) => {
  const description = String(req.body?.store_description || '').trim();
  if (!description) {
    return res.status(400).json({ error: 'وصف المتجر مطلوب' });
  }
  const value = await setStoreSetting('store_description', description);
  res.json({ success: true, store_description: value });
});

app.post('/api/notifications/subscribers', requireAdmin, async (req, res) => {
  const { subject, message, cta_link, cta_label, recipient_emails } = req.body || {};
  if (!String(subject || '').trim() || !String(message || '').trim()) {
    return res.status(400).json({ error: 'عنوان الرسالة ونصها مطلوبان' });
  }

  try {
    const selectedRecipients = Array.isArray(recipient_emails)
      ? recipient_emails
      : String(recipient_emails || '').split(/[\n,;]+/).map(v => v.trim()).filter(Boolean);

    const result = await sendSubscriberCampaign({
      subject: String(subject).trim(),
      message: String(message).trim(),
      ctaLink: String(cta_link || '').trim(),
      ctaLabel: String(cta_label || '').trim() || 'زيارة الموقع',
      recipientEmails: selectedRecipients
    });

    if (!result.sent && result.reason === 'smtp_not_configured') {
      return res.status(503).json({ error: 'خدمة البريد غير مفعلة حالياً. يرجى إعداد SMTP أولاً.' });
    }
    if (!result.sent && result.reason === 'no_recipients') {
      return res.status(400).json({ error: 'لا يوجد مشتركون نشطون لإرسال الرسالة لهم' });
    }
    if (!result.sent) {
      return res.status(400).json({ error: 'تعذر إرسال الرسالة حالياً' });
    }

    res.json({ success: true, count: result.count });
  } catch (err) {
    console.error('Subscriber campaign failed:', err);
    res.status(500).json({ error: 'حدث خطأ أثناء إرسال البريد للمشتركين' });
  }
});

app.get('/api/sports/articles', async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 20), 50);
  const q = normalizeArabic(req.query.q || '');
  const rows = q
    ? await queryAll('SELECT * FROM sports_articles WHERE search_title LIKE ? ORDER BY datetime(COALESCE(published_at, created_at)) DESC LIMIT ?', [`%${q}%`, limit])
    : await queryAll('SELECT * FROM sports_articles ORDER BY datetime(COALESCE(published_at, created_at)) DESC LIMIT ?', [limit]);
  res.json({ data: rows });
});

app.post('/api/sports/sync', requireAdmin, async (_req, res) => {
  const ok = await syncSportsFeeds();
  res.json({ success: ok });
});

app.get('/api/sports/sources', requireAdmin, async (_req, res) => {
  const rows = await queryAll('SELECT * FROM sports_sources ORDER BY created_at DESC');
  res.json({ data: rows });
});

app.post('/api/sports/sources', requireAdmin, async (req, res) => {
  const { name, url, is_active } = req.body || {};
  if (!name || !url) return res.status(400).json({ error: 'الاسم والرابط مطلوبان' });
  const id = slugId();
  const timestamp = now();
  await run('INSERT INTO sports_sources (id,name,url,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?)', [id, name, url, is_active ? 1 : 0, timestamp, timestamp]);
  const row = await queryOne('SELECT * FROM sports_sources WHERE id = ?', [id]);
  res.json(row);
});

app.patch('/api/sports/sources/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const existing = await queryOne('SELECT * FROM sports_sources WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'غير موجود' });
  const payload = req.body || {};
  const name = payload.name ?? existing.name;
  const url = payload.url ?? existing.url;
  const is_active = payload.is_active === undefined ? existing.is_active : (payload.is_active ? 1 : 0);
  await run('UPDATE sports_sources SET name=?, url=?, is_active=?, updated_at=? WHERE id=?', [name, url, is_active, now(), id]);
  const row = await queryOne('SELECT * FROM sports_sources WHERE id = ?', [id]);
  res.json(row);
});

app.delete('/api/sports/sources/:id', requireAdmin, async (req, res) => {
  await run('DELETE FROM sports_sources WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

app.get('/tables/:table', async (req, res) => {
  const { table } = req.params;
  if (!isTableAllowed(table)) return res.status(404).json({ error: 'جدول غير مدعوم' });
  const publicMethods = publicTableRules[table] || [];
  if (!publicMethods.includes('GET')) {
    const payload = getTokenPayload(req, 'admin_token');
    if (!payload) return res.status(401).json({ error: 'غير مصرح' });
  }

  const limit = Math.min(Number(req.query.limit || 100), 500);
  const sort = (req.query.sort && allowedTables[table].includes(req.query.sort)) ? req.query.sort : (allowedTables[table].includes('created_at') ? 'created_at' : allowedTables[table][0]);
  const order = String(req.query.order || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const q = String(req.query.q || '').trim();

  let sql = `SELECT * FROM ${table}`;
  const params = [];
  if (q) {
    if (table === 'products') {
      sql += ' WHERE search_name LIKE ? OR name LIKE ?';
      params.push(`%${normalizeArabic(q)}%`, `%${q}%`);
    } else if (table === 'customers') {
      sql += ' WHERE search_name LIKE ? OR name LIKE ? OR phone LIKE ?';
      params.push(`%${normalizeArabic(q)}%`, `%${q}%`, `%${q}%`);
    } else if (table === 'members') {
      sql += ' WHERE search_name LIKE ? OR full_name LIKE ? OR email LIKE ?';
      params.push(`%${normalizeArabic(q)}%`, `%${q}%`, `%${q}%`);
    } else if (table === 'newsletter_subscribers') {
      sql += ' WHERE full_name LIKE ? OR email LIKE ? OR source LIKE ?';
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
  }
  sql += ` ORDER BY ${sort} ${order} LIMIT ?`;
  params.push(limit);
  const rows = await queryAll(sql, params);
  res.json({ data: rows });
});

app.get('/tables/:table/:id', async (req, res) => {
  const { table, id } = req.params;
  if (!isTableAllowed(table)) return res.status(404).json({ error: 'جدول غير مدعوم' });
  const publicMethods = publicTableRules[table] || [];
  if (!publicMethods.includes('GET')) {
    const payload = getTokenPayload(req, 'admin_token');
    if (!payload) return res.status(401).json({ error: 'غير مصرح' });
  }
  const row = await queryOne(`SELECT * FROM ${table} WHERE id = ?`, [id]);
  if (!row) return res.status(404).json({ error: 'غير موجود' });
  res.json(row);
});

app.post('/tables/:table', async (req, res) => {
  const { table } = req.params;
  if (!isTableAllowed(table)) return res.status(404).json({ error: 'جدول غير مدعوم' });
  const publicMethods = publicTableRules[table] || [];
  if (!publicMethods.includes('POST')) {
    const payload = getTokenPayload(req, 'admin_token');
    if (!payload) return res.status(401).json({ error: 'غير مصرح' });
  }

  try {
    const id = slugId();
    const timestamp = now();
    const payload = filterColumns(table, req.body || {});

    if (table === 'orders') {
      payload.status = payload.status || 'جديد';
      payload.notification_email = payload.notification_email || OWNER_EMAIL;
      if (payload.member_id) {
        const member = await queryOne('SELECT id, is_active, COALESCE(can_order, 1) AS can_order FROM members WHERE id = ? LIMIT 1', [payload.member_id]);
        if (member && (!Number(member.is_active) || !Number(member.can_order))) {
          return res.status(403).json({ error: 'تم إيقاف استقبال الطلبات لهذا المشترك حالياً' });
        }
      }
    }
    if (table === 'chat_messages') {
      payload.message = String(payload.message || '').slice(0, 1000);
      payload.sender_name = String(payload.sender_name || 'زائر').slice(0, 100);
      payload.is_admin = payload.is_admin ? 1 : 0;
      if (!payload.message.trim()) return res.status(400).json({ error: 'نص الرسالة مطلوب' });
    }
    if (table === 'customers') payload.is_member = payload.is_member ? 1 : 0;
    if (table === 'products') payload.is_new = payload.is_new ? 1 : 0;
    if (table === 'members') {
      payload.wants_notifications = payload.wants_notifications === undefined ? 1 : (payload.wants_notifications ? 1 : 0);
      payload.can_order = payload.can_order === undefined ? 1 : (payload.can_order ? 1 : 0);
      if (payload.email) payload.email = String(payload.email).trim().toLowerCase();
    }
    if (table === 'newsletter_subscribers') {
      payload.email = String(payload.email || '').trim().toLowerCase();
      payload.full_name = String(payload.full_name || '').trim();
      payload.source = String(payload.source || 'admin').trim() || 'admin';
      payload.is_active = payload.is_active === undefined ? 1 : (payload.is_active ? 1 : 0);
      if (!payload.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
        return res.status(400).json({ error: 'يرجى إدخال بريد إلكتروني صحيح' });
      }
    }
    if (table === 'offers') payload.is_active = payload.is_active ? 1 : 0;

    const cols = ['id', ...Object.keys(payload), 'created_at'];
    if (allowedTables[table].includes('updated_at')) cols.push('updated_at');
    const values = [id, ...Object.values(payload), timestamp];
    if (allowedTables[table].includes('updated_at')) values.push(timestamp);

    const placeholders = cols.map(() => '?').join(',');
    await run(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`, values);
    const row = await queryOne(`SELECT * FROM ${table} WHERE id = ?`, [id]);

    if (table === 'orders') {
      await ensureCustomerFromOrder(row);
      try { await sendOrderEmail(row); } catch (err) { console.warn('Order email failed:', err.message); }
    }
    if (table === 'products') {
      try { await sendNewProductNotification(row); } catch (err) { console.warn('Product notification failed:', err.message); }
    }

    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'فشل حفظ البيانات' });
  }
});

app.put('/tables/:table/:id', requireAdmin, async (req, res) => {
  const { table, id } = req.params;
  if (!isTableAllowed(table)) return res.status(404).json({ error: 'جدول غير مدعوم' });
  try {
    const existing = await queryOne(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    if (!existing) return res.status(404).json({ error: 'غير موجود' });
    const payload = filterColumns(table, req.body || {});
    if (table === 'members' && 'wants_notifications' in payload) payload.wants_notifications = payload.wants_notifications ? 1 : 0;
    if (table === 'members' && 'can_order' in payload) payload.can_order = payload.can_order ? 1 : 0;
    if (table === 'members' && 'email' in payload) payload.email = String(payload.email || '').trim().toLowerCase();
    if (table === 'newsletter_subscribers') {
      if ('email' in payload) payload.email = String(payload.email || '').trim().toLowerCase();
      if ('full_name' in payload) payload.full_name = String(payload.full_name || '').trim();
      if ('source' in payload) payload.source = String(payload.source || 'admin').trim() || 'admin';
      if ('is_active' in payload) payload.is_active = payload.is_active ? 1 : 0;
      const testEmail = 'email' in payload ? payload.email : String(existing.email || '').trim().toLowerCase();
      if (!testEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)) {
        return res.status(400).json({ error: 'يرجى إدخال بريد إلكتروني صحيح' });
      }
    }
    if (table === 'offers' && 'is_active' in payload) payload.is_active = payload.is_active ? 1 : 0;
    const merged = { ...existing, ...payload };
    const updateCols = Object.keys(payload);
    if (!updateCols.length) return res.json(existing);
    updateCols.push('updated_at');
    const values = [...Object.keys(payload).map(k => merged[k]), now(), id];
    const sql = `UPDATE ${table} SET ${updateCols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`;
    await run(sql, values);
    const row = await queryOne(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'فشل التحديث' });
  }
});

app.patch('/tables/:table/:id', requireAdmin, async (req, res) => {
  const { table, id } = req.params;
  if (!isTableAllowed(table)) return res.status(404).json({ error: 'جدول غير مدعوم' });
  try {
    const existing = await queryOne(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    if (!existing) return res.status(404).json({ error: 'غير موجود' });
    const payload = filterColumns(table, req.body || {});
    if (table === 'members' && 'wants_notifications' in payload) payload.wants_notifications = payload.wants_notifications ? 1 : 0;
    if (table === 'members' && 'can_order' in payload) payload.can_order = payload.can_order ? 1 : 0;
    if (table === 'members' && 'email' in payload) payload.email = String(payload.email || '').trim().toLowerCase();
    if (table === 'newsletter_subscribers') {
      if ('email' in payload) payload.email = String(payload.email || '').trim().toLowerCase();
      if ('full_name' in payload) payload.full_name = String(payload.full_name || '').trim();
      if ('source' in payload) payload.source = String(payload.source || 'admin').trim() || 'admin';
      if ('is_active' in payload) payload.is_active = payload.is_active ? 1 : 0;
      const testEmail = 'email' in payload ? payload.email : String(existing.email || '').trim().toLowerCase();
      if (!testEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)) {
        return res.status(400).json({ error: 'يرجى إدخال بريد إلكتروني صحيح' });
      }
    }
    if (table === 'offers' && 'is_active' in payload) payload.is_active = payload.is_active ? 1 : 0;
    const keys = Object.keys(payload);
    if (!keys.length) return res.json(existing);
    keys.push('updated_at');
    const values = [...Object.keys(payload).map(k => payload[k]), now(), id];
    const sql = `UPDATE ${table} SET ${keys.map(c => `${c} = ?`).join(', ')} WHERE id = ?`;
    await run(sql, values);
    const row = await queryOne(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'فشل التحديث' });
  }
});

app.delete('/tables/:table/:id', requireAdmin, async (req, res) => {
  const { table, id } = req.params;
  if (!isTableAllowed(table)) return res.status(404).json({ error: 'جدول غير مدعوم' });
  await run(`DELETE FROM ${table} WHERE id = ?`, [id]);
  res.json({ success: true });
});

app.get('/admin', (_req, res) => res.redirect('/admin.html'));
app.get('/sports', (_req, res) => res.redirect('/sports.html'));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'حدث خطأ غير متوقع' });
});

(async () => {
  await initDb();
  await setupTransporter();
  await syncSportsFeeds();
  setInterval(syncSportsFeeds, 45 * 60 * 1000);
  app.listen(PORT, () => {
    console.log(`Alhabeshi site running on port ${PORT}`);
    if (BASE_URL) console.log(`Base URL: ${BASE_URL}`);
  });
})();