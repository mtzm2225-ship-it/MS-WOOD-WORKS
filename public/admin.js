document.addEventListener('DOMContentLoaded', () => {
  const loginPanel = document.getElementById('loginPanel');
  const dashboard = document.getElementById('dashboard');
  const loginForm = document.getElementById('loginForm');
  const loginMessage = document.getElementById('loginMessage');
  const ordersList = document.getElementById('ordersList');
  const commentsList = document.getElementById('commentsList');
  const ordersMessage = document.getElementById('ordersMessage');
  const commentsMessage = document.getElementById('commentsMessage');
  const statusLabels = {
    new: 'جديد',
    contacted: 'تم التواصل',
    'in-progress': 'قيد التنفيذ',
    completed: 'مكتمل',
    cancelled: 'ملغي',
    pending: 'بانتظار المراجعة',
    approved: 'منشور',
    rejected: 'مرفوض'
  };
  const galleryImageBase = new URL('../img/', document.baseURI);
  const galleryImage = (fileName) => new URL(fileName, galleryImageBase).href;
  const galleryAssets = {
    'walnut-desk': { title: 'مكتب الجوز التنفيذي', src: galleryImage('WhatsApp Image 2026-10-12 at 11.46.46 AM.jpeg') },
    'workshop-details': { title: 'تفاصيل الصنعة', src: galleryImage('WhatsApp Image 2026-10-12 at 11.46.46 AM (1).jpeg') },
    'custom-boards': { title: 'ألواح مخصصة', src: galleryImage('WhatsApp Image 2026-10-12 at 11.46.46 AM (2).jpeg') },
    'fine-interior': { title: 'لمسات فاخرة', src: galleryImage('WhatsApp Image 2026-10-12 at 11.46.46 AM (3).jpeg') },
    'hand-finish': { title: 'تلميع يدوي', src: galleryImage('WhatsApp Image 2026-10-12 at 11.46.46 AM (4).jpeg') },
    'craft-detail': { title: 'دقة التنفيذ', src: galleryImage('WhatsApp Image 2026-10-12 at 11.46.47 AM.jpeg') },
    'wood-detail': { title: 'الخشب يميل للتفاصيل', src: galleryImage('WhatsApp Image 2026-10-12 at 11.46.47 AM (1).jpeg') },
    'modern-space': { title: 'مساحات معاصرة', src: galleryImage('WhatsApp Image 2026-10-12 at 11.46.47 AM (2).jpeg') },
    'brand-story': { title: 'صنعنا فتميزنا', src: galleryImage('MS Woodworks_ Crafted in Warmth.png') },
    'executive-walnut': { title: 'مكتب جوز فاخر', src: galleryImage('Gemini_Generated_Image_98tp7s98tp7s98tp.jpeg') },
    'brand-mark': { title: 'هوية الحِرفة', src: galleryImage('Gemini_Generated_Image_rm6yb4rm6yb4rm6y.jpeg') }
  };

  async function api(url, options = {}) {
    // تبقى الطلبات على النطاق نفسه كي يرسل المتصفح ملف جلسة الإدارة الآمن.
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
    });
    if (response.status === 204) return null;
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'تعذر إكمال الطلب.');
    return result;
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    // نعرض نصوص العملاء كنص عادي، ولا نفسرها كـHTML.
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function showSignedIn(isSignedIn) {
    loginPanel.hidden = isSignedIn;
    dashboard.hidden = !isSignedIn;
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  }

  function makeStatus(status) {
    const badge = element('span', 'status-badge', statusLabels[status] || status);
    badge.dataset.status = status;
    return badge;
  }

  async function loadSummary() {
    const summary = await api('/api/admin/summary');
    document.getElementById('ordersTotal').textContent = summary.orders_total;
    document.getElementById('ordersNew').textContent = summary.orders_new;
    document.getElementById('commentsPending').textContent = summary.comments_pending;
    document.getElementById('commentsApproved').textContent = summary.comments_approved;
  }

  function renderOrders(records) {
    const query = document.getElementById('orderSearch').value.trim().toLocaleLowerCase();
    const list = records.filter((order) => `${order.name} ${order.phone} ${order.message}`.toLocaleLowerCase().includes(query));
    ordersList.replaceChildren();
    if (!list.length) {
      ordersList.append(element('p', 'empty-state', 'لا توجد طلبات تطابق هذا البحث.'));
      return;
    }

    list.forEach((order) => {
      const card = element('article', 'record');
      const top = element('div', 'record-top');
      top.append(element('h3', 'record-title', order.name), element('time', 'record-date', formatDate(order.created_at)));

      const contact = element('div', 'record-contact');
      const phone = element('a', '', order.phone);
      phone.href = `tel:${order.phone.replace(/[^+\d]/g, '')}`;
      contact.append(phone);

      const message = element('p', 'record-message', order.message);
      const actions = element('div', 'record-actions');
      actions.append(makeStatus(order.status));
      const select = document.createElement('select');
      select.setAttribute('aria-label', `تحديث حالة طلب ${order.name}`);
      Object.entries({ new: 'جديد', contacted: 'تم التواصل', 'in-progress': 'قيد التنفيذ', completed: 'مكتمل', cancelled: 'ملغي' }).forEach(([value, label]) => {
        const option = element('option', '', label);
        option.value = value;
        option.selected = value === order.status;
        select.append(option);
      });
      select.addEventListener('change', async () => {
        select.disabled = true;
        ordersMessage.textContent = '';
        try {
          await api(`/api/admin/orders/${order.id}`, { method: 'PATCH', body: JSON.stringify({ status: select.value }) });
          await Promise.all([loadOrders(), loadSummary()]);
        } catch (error) {
          ordersMessage.textContent = error.message;
          select.disabled = false;
        }
      });
      actions.append(select);
      card.append(top, contact, message, actions);
      ordersList.append(card);
    });
  }

  let currentOrders = [];
  async function loadOrders() {
    const status = document.getElementById('orderStatusFilter').value;
    const params = status === 'all' ? '' : `?status=${encodeURIComponent(status)}`;
    currentOrders = await api(`/api/admin/orders${params}`);
    renderOrders(currentOrders);
  }

  function renderComments(records) {
    commentsList.replaceChildren();
    if (!records.length) {
      commentsList.append(element('p', 'empty-state', 'لا توجد تعليقات في هذا القسم.'));
      return;
    }

    records.forEach((comment) => {
      const card = element('article', 'record comment-record');
      const asset = galleryAssets[comment.gallery_id];
      const photo = element('div', 'comment-photo');
      if (asset) {
        const image = document.createElement('img');
        image.src = asset.src;
        image.alt = asset.title;
        image.loading = 'lazy';
        photo.append(image, element('span', '', asset.title));
      } else {
        photo.append(element('span', '', 'صورة غير معروفة'));
      }

      const content = element('div', 'comment-content');
      const top = element('div', 'record-top');
      top.append(element('h3', 'record-title', comment.name), element('time', 'record-date', formatDate(comment.created_at)));
      content.append(top, element('p', 'record-message', comment.body));
      const actions = element('div', 'record-actions');
      actions.append(makeStatus(comment.status));

      if (comment.status !== 'approved') {
        const approve = element('button', 'button button--approve', 'اعتماد ونشر');
        approve.type = 'button';
        approve.addEventListener('click', () => updateComment(comment.id, 'approved'));
        actions.append(approve);
      }
      if (comment.status !== 'rejected') {
        const reject = element('button', 'button button--reject', 'رفض');
        reject.type = 'button';
        reject.addEventListener('click', () => updateComment(comment.id, 'rejected'));
        actions.append(reject);
      }
      content.append(actions);
      card.append(photo, content);
      commentsList.append(card);
    });
  }

  async function loadComments() {
    const status = document.getElementById('commentStatusFilter').value;
    const params = status === 'all' ? '' : `?status=${encodeURIComponent(status)}`;
    renderComments(await api(`/api/admin/comments${params}`));
  }

  async function updateComment(id, status) {
    commentsMessage.textContent = '';
    try {
      await api(`/api/admin/comments/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await Promise.all([loadComments(), loadSummary()]);
    } catch (error) {
      commentsMessage.textContent = error.message;
    }
  }

  async function loadDashboard() {
    ordersMessage.textContent = '';
    commentsMessage.textContent = '';
    try {
      await Promise.all([loadSummary(), loadOrders(), loadComments()]);
    } catch (error) {
      // إذا انتهت الجلسة نعيد المستخدم إلى شاشة تسجيل الدخول.
      if (error.message.includes('تسجيل الدخول')) showSignedIn(false);
      else ordersMessage.textContent = error.message;
    }
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginMessage.textContent = '';
    const submit = loginForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    const formData = new FormData(loginForm);
    try {
      await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ email: formData.get('email'), password: formData.get('password') })
      });
      loginForm.reset();
      showSignedIn(true);
      await loadDashboard();
    } catch (error) {
      loginMessage.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });

  document.getElementById('logoutButton').addEventListener('click', async () => {
    try {
      await api('/api/admin/logout', { method: 'POST' });
      showSignedIn(false);
    } catch (error) {
      ordersMessage.textContent = error.message;
    }
  });

  document.querySelectorAll('.tab-button').forEach((button) => {
    button.addEventListener('click', async () => {
      document.querySelectorAll('.tab-button').forEach((tab) => {
        const active = tab === button;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', String(active));
      });
      document.querySelectorAll('.dashboard-view').forEach((view) => {
        view.hidden = view.id !== button.dataset.view;
      });
      if (button.dataset.view === 'commentsView') await loadComments();
      else await loadOrders();
    });
  });

  document.getElementById('orderSearch').addEventListener('input', () => renderOrders(currentOrders));
  document.getElementById('orderStatusFilter').addEventListener('change', loadOrders);
  document.getElementById('commentStatusFilter').addEventListener('change', loadComments);

  // نستعيد الجلسة عند تحديث الصفحة، أو نعرض نموذج تسجيل الدخول.
  api('/api/admin/session')
    .then((result) => {
      showSignedIn(result.authenticated);
      if (result.authenticated) loadDashboard();
    })
    .catch(() => {
      showSignedIn(false);
      loginMessage.textContent = 'تعذر الاتصال بالخادم. تأكد من تشغيل الخدمة وقاعدة البيانات.';
    });
});