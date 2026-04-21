/* ======================================
   محلات الحبيشي - JavaScript المشترك
   ====================================== */

// ======================================
// إدارة التوست
// ======================================
function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-message">${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ======================================
// API Helpers
// ======================================
async function apiGet(table, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `tables/${table}${qs ? '?' + qs : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`خطأ في جلب البيانات: ${res.status}`);
  return res.json();
}

async function apiGetById(table, id) {
  const res = await fetch(`tables/${table}/${id}`);
  if (!res.ok) throw new Error(`خطأ في جلب السجل: ${res.status}`);
  return res.json();
}

async function apiCreate(table, data) {
  const res = await fetch(`tables/${table}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`خطأ في إنشاء السجل: ${res.status}`);
  return res.json();
}

async function apiUpdate(table, id, data) {
  const res = await fetch(`tables/${table}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`خطأ في تحديث السجل: ${res.status}`);
  return res.json();
}

async function apiPatch(table, id, data) {
  const res = await fetch(`tables/${table}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`خطأ في تحديث السجل: ${res.status}`);
  return res.json();
}

async function apiDelete(table, id) {
  const res = await fetch(`tables/${table}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`خطأ في حذف السجل: ${res.status}`);
  return true;
}

// ======================================
// تنسيق الأرقام والتواريخ
// ======================================
function formatPrice(price) {
  return new Intl.NumberFormat('ar-YE').format(price) + ' ريال';
}

function formatDate(timestamp) {
  if (!timestamp) return '-';
  const date = new Date(timestamp);
  return date.toLocaleDateString('ar-YE', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatDateShort(timestamp) {
  if (!timestamp) return '-';
  const date = new Date(timestamp);
  return date.toLocaleDateString('ar-YE');
}

// ======================================
// حالة الطلب
// ======================================
const orderStatuses = {
  'جديد': { class: 'badge-info', icon: '🆕' },
  'قيد المعالجة': { class: 'badge-warning', icon: '⚙️' },
  'جاهز': { class: 'badge-success', icon: '✅' },
  'تم التسليم': { class: 'badge-dark', icon: '📦' },
  'ملغي': { class: 'badge-danger', icon: '❌' }
};

function getStatusBadge(status) {
  const info = orderStatuses[status] || { class: 'badge-dark', icon: '❓' };
  return `<span class="badge ${info.class}">${info.icon} ${status}</span>`;
}

// ======================================
// Modal Helpers
// ======================================
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }
}

// إغلاق المودال عند الضغط خارجه
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.style.display = 'none';
    document.body.style.overflow = '';
  }
});

// ======================================
// شريط التنقل - قائمة الموبايل
// ======================================
function initNavbar() {
  const toggle = document.querySelector('.navbar-toggle');
  const links = document.querySelector('.navbar-links');

  if (toggle && links) {
    toggle.addEventListener('click', () => {
      links.classList.toggle('open');
    });

    // إغلاق القائمة عند الضغط على رابط
    links.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => links.classList.remove('open'));
    });
  }

  // تمييز الرابط النشط
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.navbar-links a').forEach(a => {
    const href = a.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      a.classList.add('active');
    }
  });
}

// ======================================
// تحديث عداد الطلبات في الشريط
// ======================================
async function updateOrdersBadge() {
  try {
    const data = await apiGet('orders', { limit: 200 });
    const newOrders = data.data ? data.data.filter(o => o.status === 'جديد').length : 0;
    const badge = document.getElementById('orders-badge');
    if (badge) {
      badge.textContent = newOrders;
      badge.style.display = newOrders > 0 ? 'inline-flex' : 'none';
    }
  } catch(e) {}
}

// ======================================
// أدوات واجهة مشتركة
// ======================================
const STORE_PHONE = '771217771';
const STORE_EMAIL = 'yamenameen97@gmail.com';

function validateYemenPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return /^(?:967|0)?7\d{8}$/.test(digits);
}

function shareCurrentPage(title = document.title) {
  const data = {
    title,
    text: 'محلات الحبيشي | ' + title,
    url: window.location.href
  };
  if (navigator.share) {
    navigator.share(data).catch(() => {});
  } else {
    navigator.clipboard.writeText(window.location.href).then(() => {
      showToast('تم نسخ رابط الصفحة', 'success');
    }).catch(() => {
      prompt('انسخ الرابط التالي:', window.location.href);
    });
  }
}

function injectFloatingShareButton() {
  if (document.getElementById('floatingShareBtn')) return;
  const btn = document.createElement('button');
  btn.id = 'floatingShareBtn';
  btn.type = 'button';
  btn.innerHTML = '<i class="fas fa-share-alt"></i>';
  btn.title = 'مشاركة الصفحة';
  btn.setAttribute('aria-label', 'مشاركة الصفحة');
  btn.style.cssText = 'position:fixed;left:18px;bottom:18px;z-index:2500;width:54px;height:54px;border:none;border-radius:50%;background:linear-gradient(135deg,#1a5276,#2e86c1);color:#fff;box-shadow:0 10px 25px rgba(26,82,118,.28);cursor:pointer;font-size:1.1rem;display:flex;align-items:center;justify-content:center;';
  btn.onclick = () => shareCurrentPage();
  document.body.appendChild(btn);
}

function initFaqAccordions() {
  document.querySelectorAll('.faq-question').forEach(btn => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      if (!item) return;
      const answer = item.querySelector('.faq-answer');
      const isOpen = item.classList.contains('open');
      item.parentElement?.querySelectorAll('.faq-item').forEach(other => {
        other.classList.remove('open');
        const otherAnswer = other.querySelector('.faq-answer');
        if (otherAnswer) otherAnswer.style.maxHeight = null;
      });
      if (!isOpen) {
        item.classList.add('open');
        if (answer) answer.style.maxHeight = answer.scrollHeight + 'px';
      }
    });
  });
}

// ======================================
// تهيئة الصفحة
// ======================================
document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  updateOrdersBadge();
  initFaqAccordions();
  injectFloatingShareButton();

  // تحديث الشارة كل دقيقة
  setInterval(updateOrdersBadge, 60000);
});

// ======================================
// مساعد طباعة الطلب
// ======================================
function printOrder(order) {
  const items = JSON.parse(order.items || '[]');
  const win = window.open('', '_blank', 'width=600,height=800');
  win.document.write(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>طلب رقم ${order.id?.substr(0,8)}</title>
      <style>
        body { font-family: 'Cairo', sans-serif; padding: 20px; direction: rtl; }
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
        h2 { color: #1a5276; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th { background: #1a5276; color: white; padding: 10px; text-align: right; }
        td { padding: 8px 10px; border-bottom: 1px solid #eee; }
        .total { font-size: 1.2rem; font-weight: 900; color: #27ae60; }
        .header { display: flex; justify-content: space-between; align-items: center; }
        .logo { display:flex; align-items:center; gap:10px; font-size: 1.1rem; font-weight: 900; color: #1a5276; }
        .logo img { width: 42px; height: 42px; object-fit: contain; border-radius: 10px; background:#fff; padding:3px; box-shadow: 0 2px 10px rgba(26,82,118,.18); }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo"><img src="assets/logo.png" alt="شعار مجمع الحبيشي التجاري"><span>مجمع الحبيشي التجاري</span></div>
        <div>تاريخ: ${formatDate(order.created_at)}</div>
      </div>
      <hr>
      <h2>طلب رقم: ${order.id?.substr(0,8)}...</h2>
      <p>العميل: <strong>${order.customer_name}</strong></p>
      <p>الجوال: <strong>${order.phone}</strong></p>
      ${order.is_member ? '<p>🏅 عميل مشترك</p>' : ''}
      <table>
        <thead><tr><th>#</th><th>الصنف</th><th>الكمية</th><th>الوحدة</th><th>السعر</th><th>الإجمالي</th></tr></thead>
        <tbody>
          ${items.map((item, i) => `
            <tr>
              <td>${i+1}</td>
              <td>${item.name}</td>
              <td>${item.quantity}</td>
              <td>${item.unit || ''}</td>
              <td>${item.price?.toLocaleString('ar-YE')} ريال</td>
              <td>${(item.price * item.quantity)?.toLocaleString('ar-YE')} ريال</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <p class="total">الإجمالي: ${order.total?.toLocaleString('ar-YE')} ريال</p>
      ${order.notes ? `<p>ملاحظات: ${order.notes}</p>` : ''}
      <hr>
      <p style="text-align:center; color: #666;">محلات الحبيشي للمواد البناء والسباكة والكهرباء - إب - المجمعة</p>
    </body>
    </html>
  `);
  win.document.close();
  win.print();
}
