const assert = require('node:assert/strict');
const Module = require('node:module');
const { after, before, test } = require('node:test');
const session = require('express-session');

// Provide disposable credentials and a fake database so tests never need production secrets or data.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgres://test:test@127.0.0.1:5432/mswood_test';
process.env.ADMIN_EMAIL = 'admin@example.test';
process.env.ADMIN_PASSWORD = 'test-only-password-long-enough';
process.env.OWNER_USERNAME = 'owner@example.test';
process.env.OWNER_PASSWORD = 'test-only-owner-password-long-enough';
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
const customers = [];
const storedOrders = [{ ...order, customer_id: null }];
const workCategories = [];
const workers = [];
const attendance = [];
const advances = [];
const custodies = [];
const custodyMovements = [];
const expenses = [];
const projects = [];
const workReceipts = [];

function categoryById(id) {
  return workCategories.find((category) => String(category.id) === String(id));
}

class TestPool {
  async query(sql, values = []) {
    // Return predictable rows for the SQL statements used by the API.
    const query = sql.replace(/\s+/g, ' ').trim();
    if (query.includes('CREATE TABLE IF NOT EXISTS customers')) {
      return { rows: [], rowCount: 0 };
    }
    if (query.startsWith('WITH new_custody AS')) {
      if (custodies.some((custody) => custody.holder_name === values[0])) {
        throw Object.assign(new Error('duplicate custody holder'), { code: '23505' });
      }
      const custody = {
        id: custodies.length + 1,
        holder_name: values[0],
        balance: Number(values[1]).toFixed(2),
        active: true
      };
      custodies.push(custody);
      const movement = {
        id: custodyMovements.length + 1,
        custody_id: custody.id,
        movement_type: 'issued',
        movement_date: values[2],
        amount: Number(values[1]).toFixed(2),
        note: values[3]
      };
      custodyMovements.push(movement);
      return { rows: [movement], rowCount: 1 };
    }
    if (query.startsWith('SELECT COUNT(*)::int AS receipt_count')) {
      const matching = workReceipts.filter((receipt) => receipt.receipt_date >= values[0] && receipt.receipt_date <= values[1]);
      const totalFor = (type) => matching.filter((receipt) => receipt.receipt_type === type)
        .reduce((sum, receipt) => sum + Number(receipt.amount), 0);
      return {
        rows: [{
          receipt_count: matching.length,
          total: matching.reduce((sum, receipt) => sum + Number(receipt.amount), 0).toFixed(2),
          project_total: totalFor('project').toFixed(2),
          order_total: totalFor('order').toFixed(2),
          general_total: totalFor('general').toFixed(2)
        }],
        rowCount: 1
      };
    }
    if (query.startsWith('SELECT p.id, p.order_id')) {
      const rows = projects.filter((project) => project.active).map((project) => {
        const linkedOrder = storedOrders.find((orderRecord) => orderRecord.id === project.order_id);
        const projectReceipts = workReceipts.filter((receipt) => (
          receipt.project_id === project.id || receipt.order_id === project.order_id
        ));
        const paidTotal = projectReceipts.reduce((sum, receipt) => sum + Number(receipt.amount), 0);
        return {
          id: project.id,
          order_id: project.order_id,
          name: project.name,
          customer_name: linkedOrder?.name,
          phone: linkedOrder?.phone,
          agreed_amount: project.agreed_amount,
          paid_total: paidTotal.toFixed(2),
          remaining_amount: (Number(project.agreed_amount) - paidTotal).toFixed(2),
          created_at: project.created_at
        };
      });
      return { rows, rowCount: rows.length };
    }
    if (query.startsWith('SELECT o.id, COUNT(*) OVER()::int AS result_total')) {
      const rows = storedOrders.filter((orderRecord) => (
        !projects.some((project) => project.active && project.order_id === orderRecord.id)
      )).map((orderRecord) => ({
        id: orderRecord.id,
        name: orderRecord.name,
        phone: orderRecord.phone,
        created_at: orderRecord.created_at
      }));
      return {
        rows: rows.map((record) => ({ ...record, result_total: rows.length })),
        rowCount: rows.length
      };
    }
    if (query.startsWith('SELECT r.id, COUNT(*) OVER()::int AS result_total')) {
      const rows = workReceipts
        .filter((receipt) => receipt.receipt_date >= values[0] && receipt.receipt_date <= values[1])
        .reverse()
        .map((receipt) => {
          const project = projects.find((item) => item.id === receipt.project_id);
          const linkedOrder = receipt.order_id
            ? storedOrders.find((item) => item.id === receipt.order_id)
            : storedOrders.find((item) => item.id === project?.order_id);
          return {
            ...receipt,
            result_total: workReceipts.filter((item) => item.receipt_date >= values[0] && item.receipt_date <= values[1]).length,
            project_name: project?.name || null,
            customer_name: linkedOrder?.name || null
          };
        });
      return { rows, rowCount: rows.length };
    }
    if (query.startsWith('INSERT INTO work_projects')) {
      if (projects.some((project) => project.order_id === Number(values[0]))) {
        throw Object.assign(new Error('duplicate project order'), { code: '23505' });
      }
      const project = {
        id: projects.length + 1,
        order_id: Number(values[0]),
        name: values[1],
        agreed_amount: Number(values[2]).toFixed(2),
        active: true,
        created_at: '2026-10-13T00:00:00.000Z'
      };
      if (!storedOrders.some((orderRecord) => orderRecord.id === project.order_id)) {
        return { rows: [], rowCount: 0 };
      }
      projects.push(project);
      return { rows: [project], rowCount: 1 };
    }
    if (query.startsWith('UPDATE work_projects')) {
      const project = projects.find((item) => String(item.id) === String(values[2]) && item.active);
      if (project) {
        project.name = values[0];
        project.agreed_amount = Number(values[1]).toFixed(2);
      }
      return { rows: project ? [project] : [], rowCount: Number(Boolean(project)) };
    }
    if (query.startsWith('INSERT INTO work_receipts')) {
      const type = values[1];
      const projectId = type === 'project' ? Number(values[2]) : null;
      const orderId = type === 'order' ? Number(values[3]) : null;
      if (type === 'project' && !projects.some((project) => project.id === projectId && project.active)) {
        return { rows: [], rowCount: 0 };
      }
      if (type === 'order' && !storedOrders.some((orderRecord) => orderRecord.id === orderId)) {
        return { rows: [], rowCount: 0 };
      }
      const receipt = {
        id: workReceipts.length + 1,
        receipt_date: values[0],
        receipt_type: type,
        project_id: projectId,
        order_id: orderId,
        amount: Number(values[4]).toFixed(2),
        description: values[5],
        paid_by: values[6],
        payment_method: values[7],
        reference: values[8],
        note: values[9]
      };
      workReceipts.push(receipt);
      return { rows: [receipt], rowCount: 1 };
    }
    if (query.startsWith('WITH updated AS')) {
      const custody = custodies.find((item) => String(item.id) === String(values[0]) && item.active);
      const signedAmount = Number(values[1]);
      if (!custody || Number(custody.balance) + signedAmount < 0) return { rows: [], rowCount: 0 };
      custody.balance = (Number(custody.balance) + signedAmount).toFixed(2);
      const movement = {
        id: custodyMovements.length + 1,
        custody_id: custody.id,
        movement_type: values[4],
        movement_date: values[2],
        amount: Number(values[3]).toFixed(2),
        note: values[5],
        balance: custody.balance
      };
      custodyMovements.push(movement);
      return { rows: [movement], rowCount: 1 };
    }
    if (query.startsWith('SELECT balance FROM cash_custodies')) {
      const custody = custodies.find((item) => String(item.id) === String(values[0]) && item.active);
      return { rows: custody ? [{ balance: custody.balance }] : [], rowCount: Number(Boolean(custody)) };
    }
    if (query.startsWith('SELECT id, holder_name, balance')) {
      const records = custodies.filter((custody) => custody.active);
      return { rows: records, rowCount: records.length };
    }
    if (query.startsWith('SELECT COUNT(*)::int AS expense_count')) {
      const matching = expenses.filter((expense) => expense.expense_date >= values[0] && expense.expense_date <= values[1]);
      const total = matching.reduce((sum, expense) => sum + Number(expense.amount), 0);
      const custodyTotal = matching.filter((expense) => expense.source === 'custody')
        .reduce((sum, expense) => sum + Number(expense.amount), 0);
      return {
        rows: [{
          expense_count: matching.length,
          total: total.toFixed(2),
          custody_total: custodyTotal.toFixed(2),
          direct_total: (total - custodyTotal).toFixed(2)
        }],
        rowCount: 1
      };
    }
    if (query.startsWith('SELECT category, COUNT(*)::int AS expense_count')) {
      const matching = expenses.filter((expense) => expense.expense_date >= values[0] && expense.expense_date <= values[1]);
      const groups = new Map();
      matching.forEach((expense) => {
        const group = groups.get(expense.category) || { category: expense.category, expense_count: 0, total: 0 };
        group.expense_count += 1;
        group.total += Number(expense.amount);
        groups.set(expense.category, group);
      });
      const rows = Array.from(groups.values())
        .map((group) => ({ ...group, total: group.total.toFixed(2) }))
        .sort((first, second) => Number(second.total) - Number(first.total));
      return { rows, rowCount: rows.length };
    }
    if (query.startsWith('SELECT e.id, COUNT(*) OVER()::int AS result_total, e.expense_date')) {
      const rows = expenses.filter((expense) => expense.expense_date >= values[0] && expense.expense_date <= values[1])
        .map((expense) => ({
          ...expense,
          holder_name: custodies.find((custody) => String(custody.id) === String(expense.custody_id))?.holder_name || null
        }))
        .reverse();
      return { rows, rowCount: rows.length };
    }
    if (query.startsWith('SELECT m.id, COUNT(*) OVER()::int AS result_total, m.custody_id')) {
      const rows = custodyMovements.filter((movement) => movement.movement_date >= values[0] && movement.movement_date <= values[1])
        .map((movement) => ({
          ...movement,
          holder_name: custodies.find((custody) => custody.id === movement.custody_id)?.holder_name
        }))
        .reverse();
      return { rows, rowCount: rows.length };
    }
    if (query.startsWith('WITH debited AS') || query.startsWith('INSERT INTO expenses')) {
      const custodyExpense = query.includes('SELECT $1, $2, id');
      const custodyId = custodyExpense ? Number(values[2]) : null;
      const custody = custodyId && custodies.find((item) => item.id === custodyId && item.active);
      if (custodyExpense && (!custody || Number(custody.balance) < Number(values[3]))) {
        return { rows: [], rowCount: 0 };
      }
      if (custodyExpense) custody.balance = (Number(custody.balance) - Number(values[3])).toFixed(2);
      const expense = {
        id: expenses.length + 1,
        expense_date: values[0],
        source: values[1],
        custody_id: custodyId,
        amount: Number(values[3]).toFixed(2),
        category: values[4],
        description: values[5],
        paid_to: values[6],
        payment_method: values[7],
        reference: values[8],
        note: values[9]
      };
      expenses.push(expense);
      return { rows: [expense], rowCount: 1 };
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
    if (query.startsWith('INSERT INTO customers')) {
      if (customers.some((customer) => customer.email === values[1])) {
        throw Object.assign(new Error('duplicate customer email'), { code: '23505' });
      }
      const customer = {
        id: customers.length + 1,
        name: values[0],
        email: values[1],
        phone: values[2],
        password_hash: values[3],
        created_at: '2026-10-12T00:00:00.000Z'
      };
      customers.push(customer);
      return {
        rows: [{ id: customer.id, name: customer.name, email: customer.email, phone: customer.phone }],
        rowCount: 1
      };
    }
    if (query.startsWith('SELECT id, name, email, phone, password_hash FROM customers')) {
      const customer = customers.find((item) => item.email === values[0]);
      return { rows: customer ? [customer] : [], rowCount: Number(Boolean(customer)) };
    }
    if (query.startsWith('SELECT id, name, email, phone, created_at FROM customers')) {
      return {
        rows: customers.map(({ id, name, email, phone, created_at }) => ({
          id, name, email, phone, created_at
        })).reverse(),
        rowCount: customers.length
      };
    }
    if (query.startsWith('SELECT id, name, phone, message, status, created_at FROM orders WHERE customer_id')) {
      const customerOrders = storedOrders
        .filter((record) => String(record.customer_id) === String(values[0]))
        .sort((first, second) => second.id - first.id);
      return { rows: customerOrders, rowCount: customerOrders.length };
    }
    if (query.startsWith('INSERT INTO orders')) {
      const createdOrder = {
        id: storedOrders.length + 1,
        name: values[0],
        phone: values[1],
        message: values[2],
        customer_id: values[3] || null,
        status: 'new',
        created_at: '2026-10-13T00:00:00.000Z'
      };
      storedOrders.push(createdOrder);
      return { rows: [{ id: createdOrder.id, created_at: createdOrder.created_at }], rowCount: 1 };
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
      return { rows: storedOrders, rowCount: storedOrders.length };
    }
    if (query.startsWith('SELECT id, gallery_id, name, body, status, created_at FROM comments')) {
      return { rows: [approvedComment], rowCount: 1 };
    }
    if (query.startsWith('UPDATE orders')) {
      const target = storedOrders.find((record) => record.id === Number(values[1]));
      if (target) target.status = values[0];
      return { rows: target ? [{ id: target.id, status: target.status }] : [], rowCount: Number(Boolean(target)) };
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
  if (request === 'pg') {
    return {
      Pool: TestPool,
      types: { builtins: { DATE: 1082 }, setTypeParser() {} }
    };
  }
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

  const home = await request('/');
  assert.equal(home.status, 200);
  const homePage = await home.text();
  assert.match(homePage, /MS Woodworks/);
  assert.match(homePage, /rel="canonical"/);
  assert.doesNotMatch(homePage, /src=""/);

  for (const route of ['/admin', '/admin.html']) {
    const admin = await request(route);
    assert.equal(admin.status, 200);
    const adminPage = await admin.text();
    assert.match(adminPage, /إدارة MS Woodworks/);
    assert.match(adminPage, /data-view="customersView"/);
    assert.match(adminPage, /كلمات المرور لا تُعرض/);
    assert.match(adminPage, /data-view="ownerMoneyView"/);
    assert.match(adminPage, /data-owner-money-view="expensesView"/);
    assert.match(adminPage, /data-owner-money-view="collectionsView"/);
    assert.match(adminPage, /id="projectCancel"/);
  }

  assert.match(homePage, /id="customerAccountOpen"/);
  assert.match(homePage, /id="customerLoginForm"/);
  assert.match(homePage, /id="customerRegisterForm"/);
  assert.match(homePage, /id="customerAccountView"/);
  const homeScript = await request('/ms.js');
  assert.equal(homeScript.status, 200);
  const homeScriptText = await homeScript.text();
  assert.match(homeScriptText, /endpoint: '\/api\/customer\/login'/);
  assert.match(homeScriptText, /endpoint: '\/api\/customer\/register'/);
  assert.match(homeScriptText, /fetch\('\/api\/customer\/orders'/);
  const adminScript = await request('/admin.js');
  assert.equal(adminScript.status, 200);
  assert.match(await adminScript.text(), /api\/admin\/customers/);

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

  const unknownComment = await request('/api/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ galleryId: 'studio-desk', name: 'عميل تجريبي', body: 'تعليق لصورة غير موجودة' })
  });
  assert.equal(unknownComment.status, 400);

  const publicComments = await request('/api/comments/walnut-desk');
  assert.equal(publicComments.status, 200);
  assert.equal((await publicComments.json())[0].status, 'approved');

  const customerReviews = await request('/api/comments');
  assert.equal(customerReviews.status, 200);
  assert.equal((await customerReviews.json())[0].gallery_id, 'walnut-desk');
});

test('registers customers and restricts order history to the signed-in account', async () => {
  const unauthorized = await request('/api/customer/orders');
  assert.equal(unauthorized.status, 401);

  const invalidRegistration = await request('/api/customer/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'عميل جديد',
      email: 'new@example.test',
      phone: '+201000000000',
      password: 'short'
    })
  });
  assert.equal(invalidRegistration.status, 400);

