const assert = require('node:assert/strict');
const Module = require('node:module');
const { after, before, test } = require('node:test');
const session = require('express-session');

// Provide disposable credentials and a fake database so tests never need production secrets or data.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgres://test:test@127.0.0.1:5432/mswood_test';
process.env.ADMIN_EMAIL = 'admin@example.test';
process.env.ADMIN_PASSWORD = 'test-only-password-long-enough';
process.env.SESSION_SECRET = 'test-only-session-secret-long-enough';

const approvedComment = {
  id: 1,
  gallery_id: 'walnut-desk',
  name: 'عميل تجريبي',
  body: 'تعليق للاختبار',
  status: 'approved',
  created_at: '2026-10-12T00:00:00.000Z'
};
const order = {
  id: 1,
  name: 'عميل تجريبي',
  phone: '+201000000000',
  message: 'طلب مكتب خشبي',
  status: 'new',
  created_at: '2026-10-12T00:00:00.000Z'
};
const workCategories = [];
const workers = [];
const attendance = [];
const advances = [];

function categoryById(id) {
  return workCategories.find((category) => String(category.id) === String(id));
}

class TestPool {
  async query(sql, values = []) {
    // Return predictable rows for the SQL statements used by the API.
    const query = sql.replace(/\s+/g, ' ').trim();
    if (query.startsWith('CREATE TABLE') || query.startsWith('CREATE INDEX')) {
      return { rows: [], rowCount: 0 };
    }
    if (query.startsWith('SELECT c.id, c.name, c.created_at')) {
      return {
        rows: workCategories.map((category) => ({
          ...category,
          worker_count: workers.filter((worker) => worker.active && worker.category_id === category.id).length
        })),
        rowCount: workCategories.length
      };
    }
    if (query.startsWith('INSERT INTO work_categories')) {
      if (workCategories.some((category) => category.name === values[0])) {
        throw Object.assign(new Error('duplicate category'), { code: '23505' });
      }
      const category = { id: workCategories.length + 1, name: values[0], created_at: '2026-10-12T00:00:00.000Z' };
      workCategories.push(category);
      return { rows: [category], rowCount: 1 };
    }
    if (query.startsWith('UPDATE work_categories')) {
      const category = categoryById(values[1]);
      if (category) category.name = values[0];
      return { rows: category ? [{ id: category.id, name: category.name }] : [], rowCount: Number(Boolean(category)) };
    }
    if (query.startsWith('DELETE FROM work_categories')) {
      if (workers.some((worker) => String(worker.category_id) === String(values[0]))) {
        throw Object.assign(new Error('category is still assigned'), { code: '23503' });
      }
      const index = workCategories.findIndex((category) => String(category.id) === String(values[0]));
      if (index < 0) return { rows: [], rowCount: 0 };
      const [category] = workCategories.splice(index, 1);
      return { rows: [{ id: category.id }], rowCount: 1 };
    }
    if (query.startsWith('SELECT w.id, w.name, w.phone, w.category_id')) {
      return {
        rows: workers.map((worker) => ({
          ...worker,
          category_name: categoryById(worker.category_id)?.name
        })),
        rowCount: workers.length
      };
    }
    if (query.startsWith('INSERT INTO workers')) {
      const worker = {
        id: workers.length + 1,
        name: values[0],
        phone: values[1],
        category_id: values[2],
        monthly_salary: values[3],
        active: true,
        created_at: '2026-10-12T00:00:00.000Z'
      };
      workers.push(worker);
      return { rows: [worker], rowCount: 1 };
    }
    if (query.startsWith('UPDATE workers')) {
      const worker = workers.find((item) => String(item.id) === String(values[5]));
      if (!worker) return { rows: [], rowCount: 0 };
      [worker.name, worker.phone, worker.category_id, worker.monthly_salary] = values.slice(0, 4);
      if (values[4] !== null) worker.active = values[4];
      return { rows: [worker], rowCount: 1 };
    }
    if (query.startsWith('SELECT a.id, a.worker_id') && query.includes('FROM worker_attendance')) {
      return {
        rows: attendance.filter((record) => record.work_date === values[0]).map((record) => ({
          ...record,
          worker_name: workers.find((worker) => worker.id === record.worker_id)?.name,
          category_name: categoryById(workers.find((worker) => worker.id === record.worker_id)?.category_id)?.name
        })),
        rowCount: attendance.length
      };
    }
    if (query.startsWith('INSERT INTO worker_attendance')) {
      if (!workers.some((worker) => worker.id === values[0] && worker.active)) return { rows: [], rowCount: 0 };
      const record = {
        id: 1,
        worker_id: values[0],
        work_date: values[1],
        status: values[2],
        check_in: values[3],
        check_out: values[4],
        note: values[5]
      };
      const existing = attendance.findIndex((item) => item.worker_id === record.worker_id && item.work_date === record.work_date);
      if (existing < 0) attendance.push(record);
      else attendance[existing] = record;
      return { rows: [record], rowCount: 1 };
    }
    if (query.startsWith('SELECT a.id, a.worker_id') && query.includes('FROM worker_advances')) {
      const month = values[0];
      return {
        rows: advances.filter((advance) => advance.advance_date.startsWith(month)).map((advance) => ({
          ...advance,
          worker_name: workers.find((worker) => worker.id === advance.worker_id)?.name
        })),
        rowCount: advances.length
      };
    }
    if (query.startsWith('INSERT INTO worker_advances')) {
      if (!workers.some((worker) => worker.id === values[0])) return { rows: [], rowCount: 0 };
      const advance = {
        id: advances.length + 1,
        worker_id: values[0],
        advance_date: values[1],
        amount: values[2],
        note: values[3]
      };
      advances.push(advance);
      return { rows: [advance], rowCount: 1 };
    }
    if (query.startsWith('SELECT w.id AS worker_id')) {
      const month = values[0];
      return {
        rows: workers.filter((worker) => worker.active).map((worker) => {
          const workerAdvances = advances.filter((advance) => (
            advance.worker_id === worker.id && advance.advance_date.startsWith(month)
          ));
          const advancesTotal = workerAdvances.reduce((sum, advance) => sum + Number(advance.amount), 0);
          return {
            worker_id: worker.id,
            name: worker.name,
            phone: worker.phone,
            category_name: categoryById(worker.category_id)?.name,
            monthly_salary: worker.monthly_salary,
            advances_total: advancesTotal.toFixed(2),
            net_salary: (Number(worker.monthly_salary) - advancesTotal).toFixed(2)
          };
        }),
        rowCount: workers.filter((worker) => worker.active).length
      };
    }
    if (query.startsWith('INSERT INTO orders')) {
      return { rows: [{ id: order.id, created_at: order.created_at }], rowCount: 1 };
    }
    if (query.startsWith('INSERT INTO comments')) {
      return { rows: [], rowCount: 1 };
    }
    if (query.startsWith('SELECT id, name, body, created_at FROM comments')) {
      return { rows: [approvedComment], rowCount: 1 };
    }
    if (query.startsWith('SELECT id, gallery_id, name, body, created_at FROM comments')) {
      return { rows: [approvedComment], rowCount: 1 };
    }
    if (query.includes('AS orders_total')) {
      return {
        rows: [{ orders_total: 1, orders_new: 1, comments_pending: 0, comments_approved: 1 }],
        rowCount: 1
      };
    }
    if (query.startsWith('SELECT id, name, phone, message, status, created_at FROM orders')) {
      return { rows: [order], rowCount: 1 };
    }
    if (query.startsWith('SELECT id, gallery_id, name, body, status, created_at FROM comments')) {
      return { rows: [approvedComment], rowCount: 1 };
    }
    if (query.startsWith('UPDATE orders')) {
      return { rows: [{ id: Number(values[1]), status: values[0] }], rowCount: 1 };
    }
    if (query.startsWith('UPDATE comments')) {
      return { rows: [{ id: Number(values[1]), status: values[0] }], rowCount: 1 };
    }
    throw new Error(`Unexpected test database query: ${query}`);
  }
}

