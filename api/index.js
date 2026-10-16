/**
 * api/index.js — مدخل Vercel serverless لتطبيق MS Woodworks (Express + PostgreSQL)
 * الغرض: تعريض تطبيق Express كوظيفة Serverless على Vercel.
 * يتم استيراد app من server.js وتصديره كمدخل افتراضي لـ Vercel.
 */

require('dotenv').config();

const app = require('../server.js');

// Vercel يستدعي الدالة المُصدَّرة مباشرة؛ لا نستخدم app.listen هنا.
// يتم تعيين PORT تلقائيًا من قبل Vercel عند الحاجة للتشغيل المحلي.

module.exports = app;