  const registration = await request('/api/customer/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'عميل جديد',
      email: 'New.Customer@example.test',
      phone: '+201000000000',
      password: 'customer-password-long'
    })
  });
  assert.equal(registration.status, 201);
  const registrationResult = await registration.json();
  assert.equal(registrationResult.customer.email, 'new.customer@example.test');
  assert.notEqual(customers[0].password_hash, 'customer-password-long');
  const customerCookie = registration.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');

  const sessionResponse = await request('/api/customer/session', { headers: { Cookie: customerCookie } });
  assert.equal((await sessionResponse.json()).authenticated, true);
  const customerAdminData = await request('/api/admin/summary', { headers: { Cookie: customerCookie } });
  assert.equal(customerAdminData.status, 401);
  const customerMoneyData = await request('/api/admin/expenses?from=2026-10-01&to=2026-10-31', {
    headers: { Cookie: customerCookie }
  });
  assert.equal(customerMoneyData.status, 403);

  const customerOrder = await request('/api/orders', {
    method: 'POST',
    headers: { Cookie: customerCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'عميل جديد',
      phone: '+201000000000',
      message: 'طلب أثاث مرتبط بحساب العميل'
    })
  });
  assert.equal(customerOrder.status, 201);

  const accountOrders = await request('/api/customer/orders', { headers: { Cookie: customerCookie } });
  assert.equal(accountOrders.status, 200);
  assert.equal(accountOrders.headers.get('cache-control'), 'no-store');
  const customerRecords = await accountOrders.json();
  assert.equal(customerRecords.length, 1);
  assert.equal(customerRecords[0].message, 'طلب أثاث مرتبط بحساب العميل');

  const otherRegistration = await request('/api/customer/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'عميل آخر',
      email: 'other.customer@example.test',
      phone: '+201000000001',
      password: 'another-customer-password'
    })
  });
  assert.equal(otherRegistration.status, 201);
  const otherCookie = otherRegistration.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  const otherOrders = await request('/api/customer/orders', { headers: { Cookie: otherCookie } });
  assert.deepEqual(await otherOrders.json(), []);

  const duplicateRegistration = await request('/api/customer/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'عميل جديد',
      email: 'new.customer@example.test',
      phone: '+201000000000',
      password: 'customer-password-long'
    })
  });
  assert.equal(duplicateRegistration.status, 409);

  const login = await request('/api/customer/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'NEW.CUSTOMER@example.test', password: 'customer-password-long' })
  });
  assert.equal(login.status, 200);
  const loginCookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  const afterLoginOrders = await request('/api/customer/orders', { headers: { Cookie: loginCookie } });
  assert.equal((await afterLoginOrders.json()).length, 1);

  const wrongPassword = await request('/api/customer/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'new.customer@example.test', password: 'wrong-password' })
  });
  assert.equal(wrongPassword.status, 401);

  const logout = await request('/api/customer/logout', {
    method: 'POST',
    headers: { Cookie: loginCookie }
  });
  assert.equal(logout.status, 204);
  const afterLogout = await request('/api/customer/orders', { headers: { Cookie: loginCookie } });
  assert.equal(afterLogout.status, 401);
});