const sessions = new Map();
class TestSessionStore extends session.Store {
  get(id, callback) {
    callback(null, sessions.get(id) || null);
  }

  set(id, value, callback) {
    sessions.set(id, value);
    if (callback) callback(null);
  }

  destroy(id, callback) {
    sessions.delete(id);
    if (callback) callback(null);
  }

  touch(id, value, callback) {
    sessions.set(id, value);
    if (callback) callback(null);
  }
}

const originalLoad = Module._load;
Module._load = function loadWithTestServices(request, parent, isMain) {
  if (request === 'pg') return { Pool: TestPool };
  if (request === 'connect-pg-simple') return () => TestSessionStore;
  return originalLoad.call(this, request, parent, isMain);
};

const app = require('../server');
Module._load = originalLoad;

let server;
let baseUrl;
before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function request(path, options) {
  return fetch(new URL(path, baseUrl), options);
}

test('serves the website, admin dashboard, and assets', async () => {
  const vercelConfig = require('../vercel.json');
  assert.ok(vercelConfig.rewrites.some((rewrite) => (
    rewrite.source === '/admin' && rewrite.destination === '/admin.html'
  )));
  assert.equal(require('../api/[...path]'), app);

  const home = await request('/');
  assert.equal(home.status, 200);
  const homePage = await home.text();
  assert.match(homePage, /MS Woodworks/);

  for (const route of ['/admin', '/admin.html']) {
    const admin = await request(route);
    assert.equal(admin.status, 200);
    assert.match(await admin.text(), /إدارة MS Woodworks/);
  }

  assert.match(homePage, /id="adminLoginOpen"/);
  assert.match(homePage, /id="adminLoginForm"/);
  const homeScript = await request('/ms.js');
  assert.equal(homeScript.status, 200);
  const homeScriptText = await homeScript.text();
  assert.match(homeScriptText, /fetch\('\/api\/admin\/verify-entry'/);
  assert.match(homeScriptText, /window\.location\.assign\('\/admin'\)/);

  for (const asset of ['/ms.css', '/ms.js', '/admin.css', '/admin.js', '/gallery-assets.js']) {
    const response = await request(asset);
    assert.equal(response.status, 200, `${asset} should be served`);
  }
});

test('validates and stores public orders and comments', async () => {
  const invalidOrder = await request('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'A', phone: '1', message: 'x' })
  });
  assert.equal(invalidOrder.status, 400);

  const validOrder = await request('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'عميل تجريبي', phone: '+201000000000', message: order.message })
  });
  assert.equal(validOrder.status, 201);

  const validComment = await request('/api/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ galleryId: 'walnut-desk', name: 'عميل تجريبي', body: 'تعليق للاختبار' })
  });
  assert.equal(validComment.status, 201);

  const publicComments = await request('/api/comments/walnut-desk');
  assert.equal(publicComments.status, 200);
  assert.equal((await publicComments.json())[0].status, 'approved');

  const customerReviews = await request('/api/comments');
  assert.equal(customerReviews.status, 200);
  assert.equal((await customerReviews.json())[0].gallery_id, 'walnut-desk');
});

