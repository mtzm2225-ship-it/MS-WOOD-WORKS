require('dotenv').config();

const path = require('node:path');
const express = require('express');
const session = require('express-session');
const connectPgSimple = require('connect-pg-simple');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');

const app = express();
const publicDir = path.join(__dirname, 'public');
const isProduction = process.env.NODE_ENV === 'production';
// بيانات الإدارة ومفتاح الجلسة تُحفظ في إعدادات الاستضافة السرية، وليس في ملفات المتصفح.
const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD || '';
const sessionSecret = process.env.SESSION_SECRET || '';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
if (!adminEmail || adminPassword.length < 14) {
  throw new Error('Set ADMIN_EMAIL and a unique ADMIN_PASSWORD of at least 14 characters.');
}
if (sessionSecret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters.');

// ينهي Vercel اتصال HTTPS عند الوكيل؛ نثق به حتى تعمل ملفات الجلسة الآمنة.
if (isProduction) app.set('trust proxy', 1);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: true } : undefined
});
const PostgreSQLStore = connectPgSimple(session);
const adminPasswordHash = bcrypt.hashSync(adminPassword, 12);
let schemaPromise;

function ensureDatabaseSchema() {
  // نشارك تهيئة قاعدة البيانات بين الطلبات المتزامنة ونعيد المحاولة إذا فشلت.
  if (!schemaPromise) {
    schemaPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id BIGSERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(40) NOT NULL,
        message VARCHAR(3000) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'new'
          CHECK (status IN ('new', 'contacted', 'in-progress', 'completed', 'cancelled')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS comments (
        id BIGSERIAL PRIMARY KEY,
        gallery_id VARCHAR(80) NOT NULL,
        name VARCHAR(80) NOT NULL,
        body VARCHAR(800) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'approved', 'rejected')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS work_categories (
        id BIGSERIAL PRIMARY KEY,
        name VARCHAR(80) NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS workers (
        id BIGSERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(40) NOT NULL,
        category_id BIGINT NOT NULL REFERENCES work_categories (id) ON DELETE RESTRICT,
        monthly_salary NUMERIC(12, 2) NOT NULL CHECK (monthly_salary >= 0),
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS worker_attendance (
        id BIGSERIAL PRIMARY KEY,
        worker_id BIGINT NOT NULL REFERENCES workers (id) ON DELETE RESTRICT,
        work_date DATE NOT NULL,
        status VARCHAR(10) NOT NULL CHECK (status IN ('present', 'absent')),
        check_in TIME,
        check_out TIME,
        note VARCHAR(500) NOT NULL DEFAULT '',
        UNIQUE (worker_id, work_date),
        CHECK (
          (status = 'absent' AND check_in IS NULL AND check_out IS NULL)
          OR (status = 'present' AND check_in IS NOT NULL
            AND (check_out IS NULL OR check_out >= check_in))
        )
      );
      CREATE TABLE IF NOT EXISTS worker_advances (
        id BIGSERIAL PRIMARY KEY,
        worker_id BIGINT NOT NULL REFERENCES workers (id) ON DELETE RESTRICT,
        advance_date DATE NOT NULL,
        amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
        note VARCHAR(500) NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at DESC);
      CREATE INDEX IF NOT EXISTS comments_gallery_status_idx ON comments (gallery_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS worker_attendance_date_idx ON worker_attendance (work_date, worker_id);
      CREATE INDEX IF NOT EXISTS worker_advances_date_idx ON worker_advances (advance_date, worker_id);
    `).catch((error) => {
      schemaPromise = undefined;
      throw error;
    });
  }
  return schemaPromise;
}

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com']
    }
  }
}));
app.use(express.json({ limit: '20kb' }));
// ننشئ الجداول عند أول طلب لأن دوال الخادم لا تضمن مرحلة بدء تشغيل منفصلة.
app.use('/api', (req, res, next) => {
  ensureDatabaseSchema().then(() => next()).catch(next);
});
app.use(session({
  name: 'mswood.sid',
  store: new PostgreSQLStore({ pool, createTableIfMissing: true }),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000
  }
}));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false
});
const submissionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-7',
  legacyHeaders: false
});

app.use('/api', (req, res, next) => {
  // نمنع الطلبات المعدِّلة للبيانات القادمة من موقع آخر باستخدام جلسة الإدارة.
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  const expectedOrigin = `${req.protocol}://${req.get('host')}`;
  if (origin && origin !== expectedOrigin) {
    return res.status(403).json({ error: 'مصدر الطلب غير مسموح.' });
  }
  next();
});

function requireAdmin(req, res, next) {
  // كل واجهات لوحة الإدارة محمية بالتحقق نفسه من جلسة الدخول.
  if (req.session.adminEmail !== adminEmail) {
    return res.status(401).json({ error: 'يلزم تسجيل الدخول.' });
  }
  next();
}

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function validGalleryId(value) {
  return /^[a-z0-9-]{1,80}$/.test(value);
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function validMonth(value) {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function validClock(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function validMoney(value, { allowZero = false } = {}) {
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) && (allowZero ? amount >= 0 : amount > 0) && amount <= 100000000;
}

function validRecordId(value) {
  return /^\d{1,18}$/.test(String(value || ''));
}

app.post('/api/orders', submissionLimiter, async (req, res, next) => {
  try {
    const name = cleanText(req.body.name, 100);
    const phone = cleanText(req.body.phone, 40);
    const message = cleanText(req.body.message, 3000);
    if (name.length < 2 || phone.length < 7 || message.length < 5) {
      return res.status(400).json({ error: 'أكمل الاسم ورقم الهاتف وتفاصيل المشروع بشكل صحيح.' });
    }

    const result = await pool.query(
      'INSERT INTO orders (name, phone, message) VALUES ($1, $2, $3) RETURNING id, created_at',
      [name, phone, message]
    );
    res.status(201).json({ id: result.rows[0].id, createdAt: result.rows[0].created_at });
  } catch (error) {
    next(error);
  }
});

app.get('/api/comments', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, gallery_id, name, body, created_at
       FROM comments
       WHERE status = 'approved'
       ORDER BY created_at DESC
       LIMIT 12`
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.get('/api/comments/:galleryId', async (req, res, next) => {
  try {
    const { galleryId } = req.params;
    if (!validGalleryId(galleryId)) return res.status(400).json({ error: 'الصورة غير معروفة.' });
    const result = await pool.query(
      `SELECT id, name, body, created_at
       FROM comments
       WHERE gallery_id = $1 AND status = 'approved'
       ORDER BY created_at DESC
       LIMIT 30`,
      [galleryId]
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.post('/api/comments', submissionLimiter, async (req, res, next) => {
  try {
    const galleryId = cleanText(req.body.galleryId, 80);
    const name = cleanText(req.body.name, 80);
    const body = cleanText(req.body.body, 800);
    if (!validGalleryId(galleryId) || name.length < 2 || body.length < 3) {
      return res.status(400).json({ error: 'أدخل الاسم والتعليق واختَر صورة صحيحة.' });
    }

    await pool.query(
      'INSERT INTO comments (gallery_id, name, body) VALUES ($1, $2, $3)',
      [galleryId, name, body]
    );
    res.status(201).json({ message: 'وصل تعليقك، وسيظهر بعد مراجعته.' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/login', loginLimiter, async (req, res, next) => {
  try {
    const email = cleanText(req.body.email, 254).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const valid = email === adminEmail && await bcrypt.compare(password, adminPasswordHash);
    if (!valid) return res.status(401).json({ error: 'البريد أو كلمة المرور غير صحيحة.' });

    // ننشئ معرّف جلسة جديدًا بعد الدخول لمنع تثبيت الجلسة.
    await new Promise((resolve, reject) => {
      req.session.regenerate((error) => error ? reject(error) : resolve());
    });
    req.session.adminEmail = adminEmail;
    await new Promise((resolve, reject) => {
      req.session.save((error) => error ? reject(error) : resolve());
    });
    res.json({ email: adminEmail });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/verify-entry', loginLimiter, async (req, res, next) => {
  try {
    const email = cleanText(req.body.email, 254).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const valid = email === adminEmail && await bcrypt.compare(password, adminPasswordHash);
    if (!valid) return res.status(401).json({ error: 'البريد أو كلمة المرور غير صحيحة.' });

    await new Promise((resolve, reject) => {
      req.session.destroy((error) => error ? reject(error) : resolve());
    });
    res.clearCookie('mswood.sid', { httpOnly: true, secure: isProduction, sameSite: 'strict' });
    res.json({ verified: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/session', (req, res) => {
  res.json({ authenticated: req.session.adminEmail === adminEmail, email: req.session.adminEmail || null });
});

app.post('/api/admin/logout', requireAdmin, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie('mswood.sid', { httpOnly: true, secure: isProduction, sameSite: 'strict' });
    res.status(204).end();
  });
});

app.get('/api/admin/summary', requireAdmin, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM orders) AS orders_total,
        (SELECT COUNT(*)::int FROM orders WHERE status = 'new') AS orders_new,
        (SELECT COUNT(*)::int FROM comments WHERE status = 'pending') AS comments_pending,
        (SELECT COUNT(*)::int FROM comments WHERE status = 'approved') AS comments_approved
    `);
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/orders', requireAdmin, async (req, res, next) => {
  try {
    const status = cleanText(req.query.status, 30);
    const allowed = ['new', 'contacted', 'in-progress', 'completed', 'cancelled'];
    const result = status && allowed.includes(status)
      ? await pool.query('SELECT id, name, phone, message, status, created_at FROM orders WHERE status = $1 ORDER BY created_at DESC LIMIT 500', [status])
      : await pool.query('SELECT id, name, phone, message, status, created_at FROM orders ORDER BY created_at DESC LIMIT 500');
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/admin/orders/:id', requireAdmin, async (req, res, next) => {
  try {
    const status = cleanText(req.body.status, 30);
    const allowed = ['new', 'contacted', 'in-progress', 'completed', 'cancelled'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'حالة الطلب غير صالحة.' });
    const result = await pool.query(
      'UPDATE orders SET status = $1 WHERE id = $2 RETURNING id, status',
      [status, req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'الطلب غير موجود.' });
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/comments', requireAdmin, async (req, res, next) => {
  try {
    const status = cleanText(req.query.status, 30);
    const allowed = ['pending', 'approved', 'rejected'];
    const result = status && allowed.includes(status)
      ? await pool.query('SELECT id, gallery_id, name, body, status, created_at FROM comments WHERE status = $1 ORDER BY created_at DESC LIMIT 500', [status])
      : await pool.query('SELECT id, gallery_id, name, body, status, created_at FROM comments ORDER BY created_at DESC LIMIT 500');
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/admin/comments/:id', requireAdmin, async (req, res, next) => {
  try {
    const status = cleanText(req.body.status, 30);
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'حالة التعليق غير صالحة.' });
    }
    const result = await pool.query(
      'UPDATE comments SET status = $1 WHERE id = $2 RETURNING id, status',
      [status, req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'التعليق غير موجود.' });
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/hr/categories', requireAdmin, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.name, c.created_at, COUNT(w.id)::int AS worker_count
       FROM work_categories c
       LEFT JOIN workers w ON w.category_id = c.id
       GROUP BY c.id
       ORDER BY c.name`
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/hr/categories', requireAdmin, async (req, res, next) => {
  try {
    const name = cleanText(req.body.name, 80);
    if (name.length < 2) return res.status(400).json({ error: 'اكتب اسم فئة صحيحًا.' });
    const result = await pool.query(
      'INSERT INTO work_categories (name) VALUES ($1) RETURNING id, name, created_at',
      [name]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'هذه الفئة موجودة بالفعل.' });
    next(error);
  }
});

app.patch('/api/admin/hr/categories/:id', requireAdmin, async (req, res, next) => {
  try {
    if (!validRecordId(req.params.id)) return res.status(400).json({ error: 'معرّف الفئة غير صالح.' });
    const name = cleanText(req.body.name, 80);
    if (name.length < 2) return res.status(400).json({ error: 'اكتب اسم فئة صحيحًا.' });
    const result = await pool.query(
      'UPDATE work_categories SET name = $1 WHERE id = $2 RETURNING id, name',
      [name, req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'الفئة غير موجودة.' });
    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'هذه الفئة موجودة بالفعل.' });
    next(error);
  }
});

app.delete('/api/admin/hr/categories/:id', requireAdmin, async (req, res, next) => {
  try {
    if (!validRecordId(req.params.id)) return res.status(400).json({ error: 'معرّف الفئة غير صالح.' });
    const result = await pool.query('DELETE FROM work_categories WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'الفئة غير موجودة.' });
    res.status(204).end();
  } catch (error) {
    if (error.code === '23503') {
      return res.status(409).json({ error: 'لا يمكن حذف فئة مرتبطة بعمال. انقل العمال إلى فئة أخرى أولًا.' });
    }
    next(error);
  }
});

app.get('/api/admin/hr/workers', requireAdmin, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT w.id, w.name, w.phone, w.category_id, c.name AS category_name,
              w.monthly_salary, w.active, w.created_at
       FROM workers w
       JOIN work_categories c ON c.id = w.category_id
       ORDER BY w.active DESC, w.name`
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/hr/workers', requireAdmin, async (req, res, next) => {
  try {
    const name = cleanText(req.body.name, 100);
    const phone = cleanText(req.body.phone, 40);
    const categoryId = Number(req.body.categoryId);
    const monthlySalary = req.body.monthlySalary;
    if (name.length < 2 || phone.length < 7 || !Number.isSafeInteger(categoryId) || categoryId < 1
      || !validMoney(monthlySalary, { allowZero: true })) {
      return res.status(400).json({ error: 'أكمل اسم العامل ورقم هاتفه وفئته والراتب الشهري بشكل صحيح.' });
    }
    const result = await pool.query(
      `INSERT INTO workers (name, phone, category_id, monthly_salary)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, phone, category_id, monthly_salary, active, created_at`,
      [name, phone, categoryId, monthlySalary]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23503') return res.status(400).json({ error: 'الفئة المختارة غير موجودة.' });
    next(error);
  }
});

app.patch('/api/admin/hr/workers/:id', requireAdmin, async (req, res, next) => {
  try {
    if (!validRecordId(req.params.id)) return res.status(400).json({ error: 'معرّف العامل غير صالح.' });
    const name = cleanText(req.body.name, 100);
    const phone = cleanText(req.body.phone, 40);
    const categoryId = Number(req.body.categoryId);
    const monthlySalary = req.body.monthlySalary;
    if (name.length < 2 || phone.length < 7 || !Number.isSafeInteger(categoryId) || categoryId < 1
      || !validMoney(monthlySalary, { allowZero: true })
      || (req.body.active !== undefined && typeof req.body.active !== 'boolean')) {
      return res.status(400).json({ error: 'راجع بيانات العامل والراتب الشهري.' });
    }
    const result = await pool.query(
      `UPDATE workers
       SET name = $1, phone = $2, category_id = $3, monthly_salary = $4,
           active = COALESCE($5, active)
       WHERE id = $6
       RETURNING id, name, phone, category_id, monthly_salary, active, created_at`,
      [name, phone, categoryId, monthlySalary, req.body.active ?? null, req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'العامل غير موجود.' });
    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23503') return res.status(400).json({ error: 'الفئة المختارة غير موجودة.' });
    next(error);
  }
});

app.get('/api/admin/hr/attendance', requireAdmin, async (req, res, next) => {
  try {
    const date = req.query.date;
    if (!validDate(date)) return res.status(400).json({ error: 'اختر تاريخًا صحيحًا للحضور.' });
    const result = await pool.query(
      `SELECT a.id, a.worker_id, w.name AS worker_name, c.name AS category_name,
              a.work_date, a.status, a.check_in, a.check_out, a.note
       FROM worker_attendance a
       JOIN workers w ON w.id = a.worker_id
       JOIN work_categories c ON c.id = w.category_id
       WHERE a.work_date = $1
       ORDER BY w.name`,
      [date]
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/hr/attendance', requireAdmin, async (req, res, next) => {
  try {
    const workerId = Number(req.body.workerId);
    const workDate = req.body.date;
    const status = cleanText(req.body.status, 10);
    const checkIn = req.body.checkIn || null;
    const checkOut = req.body.checkOut || null;
    const note = cleanText(req.body.note, 500);
    if (!Number.isSafeInteger(workerId) || workerId < 1 || !validDate(workDate)
      || !['present', 'absent'].includes(status)
      || (status === 'present' && !validClock(checkIn))
      || (checkOut !== null && !validClock(checkOut))
      || (checkIn && checkOut && checkOut < checkIn)
      || (status === 'absent' && (checkIn || checkOut))) {
      return res.status(400).json({ error: 'راجع العامل والتاريخ وحالة ووقت الحضور والانصراف.' });
    }
    const result = await pool.query(
      `INSERT INTO worker_attendance (worker_id, work_date, status, check_in, check_out, note)
       SELECT w.id, $2, $3, $4, $5, $6 FROM workers w
       WHERE w.id = $1 AND w.active = TRUE
       ON CONFLICT (worker_id, work_date) DO UPDATE
       SET status = EXCLUDED.status, check_in = EXCLUDED.check_in,
           check_out = EXCLUDED.check_out, note = EXCLUDED.note
       RETURNING id, worker_id, work_date, status, check_in, check_out, note`,
      [workerId, workDate, status, checkIn, checkOut, note]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'العامل غير موجود أو موقوف.' });
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/hr/advances', requireAdmin, async (req, res, next) => {
  try {
    const month = req.query.month;
    if (!validMonth(month)) return res.status(400).json({ error: 'اختر شهرًا صحيحًا للسُلف.' });
    const result = await pool.query(
      `SELECT a.id, a.worker_id, w.name AS worker_name, a.advance_date, a.amount, a.note
       FROM worker_advances a
       JOIN workers w ON w.id = a.worker_id
       WHERE a.advance_date >= ($1 || '-01')::date
         AND a.advance_date < (($1 || '-01')::date + INTERVAL '1 month')
       ORDER BY a.advance_date DESC, w.name`,
      [month]
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/hr/advances', requireAdmin, async (req, res, next) => {
  try {
    const workerId = Number(req.body.workerId);
    const advanceDate = req.body.date;
    const amount = req.body.amount;
    const note = cleanText(req.body.note, 500);
    if (!Number.isSafeInteger(workerId) || workerId < 1 || !validDate(advanceDate) || !validMoney(amount)) {
      return res.status(400).json({ error: 'أدخل العامل والتاريخ ومبلغ سلفة صحيحًا.' });
    }
    const result = await pool.query(
      `INSERT INTO worker_advances (worker_id, advance_date, amount, note)
       SELECT w.id, $2, $3, $4 FROM workers w WHERE w.id = $1
       RETURNING id, worker_id, advance_date, amount, note`,
      [workerId, advanceDate, amount, note]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'العامل غير موجود.' });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/hr/payroll', requireAdmin, async (req, res, next) => {
  try {
    const month = req.query.month;
    if (!validMonth(month)) return res.status(400).json({ error: 'اختر شهرًا صحيحًا لكشف الرواتب.' });
    const result = await pool.query(
      `SELECT w.id AS worker_id, w.name, w.phone, c.name AS category_name,
              w.monthly_salary,
              COALESCE(SUM(a.amount), 0)::numeric(12, 2) AS advances_total,
              (w.monthly_salary - COALESCE(SUM(a.amount), 0))::numeric(12, 2) AS net_salary
       FROM workers w
       JOIN work_categories c ON c.id = w.category_id
       LEFT JOIN worker_advances a
         ON a.worker_id = w.id
        AND a.advance_date >= ($1 || '-01')::date
        AND a.advance_date < (($1 || '-01')::date + INTERVAL '1 month')
       WHERE w.active = TRUE
       GROUP BY w.id, c.name
       ORDER BY w.name`,
      [month]
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(publicDir, 'admin.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(publicDir, 'admin.html')));
app.get('/ms.css', (req, res) => res.sendFile(path.join(publicDir, 'ms.css')));
app.get('/ms.js', (req, res) => res.sendFile(path.join(publicDir, 'ms.js')));
app.get('/admin.css', (req, res) => res.sendFile(path.join(publicDir, 'admin.css')));
app.get('/admin.js', (req, res) => res.sendFile(path.join(publicDir, 'admin.js')));
app.get('/gallery-assets.js', (req, res) => res.sendFile(path.join(publicDir, 'gallery-assets.js')));
app.use('/img', express.static(path.join(publicDir, 'img'), { maxAge: isProduction ? '1d' : 0 }));

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: 'حدث خطأ داخلي. حاول مرة أخرى لاحقًا.' });
});

async function start() {
  await ensureDatabaseSchema();

  const port = Number(process.env.PORT || 3000);
  const host = isProduction ? '0.0.0.0' : '127.0.0.1';
  app.listen(port, host, () => console.log(`MS Woodworks is listening on ${host}:${port}`));
}

module.exports = app;

// نبدأ الخادم محليًا أو عبر Docker فقط؛ أما Vercel فيستورد التطبيق المُصدَّر.
if (require.main === module) {
  start().catch((error) => {
    console.error('Unable to start MS Woodworks:', error);
    process.exit(1);
  });
}