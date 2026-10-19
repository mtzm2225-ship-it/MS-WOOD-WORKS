/**
 * admin.js — واجهة لوحة الإدارة الأمامية (MS Woodworks)
 * الغرض: إدارة الطلبات، تعليقات الصور، حسابات العملاء، العاملين (HR)، الحضور، السلف، الرواتب، والمصروفات.
 * يحتوي على بوابة مالك منفصلة للعاملين والرواتب والمصروفات والعُهد والتحصيلات والمشاريع.
 */
document.addEventListener('DOMContentLoaded', () => {
  // عناصر تسجيل دخول الإدارة العامة
  const loginPanel = document.getElementById('loginPanel');
  const dashboard = document.getElementById('dashboard');
  const loginForm = document.getElementById('loginForm');
  const loginMessage = document.getElementById('loginMessage');

  // عناصر تسجيل دخول المالك (لقفل قسم العاملين)
  const ownerLoginPanel = document.getElementById('ownerLoginPanel');
  const ownerLoginForm = document.getElementById('ownerLoginForm');
  const ownerLoginMessage = document.getElementById('ownerLoginMessage');
  const ownerLoginCancel = document.getElementById('ownerLoginCancel');
  const ownerMoneyTabs = document.querySelectorAll('#ownerMoneyView > .owner-money-tabs .tab-button');

  const ordersList = document.getElementById('ordersList');
  const commentsList = document.getElementById('commentsList');
  const customersList = document.getElementById('customersList');
  const ordersMessage = document.getElementById('ordersMessage');
  const commentsMessage = document.getElementById('commentsMessage');
  const customersMessage = document.getElementById('customersMessage');
  const categoriesList = document.getElementById('categoriesList');
  const workersList = document.getElementById('workersList');
  const attendanceList = document.getElementById('attendanceList');
  const advancesList = document.getElementById('advancesList');
  const payrollList = document.getElementById('payrollList');
  const statusLabels = {
    new: 'جديد',
    contacted: 'تم التواصل',
    'in-progress': 'قيد التنفيذ',
    completed: 'مكتمل',
    cancelled: 'ملغي',
    pending: 'بانتظار المراجعة',
    approved: 'منشور',
    rejected: 'مرفوض',
    active: 'نشط',
    archived: 'موقوف',
    present: 'حاضر',
    absent: 'غائب'
  };
  const galleryAssets = window.MSWoodGalleryAssets.byId;
  let hrCategories = [];
  let hrWorkers = [];
  let attendanceRecords = [];
  const localDate = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const localMonth = (date = new Date()) => localDate(date).slice(0, 7);
  const money = (value) => `${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(value) || 0)} ج.م`;
  const formatTime = (value) => typeof value === 'string' ? value.slice(0, 5) : '';
  const formatPlainDate = (value) => new Date(`${String(value).slice(0, 10)}T00:00:00`);

  async function api(url, options = {}) {
    // تبقى الطلبات على النطاق نفسه كي يرسل المتصفح ملف جلسة الإدارة الآمن.
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
    });
    if (response.status === 204) return null;
    const result = await response.json().catch(() => ({}));
    const ownerOnlyEndpoint = /^\/api\/admin\/(?:hr\/|custodies(?:\/|\?|$)|expenses(?:\/|\?|$)|collections(?:\/|\?|$)|projects(?:\/|\?|$))/.test(url);
    if (response.status === 403 && ownerOnlyEndpoint) {
      selectDashboardView('ordersView');
      showOwnerLogin(true);
    }
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

  // عرض/إخفاء لوحة تسجيل دخول المالك (لقفل قسم العاملين فقط)
  function showOwnerLogin(show) {
    ownerLoginPanel.hidden = !show;
    if (show) {
      loginPanel.hidden = true;
      dashboard.hidden = true;
      ownerLoginPanel.querySelector('input')?.focus();
    }
  }

  function selectDashboardView(viewId) {
    document.querySelectorAll('#dashboard > .dashboard-tabs .tab-button').forEach((tab) => {
      const active = tab.dataset.view === viewId;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll('#dashboard > .dashboard-view').forEach((view) => {
      view.hidden = view.id !== viewId;
    });
  }

  function selectOwnerMoneyView(viewId) {
    ownerMoneyTabs.forEach((tab) => {
      const active = tab.dataset.ownerMoneyView === viewId;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll('#ownerMoneyView > .owner-money-view').forEach((view) => {
      view.hidden = view.id !== viewId;
    });
  }

  function bindTabKeyboard(tabs) {
    tabs.forEach((tab, index) => {
      tab.addEventListener('keydown', (event) => {
        const rtl = document.documentElement.dir === 'rtl';
        const forwardKey = rtl ? 'ArrowLeft' : 'ArrowRight';
        const backwardKey = rtl ? 'ArrowRight' : 'ArrowLeft';
        let nextIndex = index;
        if (event.key === forwardKey) nextIndex = (index + 1) % tabs.length;
        else if (event.key === backwardKey) nextIndex = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === 'Home') nextIndex = 0;
        else if (event.key === 'End') nextIndex = tabs.length - 1;
        else return;
        event.preventDefault();
        tabs[nextIndex].focus();
        tabs[nextIndex].click();
      });
    });
  }

  async function loadOwnerMoneyView(viewId) {
    if (viewId === 'hrView') await loadHrDashboard();
    else if (viewId === 'expensesView') await loadExpensesDashboard();
    else if (viewId === 'collectionsView') await loadCollectionsDashboard();
  }

  function hideOwnerLogin() {
    ownerLoginPanel.hidden = true;
    ownerLoginMessage.textContent = '';
    ownerLoginForm.reset();
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
    document.getElementById('adminSummary').setAttribute('aria-busy', 'false');
    document.getElementById('summaryMessage').textContent = '';
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
      const statusBadge = makeStatus(order.status);
      const feedback = element('span', 'record-feedback');
      feedback.setAttribute('role', 'status');
      feedback.setAttribute('aria-live', 'polite');
      actions.append(statusBadge);
      const select = document.createElement('select');
      select.setAttribute('aria-label', `تحديث حالة طلب ${order.name}`);
      Object.entries({ new: 'جديد', contacted: 'تم التواصل', 'in-progress': 'قيد التنفيذ', completed: 'مكتمل', cancelled: 'ملغي' }).forEach(([value, label]) => {
        const option = element('option', '', label);
        option.value = value;
        option.selected = value === order.status;
        select.append(option);
      });
      select.addEventListener('change', async () => {
        const previousStatus = order.status;
        const nextStatus = select.value;
        select.disabled = true;
        feedback.textContent = 'جار حفظ الحالة…';
        try {
          const result = await api(`/api/admin/orders/${order.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: nextStatus })
          });
          order.status = result.status;
          statusBadge.dataset.status = result.status;
          statusBadge.textContent = statusLabels[result.status] || result.status;
          feedback.textContent = 'تم حفظ الحالة.';
          const currentFilter = document.getElementById('orderStatusFilter').value;
          if (currentFilter !== 'all' && currentFilter !== result.status) {
            currentOrders = currentOrders.filter((record) => record.id !== order.id);
            card.remove();
          }
          loadSummary().catch((error) => {
            document.getElementById('summaryMessage').textContent = error.message;
          });
        } catch (error) {
          order.status = previousStatus;
          select.value = previousStatus;
          feedback.textContent = `تعذر حفظ الحالة. ${error.message}`;
        } finally {
          select.disabled = false;
        }
      });
      actions.append(select, feedback);
      card.append(top, contact, message, actions);
      ordersList.append(card);
    });
  }

  let currentOrders = [];
  async function loadOrders() {
    const status = document.getElementById('orderStatusFilter').value;
    const params = status === 'all' ? '' : `?status=${encodeURIComponent(status)}`;
    ordersList.setAttribute('aria-busy', 'true');
    ordersList.replaceChildren(element('p', 'loading-state', 'جار تحميل الطلبات…'));
    try {
      currentOrders = await api(`/api/admin/orders${params}`);
      renderOrders(currentOrders);
    } catch (error) {
      ordersList.replaceChildren(element('p', 'empty-state', `تعذر تحميل الطلبات: ${error.message}`));
      throw error;
    } finally {
      ordersList.setAttribute('aria-busy', 'false');
    }
  }

  function renderComments(records) {
    commentsList.replaceChildren();
    commentsList.setAttribute('aria-busy', 'false');
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
        approve.addEventListener('click', () => updateComment(comment.id, 'approved', approve));
        actions.append(approve);
      }
      if (comment.status !== 'rejected') {
        const reject = element('button', 'button button--reject', 'رفض');
        reject.type = 'button';
        reject.addEventListener('click', () => updateComment(comment.id, 'rejected', reject));
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
    commentsList.setAttribute('aria-busy', 'true');
    commentsList.replaceChildren(element('p', 'loading-state', 'جار تحميل التعليقات…'));
    try {
      renderComments(await api(`/api/admin/comments${params}`));
    } catch (error) {
      commentsList.replaceChildren(element('p', 'empty-state', `تعذر تحميل التعليقات: ${error.message}`));
      throw error;
    } finally {
      commentsList.setAttribute('aria-busy', 'false');
    }
  }

  function renderCustomers(customers) {
    customersList.replaceChildren();
    if (!customers.length) {
      customersList.append(element('p', 'empty-state', 'لا توجد حسابات عملاء مسجلة حتى الآن.'));
      return;
    }

    customers.forEach((customer) => {
      const card = element('article', 'record');
      const top = element('div', 'record-top');
      top.append(
        element('h3', 'record-title', customer.name),
        element('time', 'record-date', `تاريخ التسجيل: ${formatDate(customer.created_at)}`)
      );
      const contact = element('div', 'record-contact');
      const email = element('a', '', customer.email);
      email.href = `mailto:${customer.email}`;
      const phone = element('a', '', customer.phone);
      phone.href = `tel:${customer.phone.replace(/[^+\d]/g, '')}`;
      contact.append(email, phone);
      card.append(top, contact);
      customersList.append(card);
    });
  }

  async function loadCustomers() {
    customersMessage.textContent = '';
    customersList.setAttribute('aria-busy', 'true');
    customersList.replaceChildren(element('p', 'loading-state', 'جار تحميل حسابات العملاء…'));
    try {
      renderCustomers(await api('/api/admin/customers'));
    } catch (error) {
      customersMessage.textContent = error.message;
    } finally {
      customersList.setAttribute('aria-busy', 'false');
    }
  }

  async function updateComment(id, status, actionButton) {
    commentsMessage.textContent = '';
    actionButton.disabled = true;
    actionButton.textContent = status === 'approved' ? 'جار الاعتماد…' : 'جار الرفض…';
    try {
      await api(`/api/admin/comments/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    } catch (error) {
      commentsMessage.textContent = `تعذر تحديث التعليق. ${error.message}`;
      actionButton.disabled = false;
      actionButton.textContent = status === 'approved' ? 'اعتماد ونشر' : 'رفض';
      return;
    }

    commentsMessage.textContent = status === 'approved' ? 'تم اعتماد التعليق ونشره.' : 'تم رفض التعليق.';
    const refreshResults = await Promise.allSettled([loadComments(), loadSummary()]);
    if (refreshResults.some((result) => result.status === 'rejected')) {
      commentsMessage.textContent += ' تعذر تحديث العرض؛ أعد تحميل القائمة.';
    }
  }

  function updateWorkerSelect(select, { includeInactive = false } = {}) {
    const priorValue = select.value;
    const workers = includeInactive ? hrWorkers : hrWorkers.filter((worker) => worker.active);
    select.replaceChildren(element('option', '', 'اختر العامل'));
    select.options[0].value = '';
    workers.forEach((worker) => {
      const option = element('option', '', `${worker.name}${worker.active ? '' : ' (موقوف)'}`);
      option.value = worker.id;
      select.append(option);
    });
    if (workers.some((worker) => String(worker.id) === priorValue)) select.value = priorValue;
    select.disabled = workers.length === 0;
  }

  function renderCategories() {
    const workerCategory = document.getElementById('workerCategory');
    const selectedCategory = workerCategory.value;
    workerCategory.replaceChildren(element('option', '', 'اختر الفئة'));
    workerCategory.options[0].value = '';
    hrCategories.forEach((category) => {
      const option = element('option', '', `${category.name} (${category.worker_count})`);
      option.value = category.id;
      workerCategory.append(option);
    });
    workerCategory.value = selectedCategory;

    categoriesList.replaceChildren();
    if (!hrCategories.length) {
      categoriesList.append(element('p', 'empty-state', 'أضف أول فئة عمل مثل نجار أو دهّان.'));
      return;
    }

    hrCategories.forEach((category) => {
      const form = element('form', 'category-record');
      const name = document.createElement('input');
      name.value = category.name;
      name.maxLength = 80;
      name.required = true;
      name.setAttribute('aria-label', `اسم فئة ${category.name}`);
      const count = element('span', 'record-date', `${category.worker_count} عامل`);
      const save = element('button', 'button button--quiet', 'حفظ الاسم');
      save.type = 'submit';
      const remove = element('button', 'button button--reject', 'حذف');
      remove.type = 'button';
      remove.disabled = Number(category.worker_count) > 0;
      remove.title = remove.disabled ? 'انقل العاملين إلى فئة أخرى قبل حذف هذه الفئة.' : '';
      remove.addEventListener('click', async () => {
        if (!window.confirm(`حذف فئة «${category.name}»؟`)) return;
        try {
          await api(`/api/admin/hr/categories/${category.id}`, { method: 'DELETE' });
          await loadHrData();
        } catch (error) {
          document.getElementById('categoriesMessage').textContent = error.message;
        }
      });
      form.append(name, count, save, remove);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
          await api(`/api/admin/hr/categories/${category.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ name: name.value })
          });
          document.getElementById('categoriesMessage').textContent = 'تم تحديث اسم الفئة.';
          await loadHrData();
        } catch (error) {
          document.getElementById('categoriesMessage').textContent = error.message;
        }
      });
      categoriesList.append(form);
    });
  }

  function beginWorkerEdit(worker) {
    document.getElementById('workerId').value = worker.id;
    document.getElementById('workerName').value = worker.name;
    document.getElementById('workerPhone').value = worker.phone;
    document.getElementById('workerCategory').value = worker.category_id;
    document.getElementById('workerSalary').value = worker.monthly_salary;
    document.getElementById('workerFormTitle').textContent = 'تعديل بيانات العامل';
    document.getElementById('workerSubmit').textContent = 'حفظ التعديلات';
    document.getElementById('workerCancel').hidden = false;
    document.getElementById('workerForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function resetWorkerForm() {
    document.getElementById('workerForm').reset();
    document.getElementById('workerId').value = '';
    document.getElementById('workerFormTitle').textContent = 'إضافة عامل';
    document.getElementById('workerSubmit').textContent = 'إضافة العامل';
    document.getElementById('workerCancel').hidden = true;
  }

  function renderWorkers() {
    const showAll = document.getElementById('workerStatusFilter').value === 'all';
    const workers = hrWorkers.filter((worker) => showAll || worker.active);
    workersList.replaceChildren();
    if (!workers.length) {
      workersList.append(element('p', 'empty-state', 'لا يوجد عمال هنا حتى الآن. أضف عاملًا لبدء سجل الحضور والرواتب.'));
      return;
    }

    workers.forEach((worker) => {
      const card = element('article', 'record worker-record');
      const details = element('div', 'worker-details');
      details.append(
        element('h4', 'record-title', worker.name),
        element('span', '', `${worker.category_name} · ${worker.phone}`),
        element('strong', '', `الراتب الشهري: ${money(worker.monthly_salary)}`)
      );
      const actions = element('div', 'record-actions worker-actions');
      actions.append(makeStatus(worker.active ? 'active' : 'archived'));
      const edit = element('button', 'button button--quiet', 'تعديل');
      edit.type = 'button';
      edit.addEventListener('click', () => beginWorkerEdit(worker));
      const archive = element('button', worker.active ? 'button button--reject' : 'button button--approve',
        worker.active ? 'إيقاف العامل' : 'إعادة تفعيل');
      archive.type = 'button';
      archive.addEventListener('click', async () => {
        const verb = worker.active ? 'إيقاف' : 'إعادة تفعيل';
        if (!window.confirm(`${verb} العامل ${worker.name}؟`)) return;
        try {
          await api(`/api/admin/hr/workers/${worker.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              name: worker.name,
              phone: worker.phone,
              categoryId: worker.category_id,
              monthlySalary: worker.monthly_salary,
              active: !worker.active
            })
          });
          await loadHrData();
        } catch (error) {
          document.getElementById('workersMessage').textContent = error.message;
        }
      });
      actions.append(edit, archive);
      card.append(details, actions);
      workersList.append(card);
    });
  }

  function renderAttendance(records) {
    attendanceRecords = records;
    attendanceList.replaceChildren();
    if (!records.length) {
      attendanceList.append(element('p', 'empty-state', 'لا يوجد سجل لهذا اليوم. اختر العامل والحالة ثم احفظ الحضور.'));
      return;
    }
    records.forEach((record) => {
      const card = element('article', 'record worker-record');
      const details = element('div', 'worker-details');
      details.append(
        element('h4', 'record-title', record.worker_name),
        element('span', '', record.category_name),
        element('span', '', record.status === 'present'
          ? `حضور ${formatTime(record.check_in) || '—'} · انصراف ${formatTime(record.check_out) || 'لم يُسجّل'}`
          : 'غائب'),
        ...(record.note ? [element('span', '', record.note)] : [])
      );
      const actions = element('div', 'record-actions worker-actions');
      actions.append(makeStatus(record.status));
      if (hrWorkers.some((worker) => String(worker.id) === String(record.worker_id) && worker.active)) {
        const edit = element('button', 'button button--quiet', 'تحديث السجل');
        edit.type = 'button';
        edit.addEventListener('click', () => {
          document.getElementById('attendanceWorker').value = record.worker_id;
          document.getElementById('attendanceDate').value = record.work_date.slice(0, 10);
          document.getElementById('attendanceStatus').value = record.status;
          document.getElementById('attendanceStatus').dispatchEvent(new Event('change'));
          document.getElementById('checkIn').value = record.check_in || '';
          document.getElementById('checkOut').value = record.check_out || '';
          document.getElementById('attendanceNote').value = record.note || '';
          document.getElementById('attendanceForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        actions.append(edit);
      }
      card.append(details, actions);
      attendanceList.append(card);
    });
  }

  function renderAdvances(records) {
    advancesList.replaceChildren();
    if (!records.length) {
      advancesList.append(element('p', 'empty-state', 'لا توجد سُلف مسجلة لهذا الشهر.'));
      return;
    }
    records.forEach((advance) => {
      const card = element('article', 'record worker-record');
      const details = element('div', 'worker-details');
      details.append(
        element('h4', 'record-title', advance.worker_name),
        element('span', '', new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(
          new Date(`${advance.advance_date}T00:00:00`)
        )),
        ...(advance.note ? [element('span', '', advance.note)] : [])
      );
      card.append(details, element('strong', 'advance-amount', money(advance.amount)));
      advancesList.append(card);
    });
  }

  function renderPayroll(records) {
    payrollList.replaceChildren();
    if (!records.length) {
      const row = document.createElement('tr');
      const cell = element('td', 'empty-state', 'أضف عاملًا نشطًا لعرض كشف الرواتب.');
      cell.colSpan = 5;
      row.append(cell);
      payrollList.append(row);
      document.getElementById('hrAdvancesTotal').textContent = money(0);
      document.getElementById('hrNetTotal').textContent = money(0);
      return;
    }
    let advancesTotal = 0;
    let netTotal = 0;
    records.forEach((record) => {
      advancesTotal += Number(record.advances_total);
      netTotal += Number(record.net_salary);
      const row = document.createElement('tr');
      row.append(
        element('td', '', record.name),
        element('td', '', record.category_name),
        element('td', '', money(record.monthly_salary)),
        element('td', '', money(record.advances_total)),
        element('td', Number(record.net_salary) < 0 ? 'payroll-negative' : 'payroll-net', money(record.net_salary))
      );
      payrollList.append(row);
    });
    document.getElementById('hrAdvancesTotal').textContent = money(advancesTotal);
    document.getElementById('hrNetTotal').textContent = money(netTotal);
  }

  const expensePaymentLabels = {
    cash: 'نقدًا',
    transfer: 'تحويل بنكي',
    card: 'بطاقة',
    wallet: 'محفظة إلكترونية',
    other: 'أخرى'
  };

  function updateCustodySelect(select, custodies) {
    const selected = select.value;
    select.replaceChildren();
    const placeholder = element('option', '', custodies.length ? 'اختر مسؤول العُهدة' : 'سجّل عُهدة جديدة أولًا');
    placeholder.value = '';
    placeholder.disabled = true;
    placeholder.selected = true;
    select.append(placeholder);
    custodies.forEach((custody) => {
      const option = element('option', '', `${custody.holder_name} · المتاح ${money(custody.balance)}`);
      option.value = custody.id;
      option.selected = String(custody.id) === selected;
      select.append(option);
    });
  }

  function renderExpenseReport(report) {
    const summary = report.summary || {};
    document.getElementById('expensesTotal').textContent = money(summary.total);
    document.getElementById('custodyExpensesTotal').textContent = money(summary.custody_total);
    document.getElementById('directExpensesTotal').textContent = money(summary.direct_total);
    document.getElementById('custodyBalanceTotal').textContent = money(
      report.custodies.reduce((total, custody) => total + Number(custody.balance), 0)
    );

    [document.getElementById('movementCustody'), document.getElementById('expenseCustody')]
      .forEach((select) => updateCustodySelect(select, report.custodies));

    const balances = document.getElementById('custodyBalancesList');
    balances.replaceChildren();
    if (!report.custodies.length) {
      balances.append(element('p', 'empty-state', 'لا توجد عُهد نشطة. سجّل العُهدة الأولى لتبدأ متابعة رصيدها.'));
    } else {
      report.custodies.forEach((custody) => {
        const card = element('article', 'record worker-record');
        card.append(
          element('div', 'worker-details'),
          element('strong', 'advance-amount', money(custody.balance))
        );
        card.firstElementChild.append(
          element('h4', 'record-title', custody.holder_name),
          element('span', '', `رقم العُهدة ${custody.id}`)
        );
        balances.append(card);
      });
    }

    const categories = document.getElementById('expenseCategoriesList');
    categories.replaceChildren();
    if (!report.categories.length) {
      const row = document.createElement('tr');
      const cell = element('td', 'empty-state', 'لا توجد مصروفات في الفترة المختارة.');
      cell.colSpan = 3;
      row.append(cell);
      categories.append(row);
    } else {
      report.categories.forEach((category) => {
        const row = document.createElement('tr');
        row.append(
          element('td', '', category.category),
          element('td', '', new Intl.NumberFormat('ar-EG').format(category.expense_count)),
          element('td', '', money(category.total))
        );
        categories.append(row);
      });
    }

    const expenseList = document.getElementById('expensesList');
    expenseList.replaceChildren();
    if (!report.expenses.length) {
      expenseList.append(element('p', 'empty-state', 'لا توجد مصروفات مسجلة في الفترة المختارة.'));
    } else {
      report.expenses.forEach((expense) => {
        const card = element('article', 'record expense-record');
        const details = element('div', 'worker-details');
        details.append(
          element('h4', 'record-title', `${expense.category} · ${money(expense.amount)}`),
          element('span', '', new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' })
            .format(formatPlainDate(expense.expense_date))),
          element('span', '', expense.description),
          element('span', '', expense.source === 'custody'
            ? `من عُهدة ${expense.holder_name || ''}`
            : 'مصروف مباشر خارج العُهد'),
          element('span', '', `طريقة الدفع: ${expensePaymentLabels[expense.payment_method] || expense.payment_method}`)
        );
        if (expense.paid_to) details.append(element('span', '', `المورّد/المستلم: ${expense.paid_to}`));
        if (expense.reference) details.append(element('span', '', `رقم الإيصال: ${expense.reference}`));
        if (expense.note) details.append(element('span', '', `ملاحظة: ${expense.note}`));
        card.append(details);
        expenseList.append(card);
      });
      if (Number(report.expenses[0].result_total) > report.expenses.length) {
        expenseList.append(element('p', 'inline-message', 'يعرض السجل أحدث ١٠٠٠ مصروف في الفترة؛ الإجماليات تشمل كل الحركات.'));
      }
    }

    const movementList = document.getElementById('custodyMovementsList');
    movementList.replaceChildren();
    if (!report.movements.length) {
      movementList.append(element('p', 'empty-state', 'لا توجد حركات تسليم أو إرجاع في الفترة المختارة.'));
    } else {
      report.movements.forEach((movement) => {
        const returned = movement.movement_type === 'returned';
        const card = element('article', 'record expense-record');
        const details = element('div', 'worker-details');
        details.append(
          element('h4', 'record-title', `${movement.holder_name} · ${returned ? 'إرجاع إلى الخزنة' : 'تسليم عُهدة'}`),
          element('span', '', new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' })
            .format(formatPlainDate(movement.movement_date))),
          ...(movement.note ? [element('span', '', movement.note)] : [])
        );
        card.append(details, element('strong', returned ? 'payroll-negative' : 'advance-amount', money(movement.amount)));
        movementList.append(card);
      });
      if (Number(report.movements[0].result_total) > report.movements.length) {
        movementList.append(element('p', 'inline-message', 'يعرض السجل أحدث ١٠٠٠ حركة عُهدة في الفترة.'));
      }
    }
  }

  async function loadExpenses() {
    const from = document.getElementById('expenseFrom').value;
    const to = document.getElementById('expenseTo').value;
    if (!from || !to) return;
    if (from > to) throw new Error('تاريخ البداية يجب أن يكون قبل تاريخ النهاية أو مساويًا له.');
    const list = document.getElementById('expensesList');
    list.setAttribute('aria-busy', 'true');
    list.replaceChildren(element('p', 'loading-state', 'جار تحميل مصروفات الفترة…'));
    try {
      const query = new URLSearchParams({ from, to });
      renderExpenseReport(await api(`/api/admin/expenses?${query}`));
    } finally {
      list.setAttribute('aria-busy', 'false');
    }
  }

  async function refreshExpenseReportAfterSave(message, successMessage) {
    message.textContent = successMessage;
    try {
      await loadExpenses();
    } catch (error) {
      message.textContent = `${successMessage} تعذر تحديث التقرير: ${error.message}`;
    }
  }

  async function loadExpensesDashboard() {
    const message = document.getElementById('expensesMessage');
    message.textContent = '';
    try {
      await loadExpenses();
    } catch (error) {
      message.textContent = error.message;
    }
  }

  function updateOrderSelect(select, orders, placeholderText) {
    const selected = select.value;
    select.replaceChildren();
    const placeholder = element('option', '', placeholderText);
    placeholder.value = '';
    placeholder.disabled = true;
    placeholder.selected = true;
    select.append(placeholder);
    orders.forEach((order) => {
      const option = element('option', '', `${order.name} · ${order.phone} · طلب ${order.id}`);
      option.value = order.id;
      option.selected = String(order.id) === selected;
      select.append(option);
    });
  }

  function renderCollections(report) {
    const summary = report.summary || {};
    document.getElementById('collectionsTotal').textContent = money(summary.total);
    document.getElementById('projectCollectionsTotal').textContent = money(summary.project_total);
    document.getElementById('orderCollectionsTotal').textContent = money(summary.order_total);
    document.getElementById('generalCollectionsTotal').textContent = money(summary.general_total);

    updateOrderSelect(document.getElementById('projectOrder'), report.availableOrders, 'اختر طلب العميل');
    updateOrderSelect(document.getElementById('receiptOrder'), report.availableOrders, 'اختر طلب العميل');

    const projectSelect = document.getElementById('receiptProject');
    const selectedProject = projectSelect.value;
    projectSelect.replaceChildren();
    const projectPlaceholder = element('option', '', report.projects.length ? 'اختر المشروع' : 'سجّل مشروعًا أولًا');
    projectPlaceholder.value = '';
    projectPlaceholder.disabled = true;
    projectPlaceholder.selected = true;
    projectSelect.append(projectPlaceholder);
    report.projects.forEach((project) => {
      const option = element('option', '', `${project.name} · ${project.customer_name} · المتبقي ${money(project.remaining_amount)}`);
      option.value = project.id;
      option.selected = String(project.id) === selectedProject;
      projectSelect.append(option);
    });

    const projectsList = document.getElementById('collectionProjectsList');
    projectsList.replaceChildren();
    if (!report.projects.length) {
      const row = document.createElement('tr');
      const cell = element('td', 'empty-state', 'لا توجد مشاريع مرتبطة بطلب بعد. سجّل شغلًا متفقًا عليه للبدء بحساب المدفوع والمتبقي.');
      cell.colSpan = 5;
      row.append(cell);
      projectsList.append(row);
    } else {
      report.projects.forEach((project) => {
        const row = document.createElement('tr');
        const remaining = Number(project.remaining_amount);
        row.append(
          element('td', '', project.name),
          element('td', '', `${project.customer_name} · ${project.phone}`),
          element('td', '', money(project.agreed_amount)),
          element('td', '', money(project.paid_total)),
          element('td', remaining < 0 ? 'collection-overpaid' : 'payroll-net',
            remaining < 0 ? `زيادة محصلة ${money(Math.abs(remaining))}` : money(remaining))
        );
        projectsList.append(row);
      });
    }

    const receiptsList = document.getElementById('receiptsList');
    receiptsList.replaceChildren();
    if (!report.receipts.length) {
      receiptsList.append(element('p', 'empty-state', 'لا توجد تحصيلات في الفترة المختارة.'));
    } else {
      report.receipts.forEach((receipt) => {
        const card = element('article', 'record expense-record');
        const details = element('div', 'worker-details');
        const typeLabel = {
          project: 'دفعة مشروع متفق عليه',
          order: 'تحصيل مرتبط بطلب',
          general: 'إيراد عام غير مرتبط'
        }[receipt.receipt_type];
        details.append(
          element('h4', 'record-title', `${typeLabel} · ${money(receipt.amount)}`),
          element('span', '', new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' })
            .format(formatPlainDate(receipt.receipt_date))),
          element('span', '', receipt.description)
        );
        if (receipt.project_name) details.append(element('span', '', `المشروع: ${receipt.project_name}`));
        if (receipt.customer_name) details.append(element('span', '', `العميل: ${receipt.customer_name}`));
        if (receipt.paid_by) details.append(element('span', '', `الدافع: ${receipt.paid_by}`));
        details.append(element('span', '', `طريقة الاستلام: ${expensePaymentLabels[receipt.payment_method] || receipt.payment_method}`));
        if (receipt.reference) details.append(element('span', '', `رقم الإيصال/التحويل: ${receipt.reference}`));
        if (receipt.note) details.append(element('span', '', `ملاحظة: ${receipt.note}`));
        card.append(details);
        receiptsList.append(card);
      });
      if (Number(report.receipts[0].result_total) > report.receipts.length) {
        receiptsList.append(element('p', 'inline-message', 'يعرض السجل أحدث ١٠٠٠ تحصيل في الفترة؛ الإجماليات تشمل كل الحركات.'));
      }
    }
  }

  async function loadCollections() {
    const from = document.getElementById('collectionFrom').value;
    const to = document.getElementById('collectionTo').value;
    if (!from || !to) return null;
    if (from > to) throw new Error('تاريخ بداية التحصيلات يجب أن يكون قبل تاريخ النهاية أو مساويًا له.');
    const list = document.getElementById('receiptsList');
    list.setAttribute('aria-busy', 'true');
    list.replaceChildren(element('p', 'loading-state', 'جار تحميل التحصيلات…'));
    try {
      const query = new URLSearchParams({ from, to });
      const report = await api(`/api/admin/collections?${query}`);
      renderCollections(report);
      return report;
    } finally {
      list.setAttribute('aria-busy', 'false');
    }
  }

  async function refreshCollectionsAfterSave(message, successMessage, projectId = '') {
    message.textContent = successMessage;
    try {
      const report = await loadCollections();
      const project = report?.projects.find((item) => String(item.id) === String(projectId));
      if (project && Number(project.remaining_amount) < 0) {
        message.textContent = `${successMessage} تنبيه: التحصيل تجاوز قيمة الاتفاق بمقدار ${money(Math.abs(project.remaining_amount))}.`;
      }
    } catch (error) {
      message.textContent = `${successMessage} تعذر تحديث تقرير التحصيلات: ${error.message}`;
    }
  }

  async function loadCollectionsDashboard() {
    const message = document.getElementById('collectionsMessage');
    message.textContent = '';
    try {
      await loadCollections();
    } catch (error) {
      message.textContent = error.message;
    }
  }

  async function submitLedgerForm(form, event, action) {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    const message = document.getElementById('expensesMessage');
    message.textContent = '';
    submit.disabled = true;
    try {
      await action(message);
    } catch (error) {
      message.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  }

  async function submitCollectionForm(form, event, action) {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    const message = document.getElementById('collectionsMessage');
    message.textContent = '';
    submit.disabled = true;
    try {
      await action(message);
    } catch (error) {
      message.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  }

  async function loadHrData() {
    const [categories, workers] = await Promise.all([
      api('/api/admin/hr/categories'),
      api('/api/admin/hr/workers')
    ]);
    hrCategories = categories;
    hrWorkers = workers;
    document.getElementById('hrCategoryCount').textContent = categories.length;
    document.getElementById('hrWorkerCount').textContent = workers.filter((worker) => worker.active).length;
    renderCategories();
    renderWorkers();
    ['attendanceWorker', 'advanceWorker'].forEach((id) => updateWorkerSelect(document.getElementById(id)));
    if (document.getElementById('workerId').value) {
      const editingWorker = workers.find((worker) => String(worker.id) === document.getElementById('workerId').value);
      if (editingWorker) document.getElementById('workerCategory').value = editingWorker.category_id;
      else resetWorkerForm();
    }
    await Promise.all([loadAttendance(), loadAdvances(), loadPayroll()]);
  }

  async function loadAttendance() {
    const date = document.getElementById('attendanceDate').value;
    if (!date) return;
    renderAttendance(await api(`/api/admin/hr/attendance?date=${encodeURIComponent(date)}`));
  }

  async function loadAdvances() {
    const month = document.getElementById('payrollMonth').value;
    if (!month) return;
    renderAdvances(await api(`/api/admin/hr/advances?month=${encodeURIComponent(month)}`));
  }

  async function loadPayroll() {
    const month = document.getElementById('payrollMonth').value;
    if (!month) return;
    renderPayroll(await api(`/api/admin/hr/payroll?month=${encodeURIComponent(month)}`));
  }

  async function loadHrDashboard() {
    document.getElementById('categoriesMessage').textContent = '';
    document.getElementById('workersMessage').textContent = '';
    document.getElementById('attendanceMessage').textContent = '';
    document.getElementById('advancesMessage').textContent = '';
    document.getElementById('payrollMessage').textContent = '';
    try {
      await loadHrData();
    } catch (error) {
      document.getElementById('workersMessage').textContent = error.message;
    }
  }

  async function loadDashboard() {
    ordersMessage.textContent = '';
    commentsMessage.textContent = '';
    const results = await Promise.allSettled([loadSummary(), loadOrders(), loadComments()]);
    const [summaryResult, ordersResult, commentsResult] = results;
    if (summaryResult.status === 'rejected') {
      document.getElementById('adminSummary').setAttribute('aria-busy', 'false');
      document.getElementById('summaryMessage').textContent = summaryResult.reason.message;
    }
    if (ordersResult.status === 'rejected') ordersMessage.textContent = ordersResult.reason.message;
    if (commentsResult.status === 'rejected') commentsMessage.textContent = commentsResult.reason.message;
    if ([summaryResult, ordersResult, commentsResult].some((result) => (
      result.status === 'rejected' && result.reason.message.includes('تسجيل الدخول')
    ))) showSignedIn(false);
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

  // تسجيل دخول المالك لقفل قسم العاملين فقط
  ownerLoginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    ownerLoginMessage.textContent = '';
    const submit = ownerLoginForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    const formData = new FormData(ownerLoginForm);
    try {
      await api('/api/owner/login', {
        method: 'POST',
        body: JSON.stringify({ username: formData.get('username'), password: formData.get('password') })
      });
      ownerLoginForm.reset();
      hideOwnerLogin();
      showSignedIn(true);
      selectDashboardView('ownerMoneyView');
      selectOwnerMoneyView('hrView');
      await loadOwnerMoneyView('hrView');
    } catch (error) {
      ownerLoginMessage.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });

  ownerLoginCancel.addEventListener('click', () => {
    hideOwnerLogin();
    showSignedIn(true);
    selectDashboardView('ordersView');
  });

  document.getElementById('logoutButton').addEventListener('click', async () => {
    try {
      // جلسة الإدارة والمالك مشتركة؛ مسار الخروج الموحد ينهي أي دور مسجل.
      await api('/api/admin/logout', { method: 'POST' });
      showSignedIn(false);
      hideOwnerLogin();
    } catch (error) {
      ordersMessage.textContent = error.message;
    }
  });

  document.getElementById('payrollMonth').value = localMonth();
  document.getElementById('attendanceDate').value = localDate();
  document.getElementById('advanceDate').value = localDate();
  document.getElementById('expenseTo').value = localDate();
  document.getElementById('expenseFrom').value = `${localMonth()}-01`;
  document.getElementById('custodyInitialDate').value = localDate();
  document.getElementById('custodyMovementDate').value = localDate();
  document.getElementById('expenseDate').value = localDate();
  document.getElementById('collectionTo').value = localDate();
  document.getElementById('collectionFrom').value = `${localMonth()}-01`;
  document.getElementById('receiptDate').value = localDate();

  document.getElementById('newCustodyForm').addEventListener('submit', (event) => {
    const form = event.currentTarget;
    submitLedgerForm(form, event, async (message) => {
      const formData = new FormData(form);
      await api('/api/admin/custodies', {
        method: 'POST',
        body: JSON.stringify({
          holderName: formData.get('holderName'),
          amount: formData.get('amount'),
          date: formData.get('date'),
          note: formData.get('note')
        })
      });
      form.reset();
      document.getElementById('custodyInitialDate').value = localDate();
      await refreshExpenseReportAfterSave(message, 'تم تسجيل العُهدة وتسليم المبلغ للمسؤول.');
    });
  });

  document.getElementById('custodyMovementForm').addEventListener('submit', (event) => {
    const form = event.currentTarget;
    submitLedgerForm(form, event, async (message) => {
      const formData = new FormData(form);
      await api(`/api/admin/custodies/${encodeURIComponent(formData.get('custodyId'))}/movements`, {
        method: 'POST',
        body: JSON.stringify({
          type: formData.get('type'),
          amount: formData.get('amount'),
          date: formData.get('date'),
          note: formData.get('note')
        })
      });
      form.reset();
      document.getElementById('custodyMovementDate').value = localDate();
      await refreshExpenseReportAfterSave(message, 'تم تسجيل حركة العُهدة وتحديث الرصيد.');
    });
  });

  const expenseSource = document.getElementById('expenseSource');
  const expenseCustody = document.getElementById('expenseCustody');
  const expenseCustodyField = document.getElementById('expenseCustodyField');
  function updateExpenseSource() {
    const usesCustody = expenseSource.value === 'custody';
    expenseCustodyField.hidden = !usesCustody;
    expenseCustody.required = usesCustody;
    expenseCustody.disabled = !usesCustody;
  }
  expenseSource.addEventListener('change', updateExpenseSource);
  updateExpenseSource();
  document.getElementById('expenseForm').addEventListener('submit', (event) => {
    const form = event.currentTarget;
    submitLedgerForm(form, event, async (message) => {
      const formData = new FormData(form);
      await api('/api/admin/expenses', {
        method: 'POST',
        body: JSON.stringify({
          date: formData.get('date'),
          source: formData.get('source'),
          custodyId: formData.get('source') === 'custody' ? formData.get('custodyId') : null,
          amount: formData.get('amount'),
          category: formData.get('category'),
          description: formData.get('description'),
          paidTo: formData.get('paidTo'),
          paymentMethod: formData.get('paymentMethod'),
          reference: formData.get('reference'),
          note: formData.get('note')
        })
      });
      form.reset();
      document.getElementById('expenseDate').value = localDate();
      updateExpenseSource();
      await refreshExpenseReportAfterSave(message, 'تم تسجيل المصروف وتحديث إجمالي الفترة ورصيد العُهدة.');
    });
  });

  document.getElementById('refreshExpenses').addEventListener('click', loadExpensesDashboard);

  document.getElementById('projectForm').addEventListener('submit', (event) => {
    const form = event.currentTarget;
    submitCollectionForm(form, event, async (message) => {
      const formData = new FormData(form);
      await api('/api/admin/projects', {
        method: 'POST',
        body: JSON.stringify({
          orderId: formData.get('orderId'),
          name: formData.get('name'),
          agreedAmount: formData.get('agreedAmount')
        })
      });
      form.reset();
      await refreshCollectionsAfterSave(message, 'تم تسجيل المشروع وربطه بطلب العميل.');
    });
  });

  const receiptType = document.getElementById('receiptType');
  const receiptProject = document.getElementById('receiptProject');
  const receiptOrder = document.getElementById('receiptOrder');
  function updateReceiptType() {
    const type = receiptType.value;
    const isProject = type === 'project';
    const isOrder = type === 'order';
    document.getElementById('receiptProjectField').hidden = !isProject;
    document.getElementById('receiptOrderField').hidden = !isOrder;
    receiptProject.required = isProject;
    receiptProject.disabled = !isProject;
    receiptOrder.required = isOrder;
    receiptOrder.disabled = !isOrder;
  }
  receiptType.addEventListener('change', updateReceiptType);
  updateReceiptType();

  document.getElementById('receiptForm').addEventListener('submit', (event) => {
    const form = event.currentTarget;
    submitCollectionForm(form, event, async (message) => {
      const formData = new FormData(form);
      const type = formData.get('type');
      const projectId = type === 'project' ? formData.get('projectId') : '';
      await api('/api/admin/collections', {
        method: 'POST',
        body: JSON.stringify({
          type,
          projectId,
          orderId: type === 'order' ? formData.get('orderId') : '',
          date: formData.get('date'),
          amount: formData.get('amount'),
          description: formData.get('description'),
          paidBy: formData.get('paidBy'),
          paymentMethod: formData.get('paymentMethod'),
          reference: formData.get('reference'),
          note: formData.get('note')
        })
      });
      form.reset();
      document.getElementById('receiptDate').value = localDate();
      updateReceiptType();
      const typeLabel = {
        project: 'تم تسجيل دفعة المشروع وتحديث المحصل والمتبقي.',
        order: 'تم تسجيل التحصيل المرتبط بالطلب.',
        general: 'تم تسجيل الإيراد العام.'
      }[type];
      await refreshCollectionsAfterSave(message, typeLabel, projectId);
    });
  });

  document.getElementById('refreshCollections').addEventListener('click', loadCollectionsDashboard);

  document.getElementById('categoryForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = document.getElementById('categoriesMessage');
    message.textContent = '';
    try {
      await api('/api/admin/hr/categories', {
        method: 'POST',
        body: JSON.stringify({ name: document.getElementById('categoryName').value })
      });
      document.getElementById('categoryForm').reset();
      message.textContent = 'تمت إضافة فئة العمل.';
      await loadHrData();
    } catch (error) {
      message.textContent = error.message;
    }
  });

  document.getElementById('workerForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = document.getElementById('workersMessage');
    const workerId = document.getElementById('workerId').value;
    const body = {
      name: document.getElementById('workerName').value,
      phone: document.getElementById('workerPhone').value,
      categoryId: document.getElementById('workerCategory').value,
      monthlySalary: document.getElementById('workerSalary').value
    };
    message.textContent = '';
    try {
      await api(workerId ? `/api/admin/hr/workers/${workerId}` : '/api/admin/hr/workers', {
        method: workerId ? 'PATCH' : 'POST',
        body: JSON.stringify(body)
      });
      resetWorkerForm();
      message.textContent = workerId ? 'تم تحديث بيانات العامل.' : 'تمت إضافة العامل.';
      await loadHrData();
    } catch (error) {
      message.textContent = error.message;
    }
  });

  document.getElementById('workerCancel').addEventListener('click', resetWorkerForm);
  document.getElementById('workerStatusFilter').addEventListener('change', renderWorkers);

  document.getElementById('attendanceStatus').addEventListener('change', (event) => {
    const present = event.currentTarget.value === 'present';
    document.getElementById('checkIn').required = present;
    if (!present) {
      document.getElementById('checkIn').value = '';
      document.getElementById('checkOut').value = '';
    }
  });
  document.getElementById('attendanceStatus').dispatchEvent(new Event('change'));
  document.getElementById('attendanceForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = document.getElementById('attendanceMessage');
    message.textContent = '';
    try {
      await api('/api/admin/hr/attendance', {
        method: 'PUT',
        body: JSON.stringify({
          workerId: document.getElementById('attendanceWorker').value,
          date: document.getElementById('attendanceDate').value,
          status: document.getElementById('attendanceStatus').value,
          checkIn: document.getElementById('checkIn').value,
          checkOut: document.getElementById('checkOut').value,
          note: document.getElementById('attendanceNote').value
        })
      });
      document.getElementById('attendanceForm').reset();
      document.getElementById('attendanceStatus').dispatchEvent(new Event('change'));
      message.textContent = 'تم حفظ سجل الحضور والانصراف.';
      await loadAttendance();
    } catch (error) {
      message.textContent = error.message;
    }
  });

  document.getElementById('attendanceDate').addEventListener('change', async () => {
    try {
      await loadAttendance();
    } catch (error) {
      document.getElementById('attendanceMessage').textContent = error.message;
    }
  });

  document.getElementById('advanceForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = document.getElementById('advancesMessage');
    message.textContent = '';
    try {
      await api('/api/admin/hr/advances', {
        method: 'POST',
        body: JSON.stringify({
          workerId: document.getElementById('advanceWorker').value,
          date: document.getElementById('advanceDate').value,
          amount: document.getElementById('advanceAmount').value,
          note: document.getElementById('advanceNote').value
        })
      });
      document.getElementById('advanceForm').reset();
      document.getElementById('advanceDate').value = localDate();
      message.textContent = 'تم تسجيل السُلفة وخصمها في كشف شهرها.';
      await Promise.all([loadAdvances(), loadPayroll()]);
    } catch (error) {
      message.textContent = error.message;
    }
  });

  document.getElementById('payrollMonth').addEventListener('change', async () => {
    try {
      await Promise.all([loadAdvances(), loadPayroll()]);
    } catch (error) {
      document.getElementById('payrollMessage').textContent = error.message;
    }
  });

  const hrTabs = [...document.querySelectorAll('.hr-tabs .tab-button')];
  bindTabKeyboard(hrTabs);
  hrTabs.forEach((button) => {
    button.addEventListener('click', async () => {
      hrTabs.forEach((tab) => {
        const active = tab === button;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
      });
      document.querySelectorAll('.hr-subview').forEach((view) => {
        view.hidden = view.id !== button.dataset.hrView;
      });
      try {
        if (button.dataset.hrView === 'attendanceView') await loadAttendance();
        if (button.dataset.hrView === 'advancesView') await loadAdvances();
        if (button.dataset.hrView === 'payrollView') await loadPayroll();
      } catch (error) {
        document.getElementById('payrollMessage').textContent = error.message;
      }
    });
  });

  bindTabKeyboard([...ownerMoneyTabs]);
  ownerMoneyTabs.forEach((button) => {
    button.addEventListener('click', async () => {
      const viewId = button.dataset.ownerMoneyView;
      selectOwnerMoneyView(viewId);
      try {
        await loadOwnerMoneyView(viewId);
      } catch (error) {
        const messageId = viewId === 'hrView' ? 'workersMessage'
          : viewId === 'expensesView' ? 'expensesMessage' : 'collectionsMessage';
        document.getElementById(messageId).textContent = error.message;
      }
    });
  });

  const dashboardTabs = [...document.querySelectorAll('#dashboard > .dashboard-tabs .tab-button')];
  bindTabKeyboard(dashboardTabs);
  dashboardTabs.forEach((button) => {
    button.addEventListener('click', async () => {
      const viewId = button.dataset.view;
      selectDashboardView(viewId);
      if (viewId === 'commentsView') await loadComments();
      else if (viewId === 'customersView') await loadCustomers();
      else if (viewId === 'ownerMoneyView') {
        const owner = await api('/api/owner/session').catch(() => ({ authenticated: false }));
        if (!owner.authenticated) {
          showOwnerLogin(true);
          selectDashboardView('ordersView');
          await loadOrders();
          return;
        }
        const activeOwnerTab = document.querySelector('#ownerMoneyView > .owner-money-tabs .tab-button.is-active');
        const ownerViewId = activeOwnerTab?.dataset.ownerMoneyView || 'hrView';
        selectOwnerMoneyView(ownerViewId);
        try {
          await loadOwnerMoneyView(ownerViewId);
        } catch (error) {
          const messageId = ownerViewId === 'hrView' ? 'workersMessage'
            : ownerViewId === 'expensesView' ? 'expensesMessage' : 'collectionsMessage';
          document.getElementById(messageId).textContent = error.message;
        }
      } else if (viewId === 'ordersView') await loadOrders();
    });
  });

  document.getElementById('orderSearch').addEventListener('input', () => renderOrders(currentOrders));
  document.getElementById('orderStatusFilter').addEventListener('change', loadOrders);
  document.getElementById('commentStatusFilter').addEventListener('change', loadComments);
  document.getElementById('refreshCustomers').addEventListener('click', loadCustomers);

  // نستعيد الجلسات عند تحديث الصفحة (الإدارة والمالك)، أو نعرض نموذج تسجيل الدخول.
  Promise.all([
    api('/api/admin/session').catch(() => ({ authenticated: false })),
    api('/api/owner/session').catch(() => ({ authenticated: false }))
  ])
    .then(([adminResult, ownerResult]) => {
      const adminSignedIn = adminResult.authenticated;
      const ownerSignedIn = ownerResult.authenticated;
      // لوحة الإدارة العامة تحتاج دور الإدارة؛ دخول المالك وحده يحتفظ بجلسة HR حتى يكتمل تسجيل الإدارة.
      showSignedIn(adminSignedIn);
      if (adminSignedIn) {
        loadDashboard();
      } else if (ownerSignedIn) {
        loginMessage.textContent = 'جلسة المالك محفوظة. سجّل الدخول كإدارة لفتح لوحة التحكم وقسم العاملين.';
      }
    })
    .catch(() => {
      showSignedIn(false);
      loginMessage.textContent = 'تعذر الاتصال بالخادم. تأكد من تشغيل الخدمة وقاعدة البيانات.';
    });
});