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
      CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at DESC);
      CREATE INDEX IF NOT EXISTS comments_gallery_status_idx ON comments (gallery_id, status, created_at DESC);
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
  app.listen(port, () => console.log(`MS Woodworks is listening on port ${port}`));
}

module.exports = app;

// نبدأ الخادم محليًا أو عبر Docker فقط؛ أما Vercel فيستورد التطبيق المُصدَّر.
if (require.main === module) {
  start().catch((error) => {
    console.error('Unable to start MS Woodworks:', error);
    process.exit(1);
  });
}