test('protects admin data and supports dashboard sign-in and updates', async () => {
  const unauthorized = await request('/api/admin/orders');
  assert.equal(unauthorized.status, 401);
  const unauthorizedCustomers = await request('/api/admin/customers');
  assert.equal(unauthorizedCustomers.status, 401);

  const invalidLogin = await request('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: 'incorrect-password' })
  });
  assert.equal(invalidLogin.status, 401);

  const login = await request('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })
  });
  assert.equal(login.status, 200);
  const adminCookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  assert.ok(adminCookie.includes('mswood.sid='));
  const adminCustomerHistory = await request('/api/customer/orders', { headers: { Cookie: adminCookie } });
  assert.equal(adminCustomerHistory.status, 401);

  const dashboard = await request('/api/admin/summary', { headers: { Cookie: adminCookie } });
  assert.equal(dashboard.status, 200);
  assert.equal((await dashboard.json()).orders_total, 1);

  const customerList = await request('/api/admin/customers', { headers: { Cookie: adminCookie } });
  assert.equal(customerList.status, 200);
  assert.equal(customerList.headers.get('cache-control'), 'no-store');
  const listedCustomers = await customerList.json();
  assert.ok(listedCustomers.length >= 2);
  assert.equal(listedCustomers[0].email, 'other.customer@example.test');
  assert.equal(Object.hasOwn(listedCustomers[0], 'password_hash'), false);

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

  const invalidStatusFilter = await request('/api/admin/orders?status=unknown', {
    headers: { Cookie: adminCookie }
  });
  assert.equal(invalidStatusFilter.status, 400);

  const invalidOrderId = await request('/api/admin/orders/not-a-number', {
    method: 'PATCH',
    headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'new' })
  });
  assert.equal(invalidOrderId.status, 400);

  assert.equal(dashboard.headers.get('cache-control'), 'no-store');
});