test('protects admin data and supports dashboard sign-in and updates', async () => {
  const unauthorized = await request('/api/admin/orders');
  assert.equal(unauthorized.status, 401);

  const invalidLogin = await request('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: 'incorrect-password' })
  });
  assert.equal(invalidLogin.status, 401);

  const invalidEntry = await request('/api/admin/verify-entry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: 'incorrect-password' })
  });
  assert.equal(invalidEntry.status, 401);

  const login = await request('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  assert.ok(cookie.includes('mswood.sid='));

  const verifyEntry = await request('/api/admin/verify-entry', {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })
  });
  assert.equal(verifyEntry.status, 200);
  assert.equal((await verifyEntry.json()).verified, true);
  assert.match(verifyEntry.headers.get('set-cookie'), /mswood\.sid=;/);
  const sessionAfterEntry = await request('/api/admin/session', { headers: { Cookie: cookie } });
  assert.equal((await sessionAfterEntry.json()).authenticated, false);

  const loginAfterEntry = await request('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })
  });
  assert.equal(loginAfterEntry.status, 200);
  const adminCookie = loginAfterEntry.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');

  const dashboard = await request('/api/admin/summary', { headers: { Cookie: adminCookie } });
  assert.equal(dashboard.status, 200);
  assert.equal((await dashboard.json()).orders_total, 1);

  const orders = await request('/api/admin/orders', { headers: { Cookie: adminCookie } });
  assert.equal(orders.status, 200);

  const updateOrder = await request('/api/admin/orders/1', {
    method: 'PATCH',
    headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'completed' })
  });
  assert.equal(updateOrder.status, 200);
  assert.equal((await updateOrder.json()).status, 'completed');

  const comments = await request('/api/admin/comments', { headers: { Cookie: adminCookie } });
  assert.equal(comments.status, 200);

  const updateComment = await request('/api/admin/comments/1', {
    method: 'PATCH',
    headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'rejected' })
  });
  assert.equal(updateComment.status, 200);
  assert.equal((await updateComment.json()).status, 'rejected');
});

