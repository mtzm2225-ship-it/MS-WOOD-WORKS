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

class TestPool {
  async query(sql, values = []) {
    // Return predictable rows for the SQL statements used by the API.
    const query = sql.replace(/\s+/g, ' ').trim();
    if (query.startsWith('CREATE TABLE') || query.startsWith('CREATE INDEX')) {
      return { rows: [], rowCount: 0 };
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
  assert.match(await home.text(), /MS Woodworks/);

  for (const route of ['/admin', '/admin.html']) {
    const admin = await request(route);
    assert.equal(admin.status, 200);
    assert.match(await admin.text(), /إدارة MS Woodworks/);
  }

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

  const login = await request('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  assert.ok(cookie.includes('mswood.sid='));

  const dashboard = await request('/api/admin/summary', { headers: { Cookie: cookie } });
  assert.equal(dashboard.status, 200);
  assert.equal((await dashboard.json()).orders_total, 1);

  const orders = await request('/api/admin/orders', { headers: { Cookie: cookie } });
  assert.equal(orders.status, 200);

  const updateOrder = await request('/api/admin/orders/1', {
    method: 'PATCH',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'completed' })
  });
  assert.equal(updateOrder.status, 200);
  assert.equal((await updateOrder.json()).status, 'completed');

  const comments = await request('/api/admin/comments', { headers: { Cookie: cookie } });
  assert.equal(comments.status, 200);

  const updateComment = await request('/api/admin/comments/1', {
    method: 'PATCH',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'rejected' })
  });
  assert.equal(updateComment.status, 200);
  assert.equal((await updateComment.json()).status, 'rejected');
});
