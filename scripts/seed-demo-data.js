/**
 * scripts/seed-demo-data.js — سكريبت إضافة بيانات تجريبية (للاختبار المحلي فقط)
 * الغرض: إضافة فئات وعاملين وحضور وسلف وطلبات تجريبية إلى قاعدة البيانات للتطوير والاختبار.
 * يتطلب تمرير علم --confirm-demo-data لمنع التشغيل عن طريق الخطأ، ولا يعمل في بيئة الإنتاج (production).
 */
require('dotenv').config();

const baseUrl = 'http://127.0.0.1:3000';
const confirmation = '--confirm-demo-data';
const today = new Date();
const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

async function main() {
  if (!process.argv.includes(confirmation)) {
    throw new Error(`Pass ${confirmation} to add clearly labeled demo records.`);
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Demo records cannot be added when NODE_ENV is production.');
  }
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD
    || !process.env.OWNER_USERNAME || !process.env.OWNER_PASSWORD) {
    throw new Error('Set ADMIN_EMAIL, ADMIN_PASSWORD, OWNER_USERNAME, and OWNER_PASSWORD in .env before seeding demo data.');
  }

  const session = { cookie: '' };
  async function api(path, options = {}) {
    const response = await fetch(new URL(path, baseUrl), {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(session.cookie ? { Cookie: session.cookie } : {}),
        ...options.headers
      }
    });
    if (path === '/api/admin/login' || path === '/api/owner/login') {
      const cookie = response.headers.get('set-cookie')?.match(/mswood\.sid=[^;]+/);
      if (cookie) session.cookie = cookie[0];
    }
    if (response.status === 204) return null;
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
    return result;
  }

  await api('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD
    })
  });
  await api('/api/owner/login', {
    method: 'POST',
    body: JSON.stringify({
      username: process.env.OWNER_USERNAME,
      password: process.env.OWNER_PASSWORD
    })
  });

  const categories = await api('/api/admin/hr/categories');
  const workers = await api('/api/admin/hr/workers');
  const categorySeeds = ['نجارة - بيانات تجريبية', 'تشطيب - بيانات تجريبية'];
  const categoryByName = new Map(categories.map((category) => [category.name, category]));

  for (const name of categorySeeds) {
    if (!categoryByName.has(name)) {
      const category = await api('/api/admin/hr/categories', {
        method: 'POST',
        body: JSON.stringify({ name })
      });
      categoryByName.set(name, category);
    }
  }

  const workerSeeds = [
    { name: 'عامل تجريبي 1 - نجارة', phone: '0000000001', category: categorySeeds[0], monthlySalary: 12000 },
    { name: 'عامل تجريبي 2 - تشطيب', phone: '0000000002', category: categorySeeds[1], monthlySalary: 9500 }
  ];
  const workerByName = new Map(workers.map((worker) => [worker.name, worker]));

  for (const seed of workerSeeds) {
    const existingWorker = workerByName.get(seed.name);
    if (existingWorker && !existingWorker.active) {
      const restoredWorker = await api(`/api/admin/hr/workers/${existingWorker.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: existingWorker.name,
          phone: existingWorker.phone,
          categoryId: existingWorker.category_id,
          monthlySalary: existingWorker.monthly_salary,
          active: true
        })
      });
      workerByName.set(seed.name, restoredWorker);
    } else if (!existingWorker) {
      const worker = await api('/api/admin/hr/workers', {
        method: 'POST',
        body: JSON.stringify({
          name: seed.name,
          phone: seed.phone,
          categoryId: categoryByName.get(seed.category).id,
          monthlySalary: seed.monthlySalary
        })
      });
      workerByName.set(seed.name, worker);
    }
  }

  const date = formatDate(today);
  const [woodworker, finisher] = workerSeeds.map((seed) => workerByName.get(seed.name));
  await api('/api/admin/hr/attendance', {
    method: 'PUT',
    body: JSON.stringify({
      workerId: woodworker.id,
      date,
      status: 'present',
      checkIn: '09:00',
      checkOut: '17:00',
      note: 'سجل حضور تجريبي'
    })
  });
  await api('/api/admin/hr/attendance', {
    method: 'PUT',
    body: JSON.stringify({
      workerId: finisher.id,
      date,
      status: 'absent',
      checkIn: '',
      checkOut: '',
      note: 'سجل غياب تجريبي'
    })
  });

  const month = date.slice(0, 7);
  const advances = await api(`/api/admin/hr/advances?month=${encodeURIComponent(month)}`);
  if (!advances.some((advance) => (
    String(advance.worker_id) === String(woodworker.id) && advance.note === 'سلفة تجريبية'
  ))) {
    await api('/api/admin/hr/advances', {
      method: 'POST',
      body: JSON.stringify({
        workerId: woodworker.id,
        date,
        amount: 500,
        note: 'سلفة تجريبية'
      })
    });
  }

  const orders = await api('/api/admin/orders');
  const orderSeeds = [
    {
      name: 'عميل تجريبي 1 - طلب جديد',
      phone: '0000000101',
      message: 'طلب تجريبي: تصميم طاولة طعام من خشب الزان لستة أشخاص.',
      status: 'new'
    },
    {
      name: 'عميل تجريبي 2 - متابعة',
      phone: '0000000102',
      message: 'طلب تجريبي: تفصيل مكتب منزلي مع وحدات تخزين.',
      status: 'contacted'
    },
    {
      name: 'عميل تجريبي 3 - تنفيذ',
      phone: '0000000103',
      message: 'طلب تجريبي: تصنيع مكتبة حائط حسب المقاسات.',
      status: 'in-progress'
    },
    {
      name: 'عميل تجريبي 4 - مكتمل',
      phone: '0000000104',
      message: 'طلب تجريبي: تنفيذ وحدة تلفاز من الخشب الطبيعي.',
      status: 'completed'
    }
  ];

  for (const seed of orderSeeds) {
    let order = orders.find((record) => record.name === seed.name && record.message === seed.message);
    if (!order) {
      const created = await api('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          name: seed.name,
          phone: seed.phone,
          message: seed.message
        })
      });
      order = { id: created.id };
    }
    if (order.status !== seed.status) {
      await api(`/api/admin/orders/${order.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: seed.status })
      });
    }
  }

  console.log(`Demo records are ready for ${month}: 2 demo categories, 2 demo workers, today's attendance, a 500 EGP demo advance, and 4 sample customer orders.`);
  console.log('Demo workers and customers are clearly labeled and use placeholder phone numbers.');
}

main().catch((error) => {
  console.error('Unable to seed demo HR records:', error.message);
  process.exitCode = 1;
});