test('manages worker categories, attendance, advances, and monthly payroll', async () => {
  const unauthorized = await request('/api/admin/hr/categories');
  assert.equal(unauthorized.status, 401);

  const login = await request('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  const headers = { Cookie: cookie, 'Content-Type': 'application/json' };

  const invalidCategory = await request('/api/admin/hr/categories', {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'ن' })
  });
  assert.equal(invalidCategory.status, 400);

  const createCategory = await request('/api/admin/hr/categories', {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'نجارة' })
  });
  assert.equal(createCategory.status, 201);
  const category = await createCategory.json();
  assert.equal(category.name, 'نجارة');

  const updateCategory = await request(`/api/admin/hr/categories/${category.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ name: 'أعمال خشبية' })
  });
  assert.equal(updateCategory.status, 200);
  assert.equal((await updateCategory.json()).name, 'أعمال خشبية');

  const duplicateCategory = await request('/api/admin/hr/categories', {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'أعمال خشبية' })
  });
  assert.equal(duplicateCategory.status, 409);

  const createWorker = await request('/api/admin/hr/workers', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'عامل تجريبي',
      phone: '+201000000000',
      categoryId: category.id,
      monthlySalary: '2500'
    })
  });
  assert.equal(createWorker.status, 201);
  const worker = await createWorker.json();

  const protectedCategoryDelete = await request(`/api/admin/hr/categories/${category.id}`, {
    method: 'DELETE',
    headers
  });
  assert.equal(protectedCategoryDelete.status, 409);

  const invalidAttendance = await request('/api/admin/hr/attendance', {
    method: 'PUT',
    headers,
    body: JSON.stringify({ workerId: worker.id, date: '2026-10-12', status: 'present' })
  });
  assert.equal(invalidAttendance.status, 400);

  const checkIn = await request('/api/admin/hr/attendance', {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      workerId: worker.id,
      date: '2026-10-12',
      status: 'present',
      checkIn: '08:00',
      note: ''
    })
  });
  assert.equal(checkIn.status, 200);

  const checkOut = await request('/api/admin/hr/attendance', {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      workerId: worker.id,
      date: '2026-10-12',
      status: 'present',
      checkIn: '08:00',
      checkOut: '16:00',
      note: ''
    })
  });
  assert.equal(checkOut.status, 200);
  assert.equal((await checkOut.json()).check_out, '16:00');

  const invalidAdvance = await request('/api/admin/hr/advances', {
    method: 'POST',
    headers,
    body: JSON.stringify({ workerId: worker.id, date: '2026-10-13', amount: 0 })
  });
  assert.equal(invalidAdvance.status, 400);

  const createAdvance = await request('/api/admin/hr/advances', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      workerId: worker.id,
      date: '2026-10-13',
      amount: '300',
      note: 'سلفة تجريبية'
    })
  });
  assert.equal(createAdvance.status, 201);

  const payroll = await request('/api/admin/hr/payroll?month=2026-10', { headers });
  assert.equal(payroll.status, 200);
  const [payrollRecord] = await payroll.json();
  assert.equal(Number(payrollRecord.monthly_salary), 2500);
  assert.equal(Number(payrollRecord.advances_total), 300);
  assert.equal(Number(payrollRecord.net_salary), 2200);

  const archiveWorker = await request(`/api/admin/hr/workers/${worker.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      name: worker.name,
      phone: worker.phone,
      categoryId: worker.category_id,
      monthlySalary: worker.monthly_salary,
      active: false
    })
  });
  assert.equal(archiveWorker.status, 200);
  assert.equal((await archiveWorker.json()).active, false);

  const archivedPayroll = await request('/api/admin/hr/payroll?month=2026-10', { headers });
  assert.deepEqual(await archivedPayroll.json(), []);
  const attendanceHistory = await request('/api/admin/hr/attendance?date=2026-10-12', { headers });
  assert.equal((await attendanceHistory.json())[0].check_out, '16:00');

  const createUnusedCategory = await request('/api/admin/hr/categories', {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'دهانات' })
  });
  assert.equal(createUnusedCategory.status, 201);
  const unusedCategory = await createUnusedCategory.json();
  const deleteUnusedCategory = await request(`/api/admin/hr/categories/${unusedCategory.id}`, {
    method: 'DELETE',
    headers
  });
  assert.equal(deleteUnusedCategory.status, 204);
});
