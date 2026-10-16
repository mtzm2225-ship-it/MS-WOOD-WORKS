/**
 * routes/finance.js — مسار المصروفات والعُهد والتحصيلات (MS Woodworks)
 * الغرض: توفير واجهات API لإدارة العُهد النقدية، الحركات المرتبطة بها، المصروفات (عهد / مباشرة)،
 * المشاريع، والتحصيلات المالية. يستخدم requireOwner للمسارات الحساسة (العاملين، الرواتب) في server.js.
 */
const express = require('express');

const paymentMethods = ['cash', 'transfer', 'card', 'wallet', 'other'];

function createFinanceRouter({ pool, requireAdmin, cleanText, validDate, validDateRange, validRecordId, validCurrencyAmount }) {
  const router = express.Router();

  router.get('/custodies', requireAdmin, async (req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT id, holder_name, balance, active, created_at
         FROM cash_custodies
         WHERE active = TRUE
         ORDER BY holder_name`
      );
      res.set('Cache-Control', 'no-store');
      res.json(result.rows);
    } catch (error) {
      next(error);
    }
  });

  router.post('/custodies', requireAdmin, async (req, res, next) => {
    try {
      const holderName = cleanText(req.body.holderName, 100);
      const amount = req.body.amount;
      const issueDate = req.body.date;
      const note = cleanText(req.body.note, 500);
      if (holderName.length < 2 || !validCurrencyAmount(amount) || !validDate(issueDate)) {
        return res.status(400).json({ error: 'أدخل اسم مستلم العُهدة ومبلغًا وتاريخًا صحيحًا.' });
      }
      const result = await pool.query(
        `WITH new_custody AS (
           INSERT INTO cash_custodies (holder_name, balance)
           VALUES ($1, $2)
           RETURNING id, holder_name, balance
         )
         INSERT INTO custody_movements (custody_id, movement_type, movement_date, amount, note)
         SELECT id, 'issued', $3, $2, $4 FROM new_custody
         RETURNING id, custody_id, movement_type, movement_date, amount, note`,
        [holderName, amount, issueDate, note]
      );
      res.status(201).json(result.rows[0]);
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'يوجد سجل عُهدة لهذا الشخص بالفعل؛ اختره لإضافة مبلغ جديد.' });
      }
      next(error);
    }
  });

  router.post('/custodies/:id/movements', requireAdmin, async (req, res, next) => {
    try {
      if (!validRecordId(req.params.id)) return res.status(400).json({ error: 'معرّف العُهدة غير صالح.' });
      const movementType = cleanText(req.body.type, 10);
      const amount = req.body.amount;
      const movementDate = req.body.date;
      const note = cleanText(req.body.note, 500);
      if (!['issued', 'returned'].includes(movementType)
        || !validCurrencyAmount(amount)
        || !validDate(movementDate)) {
        return res.status(400).json({ error: 'راجع نوع حركة العُهدة والتاريخ والمبلغ.' });
      }
      const signedAmount = movementType === 'issued' ? Number(amount) : -Number(amount);
      // تحديث الرصيد وإضافة الحركة في جملة واحدة يمنع صرف رصيد غير متاح مع الطلبات المتزامنة.
      const result = await pool.query(
        `WITH updated AS (
           UPDATE cash_custodies
           SET balance = balance + $2
           WHERE id = $1 AND active = TRUE
             AND ($2 > 0 OR balance >= ABS($2))
           RETURNING id, balance
         ),
         inserted AS (
           INSERT INTO custody_movements (custody_id, movement_type, movement_date, amount, note)
           SELECT id, $5, $3, $4, $6 FROM updated
           RETURNING id, custody_id, movement_type, movement_date, amount, note
         )
         SELECT inserted.*, updated.balance
         FROM inserted JOIN updated ON updated.id = inserted.custody_id`,
        [req.params.id, signedAmount, movementDate, amount, movementType, note]
      );
      if (!result.rowCount) {
        const custody = await pool.query(
          'SELECT balance FROM cash_custodies WHERE id = $1 AND active = TRUE',
          [req.params.id]
        );
        if (!custody.rowCount) return res.status(404).json({ error: 'العُهدة غير موجودة أو موقوفة.' });
        return res.status(409).json({ error: `المبلغ أكبر من الرصيد المتاح في العُهدة (${custody.rows[0].balance} ج.م).` });
      }
      res.status(201).json(result.rows[0]);
    } catch (error) {
      next(error);
    }
  });

  router.get('/expenses', requireAdmin, async (req, res, next) => {
    try {
      const from = req.query.from;
      const to = req.query.to;
      if (!validDateRange(from, to)) {
        return res.status(400).json({ error: 'اختر فترة صحيحة بحيث يكون تاريخ البداية قبل تاريخ النهاية أو مساويًا له.' });
      }
      const [summary, categories, expenses, movements, custodies] = await Promise.all([
        pool.query(
          `SELECT COUNT(*)::int AS expense_count,
                  COALESCE(SUM(amount), 0)::numeric(14, 2) AS total,
                  COALESCE(SUM(amount) FILTER (WHERE source = 'custody'), 0)::numeric(14, 2) AS custody_total,
                  COALESCE(SUM(amount) FILTER (WHERE source = 'direct'), 0)::numeric(14, 2) AS direct_total
           FROM expenses
           WHERE expense_date BETWEEN $1::date AND $2::date`,
          [from, to]
        ),
        pool.query(
          `SELECT category, COUNT(*)::int AS expense_count,
                  SUM(amount)::numeric(14, 2) AS total
           FROM expenses
           WHERE expense_date BETWEEN $1::date AND $2::date
           GROUP BY category
           ORDER BY SUM(amount) DESC, category`,
          [from, to]
        ),
        pool.query(
          `SELECT e.id, COUNT(*) OVER()::int AS result_total,
                  e.expense_date, e.source, e.custody_id, c.holder_name,
                  e.amount, e.category, e.description, e.paid_to, e.payment_method,
                  e.reference, e.note, e.created_at
           FROM expenses e
           LEFT JOIN cash_custodies c ON c.id = e.custody_id
           WHERE e.expense_date BETWEEN $1::date AND $2::date
           ORDER BY e.expense_date DESC, e.id DESC
           LIMIT 1000`,
          [from, to]
        ),
        pool.query(
          `SELECT m.id, COUNT(*) OVER()::int AS result_total,
                  m.custody_id, c.holder_name, m.movement_type,
                  m.movement_date, m.amount, m.note, m.created_at
           FROM custody_movements m
           JOIN cash_custodies c ON c.id = m.custody_id
           WHERE m.movement_date BETWEEN $1::date AND $2::date
           ORDER BY m.movement_date DESC, m.id DESC
           LIMIT 1000`,
          [from, to]
        ),
        pool.query(
          `SELECT id, holder_name, balance
           FROM cash_custodies
           WHERE active = TRUE
           ORDER BY holder_name`
        )
      ]);
      res.set('Cache-Control', 'no-store');
      res.json({
        summary: summary.rows[0],
        categories: categories.rows,
        expenses: expenses.rows,
        movements: movements.rows,
        custodies: custodies.rows
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/expenses', requireAdmin, async (req, res, next) => {
    try {
      const expenseDate = req.body.date;
      const source = cleanText(req.body.source, 10);
      const custodyId = req.body.custodyId;
      const amount = req.body.amount;
      const category = cleanText(req.body.category, 100);
      const description = cleanText(req.body.description, 1000);
      const paidTo = cleanText(req.body.paidTo, 120);
      const paymentMethod = cleanText(req.body.paymentMethod, 10);
      const reference = cleanText(req.body.reference, 100);
      const note = cleanText(req.body.note, 500);
      const custodyExpense = source === 'custody';
      if (!validDate(expenseDate) || !['custody', 'direct'].includes(source)
        || (custodyExpense && !validRecordId(custodyId))
        || (!custodyExpense && custodyId !== undefined && custodyId !== null && custodyId !== '')
        || !validCurrencyAmount(amount) || category.length < 2 || description.length < 3
        || !paymentMethods.includes(paymentMethod)) {
        return res.status(400).json({ error: 'أكمل التاريخ ونوع الصرف والبند والوصف وطريقة الدفع والمبلغ بشكل صحيح.' });
      }
      const values = [
        expenseDate,
        source,
        custodyExpense ? custodyId : null,
        amount,
        category,
        description,
        paidTo,
        paymentMethod,
        reference,
        note
      ];
      const result = custodyExpense
        ? await pool.query(
          `WITH debited AS (
             UPDATE cash_custodies
             SET balance = balance - $4
             WHERE id = $3 AND active = TRUE AND balance >= $4
             RETURNING id
           )
           INSERT INTO expenses
             (expense_date, source, custody_id, amount, category, description,
              paid_to, payment_method, reference, note)
           SELECT $1, $2, id, $4, $5, $6, $7, $8, $9, $10 FROM debited
           RETURNING id, expense_date, source, custody_id, amount, category,
                     description, paid_to, payment_method, reference, note`,
          values
        )
        : await pool.query(
          `INSERT INTO expenses
             (expense_date, source, custody_id, amount, category, description,
              paid_to, payment_method, reference, note)
           VALUES ($1, $2, NULL, $4, $5, $6, $7, $8, $9, $10)
           RETURNING id, expense_date, source, custody_id, amount, category,
                     description, paid_to, payment_method, reference, note`,
          values
        );
      if (!result.rowCount && custodyExpense) {
        const custody = await pool.query(
          'SELECT balance FROM cash_custodies WHERE id = $1 AND active = TRUE',
          [custodyId]
        );
        if (!custody.rowCount) return res.status(404).json({ error: 'العُهدة المختارة غير موجودة أو موقوفة.' });
        return res.status(409).json({ error: `المصروف أكبر من الرصيد المتاح في العُهدة (${custody.rows[0].balance} ج.م). سجّله كمصروف مباشر إذا تم دفعه من خارجها.` });
      }
      res.status(201).json(result.rows[0]);
    } catch (error) {
      if (error.code === '23503') return res.status(400).json({ error: 'العُهدة المختارة غير موجودة.' });
      next(error);
    }
  });

  router.get('/collections', requireAdmin, async (req, res, next) => {
    try {
      const from = req.query.from;
      const to = req.query.to;
      if (!validDateRange(from, to)) {
        return res.status(400).json({ error: 'اختر فترة صحيحة للتحصيلات.' });
      }
      const [summary, projects, availableOrders, receipts] = await Promise.all([
        pool.query(
          `SELECT COUNT(*)::int AS receipt_count,
                  COALESCE(SUM(amount), 0)::numeric(14, 2) AS total,
                  COALESCE(SUM(amount) FILTER (WHERE receipt_type = 'project'), 0)::numeric(14, 2) AS project_total,
                  COALESCE(SUM(amount) FILTER (WHERE receipt_type = 'order'), 0)::numeric(14, 2) AS order_total,
                  COALESCE(SUM(amount) FILTER (WHERE receipt_type = 'general'), 0)::numeric(14, 2) AS general_total
           FROM work_receipts
           WHERE receipt_date BETWEEN $1::date AND $2::date`,
          [from, to]
        ),
        pool.query(
          `SELECT p.id, p.order_id, p.name, o.name AS customer_name, o.phone,
                  p.agreed_amount,
                  COALESCE(SUM(r.amount), 0)::numeric(14, 2) AS paid_total,
                  (p.agreed_amount - COALESCE(SUM(r.amount), 0))::numeric(14, 2) AS remaining_amount,
                  p.created_at
           FROM work_projects p
           JOIN orders o ON o.id = p.order_id
           LEFT JOIN work_receipts r ON r.project_id = p.id OR r.order_id = p.order_id
           WHERE p.active = TRUE
           GROUP BY p.id, o.name, o.phone
           ORDER BY p.created_at DESC, p.id DESC`,
          []
        ),
        pool.query(
          `          SELECT o.id, COUNT(*) OVER()::int AS result_total, o.name, o.phone, o.created_at
           FROM orders o
           WHERE NOT EXISTS (
             SELECT 1 FROM work_projects p WHERE p.order_id = o.id AND p.active = TRUE
           )
           ORDER BY o.created_at DESC
           LIMIT 500`,
          []
        ),
        pool.query(
          `SELECT r.id, COUNT(*) OVER()::int AS result_total,
                  r.receipt_date, r.receipt_type, r.project_id, r.order_id,
                  r.amount, r.description, r.paid_by, r.payment_method,
                  r.reference, r.note, p.name AS project_name,
                  COALESCE(project_order.name, linked_order.name) AS customer_name
           FROM work_receipts r
           LEFT JOIN work_projects p ON p.id = r.project_id
           LEFT JOIN orders project_order ON project_order.id = p.order_id
           LEFT JOIN orders linked_order ON linked_order.id = r.order_id
           WHERE r.receipt_date BETWEEN $1::date AND $2::date
           ORDER BY r.receipt_date DESC, r.id DESC
           LIMIT 1000`,
          [from, to]
        )
      ]);
      res.set('Cache-Control', 'no-store');
      res.json({
        summary: summary.rows[0],
        projects: projects.rows,
        availableOrders: availableOrders.rows,
        receipts: receipts.rows
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/projects', requireAdmin, async (req, res, next) => {
    try {
      const orderId = Number(req.body.orderId);
      const name = cleanText(req.body.name, 200);
      const agreedAmount = req.body.agreedAmount;
      if (!Number.isSafeInteger(orderId) || orderId < 1 || name.length < 2
        || !validCurrencyAmount(agreedAmount)) {
        return res.status(400).json({ error: 'أدخل الطلب واسم الشغل وقيمة الاتفاق بشكل صحيح.' });
      }
      const result = await pool.query(
        `INSERT INTO work_projects (order_id, name, agreed_amount)
         SELECT o.id, $2, $3
         FROM orders o
         WHERE o.id = $1
         RETURNING id, order_id, name, agreed_amount, created_at`,
        [orderId, name, agreedAmount]
      );
      if (!result.rowCount) return res.status(404).json({ error: 'الطلب غير موجود.' });
      res.status(201).json(result.rows[0]);
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'تم إنشاء مشروع لهذا الطلب بالفعل.' });
      if (error.code === '23503') return res.status(400).json({ error: 'الطلب المحدد غير موجود.' });
      next(error);
    }
  });

  router.patch('/projects/:id', requireAdmin, async (req, res, next) => {
    try {
      if (!validRecordId(req.params.id)) return res.status(400).json({ error: 'معرّف المشروع غير صالح.' });
      const name = cleanText(req.body.name, 200);
      const agreedAmount = req.body.agreedAmount;
      if (name.length < 2 || !validCurrencyAmount(agreedAmount)) {
        return res.status(400).json({ error: 'أدخل اسم الشغل وقيمة الاتفاق بشكل صحيح.' });
      }
      const result = await pool.query(
        `UPDATE work_projects SET name = $1, agreed_amount = $2
         WHERE id = $3 AND active = TRUE
         RETURNING id, order_id, name, agreed_amount`,
        [name, agreedAmount, req.params.id]
      );
      if (!result.rowCount) return res.status(404).json({ error: 'المشروع غير موجود أو موقوف.' });
      res.json(result.rows[0]);
    } catch (error) {
      next(error);
    }
  });

  router.post('/collections', requireAdmin, async (req, res, next) => {
    try {
      const receiptDate = req.body.date;
      const receiptType = cleanText(req.body.type, 10);
      const projectId = req.body.projectId;
      const orderId = req.body.orderId;
      const amount = req.body.amount;
      const description = cleanText(req.body.description, 500);
      const paidBy = cleanText(req.body.paidBy, 120);
      const paymentMethod = cleanText(req.body.paymentMethod, 10);
      const reference = cleanText(req.body.reference, 100);
      const note = cleanText(req.body.note, 500);
      if (!validDate(receiptDate) || !['project', 'order', 'general'].includes(receiptType)
        || (receiptType === 'project' && !validRecordId(projectId))
        || (receiptType !== 'project' && projectId !== undefined && projectId !== null && projectId !== '')
        || (receiptType === 'order' && !validRecordId(orderId))
        || (receiptType !== 'order' && orderId !== undefined && orderId !== null && orderId !== '')
        || !validCurrencyAmount(amount) || description.length < 2
        || !paymentMethods.includes(paymentMethod)) {
        return res.status(400).json({ error: 'أكمل نوع التحصيل والتاريخ والمبلغ والبيان وطريقة الاستلام بشكل صحيح.' });
      }
      const values = [
        receiptDate,
        receiptType,
        receiptType === 'project' ? projectId : null,
        receiptType === 'order' ? orderId : null,
        amount,
        description,
        paidBy,
        paymentMethod,
        reference,
        note
      ];
      const insertSql = receiptType === 'project'
        ? `INSERT INTO work_receipts
             (receipt_date, receipt_type, project_id, order_id, amount, description,
              paid_by, payment_method, reference, note)
           SELECT $1, $2, p.id, NULL, $5, $6, $7, $8, $9, $10
           FROM work_projects p WHERE p.id = $3 AND p.active = TRUE`
        : receiptType === 'order'
          ? `INSERT INTO work_receipts
               (receipt_date, receipt_type, project_id, order_id, amount, description,
                paid_by, payment_method, reference, note)
             SELECT $1, $2, NULL, o.id, $5, $6, $7, $8, $9, $10
             FROM orders o WHERE o.id = $4`
          : `INSERT INTO work_receipts
               (receipt_date, receipt_type, project_id, order_id, amount, description,
                paid_by, payment_method, reference, note)
             VALUES ($1, $2, NULL, NULL, $5, $6, $7, $8, $9, $10)`;
      const result = await pool.query(
        `${insertSql}
         RETURNING id, receipt_date, receipt_type, project_id, order_id, amount,
                   description, paid_by, payment_method, reference, note`,
        values
      );
      if (!result.rowCount && receiptType === 'project') {
        return res.status(404).json({ error: 'المشروع غير موجود أو موقوف.' });
      }
      if (!result.rowCount && receiptType === 'order') return res.status(404).json({ error: 'الطلب غير موجود.' });
      // الزيادة مسموحة وتظهر كرصيد سالب للمشروع مع تنبيه في كشف التحصيلات.
      res.status(201).json(result.rows[0]);
    } catch (error) {
      if (error.code === '23503') return res.status(400).json({ error: 'المشروع أو الطلب المحدد غير موجود.' });
      next(error);
    }
  });

  return router;
}

module.exports = createFinanceRouter;