test('returns JSON errors for unknown API routes and malformed payloads', async () => {
  const missing = await request('/api/does-not-exist');
  assert.equal(missing.status, 404);
  assert.match(missing.headers.get('content-type'), /application\/json/);

  const malformed = await request('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"name": '
  });
  assert.equal(malformed.status, 400);
});

test('manages worker categories, attendance, advances, and monthly payroll', async () => {
  const unauthorized = await request('/api/admin/hr/categories');
  assert.equal(unauthorized.status, 403);

  const login = await request('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })
  });
  assert.equal(login.status, 200);
  let cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  let headers = { Cookie: cookie, 'Content-Type': 'application/json' };
  const adminCanReadHrBeforeOwnerLogin = await request('/api/admin/hr/categories', { headers });
  assert.equal(adminCanReadHrBeforeOwnerLogin.status, 403);
  const adminFinanceRequests = [
    request('/api/admin/custodies', { headers }),
    request('/api/admin/custodies', { method: 'POST', headers, body: JSON.stringify({}) }),
    request('/api/admin/custodies/1/movements', { method: 'POST', headers, body: JSON.stringify({}) }),
    request('/api/admin/expenses?from=2026-10-01&to=2026-10-31', { headers }),
    request('/api/admin/expenses', { method: 'POST', headers, body: JSON.stringify({}) }),
    request('/api/admin/collections?from=2026-10-01&to=2026-10-31', { headers }),
    request('/api/admin/projects', { method: 'POST', headers, body: JSON.stringify({}) }),
    request('/api/admin/projects/1', { method: 'PATCH', headers, body: JSON.stringify({}) }),
    request('/api/admin/collections', { method: 'POST', headers, body: JSON.stringify({}) })
  ];
  const adminFinanceResponses = await Promise.all(adminFinanceRequests);
  assert.ok(adminFinanceResponses.every((response) => response.status === 403));

  const ownerLogin = await request('/api/owner/login', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      username: process.env.OWNER_USERNAME,
      password: process.env.OWNER_PASSWORD
    })
  });
  assert.equal(ownerLogin.status, 200);
  cookie = ownerLogin.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  headers = { Cookie: cookie, 'Content-Type': 'application/json' };
  assert.equal((await (await request('/api/admin/session', { headers })).json()).authenticated, true);
  assert.equal((await (await request('/api/owner/session', { headers })).json()).authenticated, true);

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

  const logout = await request('/api/admin/logout', { method: 'POST', headers });
  assert.equal(logout.status, 204);
  const adminSessionAfterLogout = await request('/api/admin/session', { headers });
  const ownerSessionAfterLogout = await request('/api/owner/session', { headers });
  assert.equal((await adminSessionAfterLogout.json()).authenticated, false);
  assert.equal((await ownerSessionAfterLogout.json()).authenticated, false);

  const ownerFirstLogin = await request('/api/owner/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: process.env.OWNER_USERNAME,
      password: process.env.OWNER_PASSWORD
    })
  });
  assert.equal(ownerFirstLogin.status, 200);
  const ownerCookie = ownerFirstLogin.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  const adminAfterOwnerLogin = await request('/api/admin/login', {
    method: 'POST',
    headers: { Cookie: ownerCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })
  });
  assert.equal(adminAfterOwnerLogin.status, 200);
  const combinedCookie = adminAfterOwnerLogin.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  const combinedHeaders = { Cookie: combinedCookie };
  assert.equal((await (await request('/api/admin/session', { headers: combinedHeaders })).json()).authenticated, true);
  assert.equal((await (await request('/api/owner/session', { headers: combinedHeaders })).json()).authenticated, true);
  assert.equal((await request('/api/admin/logout', { method: 'POST', headers: combinedHeaders })).status, 204);

  const ownerOnlyLogin = await request('/api/owner/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: process.env.OWNER_USERNAME,
      password: process.env.OWNER_PASSWORD
    })
  });
  assert.equal(ownerOnlyLogin.status, 200);
  const ownerOnlyCookie = ownerOnlyLogin.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  const ownerOnlyHeaders = { Cookie: ownerOnlyCookie };
  const ownerOnlyFinance = await request('/api/admin/expenses?from=2026-10-01&to=2026-10-31', {
    headers: ownerOnlyHeaders
  });
  assert.equal(ownerOnlyFinance.status, 200);
  const ownerOnlyAdminSummary = await request('/api/admin/summary', { headers: ownerOnlyHeaders });
  assert.equal(ownerOnlyAdminSummary.status, 401);
  assert.equal((await request('/api/admin/logout', {
    method: 'POST',
    headers: ownerOnlyHeaders
  })).status, 204);
});

test('tracks custody balances and separates custody from direct expenses', async () => {
  const unauthorized = await request('/api/admin/expenses?from=2026-10-01&to=2026-10-31');
  assert.equal(unauthorized.status, 403);

  const ownerLogin = await request('/api/owner/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: process.env.OWNER_USERNAME, password: process.env.OWNER_PASSWORD })
  });
  assert.equal(ownerLogin.status, 200);
  const cookie = ownerLogin.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  const headers = { Cookie: cookie, 'Content-Type': 'application/json' };

  const invalidRange = await request('/api/admin/expenses?from=2026-10-31&to=2026-10-01', { headers });
  assert.equal(invalidRange.status, 400);

  const invalidCustody = await request('/api/admin/custodies', {
    method: 'POST',
    headers,
    body: JSON.stringify({ holderName: 'ع', amount: -50, date: '2026-10-12' })
  });
  assert.equal(invalidCustody.status, 400);
  const fractionalCustody = await request('/api/admin/custodies', {
    method: 'POST',
    headers,
    body: JSON.stringify({ holderName: 'مسؤول تجريبي', amount: '10.125', date: '2026-10-12' })
  });
  assert.equal(fractionalCustody.status, 400);

  const createCustody = await request('/api/admin/custodies', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      holderName: 'مسؤول العُهدة',
      amount: '1000',
      date: '2026-10-12',
      note: 'عُهدة بداية العمل'
    })
  });
  assert.equal(createCustody.status, 201);
  const issue = await createCustody.json();
  assert.equal(issue.movement_type, 'issued');

  const fractionalExpense = await request('/api/admin/expenses', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      date: '2026-10-13',
      source: 'direct',
      amount: '12.345',
      category: 'خامات',
      description: 'مبلغ بدقة غير مدعومة',
      paymentMethod: 'cash'
    })
  });
  assert.equal(fractionalExpense.status, 400);

  const duplicateCustody = await request('/api/admin/custodies', {
    method: 'POST',
    headers,
    body: JSON.stringify({ holderName: 'مسؤول العُهدة', amount: '1', date: '2026-10-12' })
  });
  assert.equal(duplicateCustody.status, 409);

  const addFunds = await request(`/api/admin/custodies/${issue.custody_id}/movements`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ type: 'issued', amount: '200', date: '2026-10-13', note: 'زيادة العُهدة' })
  });
  assert.equal(addFunds.status, 201);
  assert.equal(Number((await addFunds.json()).balance), 1200);

  const returnFunds = await request(`/api/admin/custodies/${issue.custody_id}/movements`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ type: 'returned', amount: '100', date: '2026-10-13', note: 'رد الباقي' })
  });
  assert.equal(returnFunds.status, 201);
  assert.equal(Number((await returnFunds.json()).balance), 1100);

  const excessiveReturn = await request(`/api/admin/custodies/${issue.custody_id}/movements`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ type: 'returned', amount: '5000', date: '2026-10-13' })
  });
  assert.equal(excessiveReturn.status, 409);

  const createCustodyExpense = await request('/api/admin/expenses', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      date: '2026-10-13',
      source: 'custody',
      custodyId: issue.custody_id,
      amount: '250',
      category: 'مستلزمات الورشة',
      description: 'شراء مسامير وخامات',
      paidTo: 'مورد الخامات',
      paymentMethod: 'cash',
      reference: 'فاتورة-١٠',
      note: 'تم إرفاق الفاتورة'
    })
  });
  assert.equal(createCustodyExpense.status, 201);
  assert.equal((await createCustodyExpense.json()).source, 'custody');

  const overspend = await request('/api/admin/expenses', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      date: '2026-10-13',
      source: 'custody',
      custodyId: issue.custody_id,
      amount: '900',
      category: 'خامات',
      description: 'مصروف يتجاوز الرصيد',
      paymentMethod: 'cash'
    })
  });
  assert.equal(overspend.status, 409);

  const directExpense = await request('/api/admin/expenses', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      date: '2026-10-14',
      source: 'direct',
      amount: '300',
      category: 'نقل',
      description: 'نقل الأخشاب إلى الورشة',
      paidTo: 'شركة نقل',
      paymentMethod: 'transfer',
      reference: 'تحويل-٢١'
    })
  });
  assert.equal(directExpense.status, 201);
  assert.equal((await directExpense.json()).custody_id, null);

  const report = await request('/api/admin/expenses?from=2026-10-01&to=2026-10-31', { headers });
  assert.equal(report.status, 200);
  assert.equal(report.headers.get('cache-control'), 'no-store');
  const data = await report.json();
  assert.equal(Number(data.summary.expense_count), 2);
  assert.equal(Number(data.summary.total), 550);
  assert.equal(Number(data.summary.custody_total), 250);
  assert.equal(Number(data.summary.direct_total), 300);
  assert.equal(data.categories.length, 2);
  assert.equal(data.expenses.length, 2);
  assert.equal(data.movements.length, 3);
  assert.equal(data.custodies.length, 1);
  assert.equal(Number(data.custodies[0].balance), 850);
});
