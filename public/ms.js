/**
 * public/ms.js — واجهة موقع MS Woodworks العام (الويب سايت)
 * الغرض: إدارة التفاعل مع الصفحة الرئيسية — المعرض، نموذج طلب العملاء، تسجيل دخول العملاء،
 * عرض طلبات العميل، التنقل، والتحريك عند التمرير (scroll reveal).
 */
document.addEventListener('DOMContentLoaded', () => {
  // عناصر واجهة العرض والتحريك
  const scrollProgress = document.getElementById('scrollProgress');
  const burger = document.getElementById('burger');
  const nav = document.getElementById('nav');
  const header = document.getElementById('header');
  const toTop = document.getElementById('toTop');
  const navLinks = document.querySelectorAll('.nav__link');

  // عناصر نموذج التواصل مع الورشة
  const form = document.getElementById('contactForm');
  const formNote = document.getElementById('formNote');

  // عناصر المعرض وتعليقات العملاء
  const galleryGrid = document.getElementById('galleryGrid');
  const galleryFilters = document.getElementById('galleryFilters');
  const galleryCount = document.getElementById('galleryCount');
  const galleryPrev = document.getElementById('galleryPrev');
  const galleryNext = document.getElementById('galleryNext');
  const galleryDetailsDialog = document.getElementById('galleryDetails');
  const customerReviews = document.getElementById('customerReviews');
  const customerReviewForm = document.getElementById('customerReviewForm');
  const customerReviewNote = document.getElementById('customerReviewNote');
  const commentsDialog = document.getElementById('galleryComments');
  const commentForm = document.getElementById('galleryCommentForm');
  const commentList = document.getElementById('galleryCommentList');
  const commentNote = document.getElementById('galleryCommentNote');

  // عناصر تسجيل دخول العملاء وطلباتهم
  const customerAuthDialog = document.getElementById('customerAuthDialog');
  const customerLoginForm = document.getElementById('customerLoginForm');
  const customerLoginNote = document.getElementById('customerLoginNote');
  const customerRegisterForm = document.getElementById('customerRegisterForm');
  const customerRegisterNote = document.getElementById('customerRegisterNote');
  const customerOrdersList = document.getElementById('customerOrdersList');
  const customerOrdersNote = document.getElementById('customerOrdersNote');
  const customerStatusLabels = {
    new: 'جديد',
    contacted: 'تم التواصل',
    'in-progress': 'قيد التنفيذ',
    completed: 'مكتمل',
    cancelled: 'ملغي'
  };
  let customerAccount = null;
  let refreshCustomerAccountOrders = null;

  const prefillContactForm = () => {
    if (!form || !customerAccount) return;
    const name = form.querySelector('#cf-name');
    const phone = form.querySelector('#cf-phone');
    if (name && !name.value.trim()) name.value = customerAccount.name;
    if (phone && !phone.value.trim()) phone.value = customerAccount.phone;
  };

  // بيانات المعرض تأتي من gallery-assets.js؛ نتابع العمل حتى لو تعذر تحميلها.
  const galleryAssets = (window.MSWoodGalleryAssets && window.MSWoodGalleryAssets.gallery) || [];
  const galleryCategories = ['الكل', ...new Set(galleryAssets.map((asset) => asset.category))];
  let activeGalleryCategory = 'الكل';
  let visibleGalleryAssets = galleryAssets;

  if (galleryFilters) {
    galleryCategories.forEach((category) => {
      const filter = document.createElement('button');
      filter.type = 'button';
      filter.className = 'gallery-filter';
      filter.dataset.category = category;
      filter.textContent = category;
      filter.setAttribute('aria-pressed', String(category === activeGalleryCategory));
      galleryFilters.append(filter);
    });
  }

  if (customerReviewForm) {
    const projectSelect = customerReviewForm.elements.namedItem('galleryId');
    galleryAssets.forEach((asset) => {
      const option = document.createElement('option');
      option.value = asset.id;
      option.textContent = asset.title;
      projectSelect.append(option);
    });
  }

  const renderGallery = () => {
    if (!galleryGrid) return;

    visibleGalleryAssets = activeGalleryCategory === 'الكل'
      ? galleryAssets
      : galleryAssets.filter((asset) => asset.category === activeGalleryCategory);

    galleryGrid.classList.add('gallery__grid--curated');
    galleryGrid.replaceChildren();

    if (galleryCount) {
      galleryCount.textContent = visibleGalleryAssets.length
        ? `${visibleGalleryAssets.length} ${visibleGalleryAssets.length === 1 ? 'نموذج' : 'نماذج'} · ${activeGalleryCategory}`
        : '';
    }

    if (!visibleGalleryAssets.length) {
      const empty = document.createElement('p');
      empty.className = 'gallery-comments__empty';
      empty.textContent = 'تعذر تحميل صور المعرض الآن. حدّث الصفحة للمحاولة مرة أخرى.';
      galleryGrid.append(empty);
      return;
    }
    visibleGalleryAssets.forEach((item, index) => {
      const card = document.createElement('article');
      card.className = `tile ${index === 0 ? 'tile--feature' : 'tile--side'}`;
      const detailsButton = document.createElement('button');
      detailsButton.className = 'tile__details';
      detailsButton.type = 'button';
      detailsButton.dataset.galleryDetails = item.id;
      detailsButton.setAttribute('aria-label', `عرض تفاصيل ${item.title}`);

      const image = document.createElement('img');
      image.src = item.src;
      image.alt = item.alt;
      image.loading = index === 0 ? 'eager' : 'lazy';
      const caption = document.createElement('span');
      caption.className = 'tile__cap';
      const category = document.createElement('span');
      category.className = 'tile__cat';
      category.textContent = item.category;
      const title = document.createElement('span');
      title.className = 'tile__title';
      title.textContent = item.title;
      const action = document.createElement('span');
      action.className = 'tile__more';
      action.textContent = 'عرض النموذج';
      caption.append(category, title, action);
      detailsButton.append(image, caption);

      const commentsButton = document.createElement('button');
      commentsButton.className = 'tile__comment';
      commentsButton.type = 'button';
      commentsButton.dataset.commentsFor = item.id;
      commentsButton.textContent = 'التعليقات';
      card.append(detailsButton, commentsButton);
      galleryGrid.append(card);
    });
  };

  if (galleryFilters) {
    galleryFilters.addEventListener('click', (event) => {
      const button = event.target.closest('.gallery-filter');
      if (!button || button.dataset.category === activeGalleryCategory) return;
      activeGalleryCategory = button.dataset.category;
      galleryFilters.querySelectorAll('.gallery-filter').forEach((filter) => {
        filter.setAttribute('aria-pressed', String(filter === button));
      });
      renderGallery();
    });
  }

  const renderComments = (comments) => {
    commentList.replaceChildren();
    commentList.setAttribute('aria-busy', 'false');
    if (!comments.length) {
      const empty = document.createElement('p');
      empty.className = 'gallery-comments__empty';
      empty.textContent = 'لا توجد تعليقات منشورة على هذه الصورة حتى الآن.';
      commentList.append(empty);
      return;
    }

    comments.forEach((comment) => {
      const item = document.createElement('article');
      item.className = 'gallery-comment';
      const author = document.createElement('strong');
      author.textContent = comment.name;
      const body = document.createElement('p');
      body.textContent = comment.body;
      const date = document.createElement('time');
      date.dateTime = comment.created_at;
      date.textContent = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(new Date(comment.created_at));
      item.append(author, body, date);
      commentList.append(item);
    });
  };

  const loadComments = async (galleryId) => {
    commentList.setAttribute('aria-busy', 'true');
    commentList.textContent = 'جار تحميل التعليقات…';
    try {
      const response = await fetch(`/api/comments/${encodeURIComponent(galleryId)}`);
      const comments = await response.json();
      if (!response.ok) throw new Error(comments.error || 'تعذر تحميل التعليقات.');
      renderComments(comments);
    } catch {
      commentList.setAttribute('aria-busy', 'false');
      commentList.textContent = 'تعذر تحميل التعليقات الآن. حاول مرة أخرى لاحقًا.';
    }
  };

  const renderCustomerReviews = (reviews) => {
    if (!customerReviews) return;
    customerReviews.replaceChildren();
    customerReviews.setAttribute('aria-busy', 'false');

    if (!reviews.length) {
      const empty = document.createElement('p');
      empty.className = 'customer-reviews__empty';
      empty.textContent = 'لا توجد آراء منشورة بعد. إذا تعاملت مع الورشة، يسعدنا أن تشاركنا تجربتك.';
      customerReviews.append(empty);
      return;
    }

    reviews.slice(0, 6).forEach((review) => {
      const card = document.createElement('article');
      card.className = 'customer-review';
      const body = document.createElement('p');
      body.className = 'customer-review__body';
      body.textContent = review.body;
      const author = document.createElement('strong');
      author.className = 'customer-review__author';
      author.textContent = review.name;
      const project = galleryAssets.find((asset) => asset.id === review.gallery_id);
      const context = document.createElement('span');
      context.className = 'customer-review__project';
      context.textContent = project ? `عن ${project.title}` : 'من عملائنا';
      card.append(body, author, context);
      customerReviews.append(card);
    });
  };

  const loadCustomerReviews = async () => {
    if (!customerReviews) return;
    customerReviews.setAttribute('aria-busy', 'true');

    try {
      const response = await fetch('/api/comments');
      if (!response.ok) {
        const error = new Error(response.status === 404
          ? 'عرض الآراء غير متاح على هذا العنوان حاليًا.'
          : 'تعذر تحميل الآراء الآن. حاول مرة أخرى لاحقًا.');
        error.status = response.status;
        throw error;
      }
      renderCustomerReviews(await response.json());
    } catch (error) {
      customerReviews.setAttribute('aria-busy', 'false');
      customerReviews.replaceChildren();
      const unavailable = document.createElement('p');
      unavailable.className = 'customer-reviews__empty';
      unavailable.textContent = error.message || 'تعذر تحميل الآراء الآن.';
      customerReviews.append(unavailable);
      if (customerReviewForm && error.status === 404) {
        customerReviewForm.querySelectorAll('input, select, textarea, button').forEach((field) => {
          field.disabled = true;
        });
        customerReviewNote.textContent = 'إرسال الآراء غير متاح على هذا العنوان.';
      }
    }
  };

  loadCustomerReviews();

  let galleryDetailsTrigger = null;
  let galleryDetailsIndex = 0;
  const showGalleryDetails = (item, trigger) => {
    if (!galleryDetailsDialog) return;
    galleryDetailsTrigger = trigger || galleryDetailsTrigger;
    galleryDetailsIndex = Math.max(0, visibleGalleryAssets.findIndex((asset) => asset.id === item.id));
    document.getElementById('galleryDetailsTitle').textContent = item.title;
    document.getElementById('galleryDetailsCategory').textContent = item.category;
    document.getElementById('galleryDetailsDescription').textContent = item.alt;
    const image = document.getElementById('galleryDetailsImage');
    image.src = item.src;
    image.alt = item.alt;
    const counter = document.getElementById('galleryCounter');
    if (counter) counter.textContent = `${galleryDetailsIndex + 1} / ${visibleGalleryAssets.length}`;
    const hasSiblings = visibleGalleryAssets.length > 1;
    if (galleryPrev) galleryPrev.disabled = !hasSiblings;
    if (galleryNext) galleryNext.disabled = !hasSiblings;
    if (!galleryDetailsDialog.open) {
      galleryDetailsDialog.showModal();
      document.getElementById('closeGalleryDetails').focus();
    }
  };

  const stepGallery = (delta) => {
    if (!galleryDetailsDialog || visibleGalleryAssets.length < 2) return;
    galleryDetailsIndex = (galleryDetailsIndex + delta + visibleGalleryAssets.length) % visibleGalleryAssets.length;
    showGalleryDetails(visibleGalleryAssets[galleryDetailsIndex], galleryDetailsTrigger);
  };

  if (galleryGrid) {
    galleryGrid.addEventListener('click', (event) => {
      const detailsButton = event.target.closest('[data-gallery-details]');
      if (detailsButton) {
        const item = galleryAssets.find((asset) => asset.id === detailsButton.dataset.galleryDetails);
        if (item) showGalleryDetails(item, detailsButton);
        return;
      }

      const commentsButton = event.target.closest('[data-comments-for]');
      if (!commentsButton || !commentsDialog) return;
      const item = galleryAssets.find((asset) => asset.id === commentsButton.dataset.commentsFor);
      if (!item) return;

      document.getElementById('galleryCommentTitle').textContent = item.title;
      const preview = document.getElementById('galleryCommentImage');
      preview.src = item.src;
      preview.alt = item.alt;
      commentForm.dataset.galleryId = item.id;
      commentNote.textContent = '';
      commentForm.reset();
      commentsDialog.showModal();
      loadComments(item.id);
    });
  }

  if (galleryDetailsDialog) {
    document.getElementById('closeGalleryDetails').addEventListener('click', () => galleryDetailsDialog.close());
    galleryDetailsDialog.addEventListener('click', (event) => {
      if (event.target === galleryDetailsDialog) galleryDetailsDialog.close();
    });
    galleryDetailsDialog.addEventListener('close', () => galleryDetailsTrigger?.focus());
    galleryDetailsDialog.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        stepGallery(1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        stepGallery(-1);
      }
    });
    galleryPrev?.addEventListener('click', () => stepGallery(-1));
    galleryNext?.addEventListener('click', () => stepGallery(1));
    document.getElementById('galleryDetailsEnquire').addEventListener('click', () => galleryDetailsDialog.close());
  }

  if (commentsDialog) {
    document.getElementById('closeGalleryComments').addEventListener('click', () => commentsDialog.close());
    commentsDialog.addEventListener('click', (event) => {
      if (event.target === commentsDialog) commentsDialog.close();
    });
  }

  const bindCommentForm = (targetForm, note, getGalleryId) => {
    if (!targetForm || !note) return;

    targetForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = targetForm.querySelector('button[type="submit"]');
      const formData = new FormData(targetForm);
      submit.disabled = true;
      note.textContent = 'جار إرسال رأيك للمراجعة…';
      try {
        const response = await fetch('/api/comments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            galleryId: getGalleryId(),
            name: formData.get('name'),
            body: formData.get('body')
          })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'تعذر إرسال الرأي.');
        note.textContent = result.message;
        targetForm.reset();
      } catch (error) {
        note.textContent = error instanceof TypeError
          ? 'تعذر الاتصال بالخادم. حاول لاحقًا.'
          : error.message;
      } finally {
        submit.disabled = false;
      }
    });
  };

  bindCommentForm(commentForm, commentNote, () => commentForm.dataset.galleryId);
  bindCommentForm(customerReviewForm, customerReviewNote, () => (
    customerReviewForm.elements.namedItem('galleryId').value
  ));

  const setHeaderState = () => {
    const y = window.scrollY || window.pageYOffset;
    if (header) {
      header.classList.toggle('is-scrolled', y > 24);
    }

    if (toTop) {
      toTop.classList.toggle('is-visible', y > 420);
    }

    if (scrollProgress) {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const progress = maxScroll > 0 ? (y / maxScroll) * 100 : 0;
      scrollProgress.style.width = `${progress}%`;
    }
  };

  const setActiveNav = () => {
    const sections = [...document.querySelectorAll('main section[id], section[id]')];
    const offset = 140;
    let current = 'home';

    sections.forEach((section) => {
      const rect = section.getBoundingClientRect();
      if (rect.top <= offset && rect.bottom >= offset) {
        current = section.id || 'home';
      }
    });

    navLinks.forEach((link) => {
      const isActive = link.getAttribute('href') === `#${current}`;
      link.classList.toggle('is-active', isActive);
    });
  };

  renderGallery();

  if (burger && nav) {
    const setMenuOpen = (isOpen) => {
      nav.classList.toggle('is-open', isOpen);
      burger.setAttribute('aria-expanded', String(isOpen));
      burger.setAttribute('aria-label', isOpen ? 'إغلاق القائمة' : 'فتح القائمة');
    };

    burger.addEventListener('click', () => {
      setMenuOpen(burger.getAttribute('aria-expanded') !== 'true');
    });

    navLinks.forEach((link) => {
      link.addEventListener('click', () => setMenuOpen(false));
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && nav.classList.contains('is-open')) {
        setMenuOpen(false);
        burger.focus();
      }
    });
  }

  if (customerAuthDialog && customerLoginForm && customerLoginNote) {
    const loginView = document.getElementById('customerLoginView');
    const registerView = document.getElementById('customerRegisterView');
    const accountView = document.getElementById('customerAccountView');
    const showCustomerView = (view) => {
      loginView.hidden = view !== loginView;
      registerView.hidden = view !== registerView;
      accountView.hidden = view !== accountView;
      customerAuthDialog.setAttribute('aria-labelledby', view.querySelector('h2').id);
    };

    const renderCustomerOrders = (orders) => {
      customerOrdersList.replaceChildren();
      if (!orders.length) {
        const empty = document.createElement('p');
        empty.className = 'customer-orders__empty';
        empty.textContent = 'لا توجد طلبات مرتبطة بحسابك بعد. يمكنك إرسال طلب من نموذج تواصل معنا.';
        customerOrdersList.append(empty);
        return;
      }

      orders.forEach((order) => {
        const card = document.createElement('article');
        card.className = 'customer-order';
        const heading = document.createElement('div');
        heading.className = 'customer-order__heading';
        const title = document.createElement('strong');
        title.textContent = `طلب رقم ${order.id}`;
        const status = document.createElement('span');
        status.className = 'customer-order__status';
        status.textContent = customerStatusLabels[order.status] || order.status;
        heading.append(title, status);
        const message = document.createElement('p');
        message.textContent = order.message;
        const date = document.createElement('time');
        date.dateTime = order.created_at;
        date.textContent = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(new Date(order.created_at));
        card.append(heading, message, date);
        customerOrdersList.append(card);
      });
    };

    const loadCustomerAccount = async () => {
      const response = await fetch('/api/customer/session', { credentials: 'same-origin' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'تعذر تحميل الحساب.');
      customerAccount = result.authenticated ? result.customer : null;
      document.getElementById('customerAccountOpen').textContent = customerAccount
        ? `حسابي · ${customerAccount.name}`
        : 'دخول العملاء';
      if (!customerAccount) return;
      prefillContactForm();

      document.getElementById('customerAccountName').textContent =
        `${customerAccount.name} · ${customerAccount.email}`;
      document.getElementById('cf-name').value = customerAccount.name;
      document.getElementById('cf-phone').value = customerAccount.phone;
      const ordersResponse = await fetch('/api/customer/orders', { credentials: 'same-origin' });
      const orders = await ordersResponse.json().catch(() => ({}));
      if (!ordersResponse.ok) throw new Error(orders.error || 'تعذر تحميل طلباتك.');
      renderCustomerOrders(orders);
    };

    document.getElementById('customerAccountOpen').addEventListener('click', async () => {
      customerLoginNote.textContent = '';
      customerRegisterNote.textContent = '';
      customerOrdersNote.textContent = '';
      try {
        await loadCustomerAccount();
        showCustomerView(customerAccount ? accountView : loginView);
      } catch (error) {
        showCustomerView(customerAccount ? accountView : loginView);
        (customerAccount ? customerOrdersNote : customerLoginNote).textContent = error.message;
      }
      customerAuthDialog.showModal();
    });

    document.getElementById('customerAuthClose').addEventListener('click', () => customerAuthDialog.close());
    customerAuthDialog.addEventListener('click', (event) => {
      if (event.target === customerAuthDialog) customerAuthDialog.close();
    });
    document.getElementById('showCustomerRegister').addEventListener('click', () => {
      customerLoginNote.textContent = '';
      showCustomerView(registerView);
    });
    document.getElementById('showCustomerLogin').addEventListener('click', () => {
      customerRegisterNote.textContent = '';
      showCustomerView(loginView);
    });

    const submitCustomerAuth = async ({ form: authForm, endpoint, note, submitId }) => {
      note.textContent = '';
      const submit = document.getElementById(submitId);
      submit.disabled = true;
      const values = Object.fromEntries(new FormData(authForm).entries());
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'تعذر إكمال الطلب.');
        customerAccount = result.customer;
        authForm.reset();
        await loadCustomerAccount();
        showCustomerView(accountView);
      } catch (error) {
        note.textContent = error instanceof TypeError
          ? 'تعذر الاتصال بالخادم. افتحي الموقع من عنوانه المحلي أو المستضاف.'
          : error.message;
      } finally {
        submit.disabled = false;
      }
    };

    customerLoginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      submitCustomerAuth({
        form: customerLoginForm,
        endpoint: '/api/customer/login',
        note: customerLoginNote,
        submitId: 'customerLoginSubmit'
      });
    });

    customerRegisterForm.addEventListener('submit', (event) => {
      event.preventDefault();
      submitCustomerAuth({
        form: customerRegisterForm,
        endpoint: '/api/customer/register',
        note: customerRegisterNote,
        submitId: 'customerRegisterSubmit'
      });
    });

    document.getElementById('customerLogout').addEventListener('click', async () => {
      customerOrdersNote.textContent = '';
      try {
        const response = await fetch('/api/customer/logout', {
          method: 'POST',
          credentials: 'same-origin'
        });
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw new Error(result.error || 'تعذر تسجيل الخروج.');
        }
        customerAccount = null;
        document.getElementById('customerAccountOpen').textContent = 'دخول العملاء';
        document.getElementById('cf-name').value = '';
        document.getElementById('cf-phone').value = '';
        showCustomerView(loginView);
      } catch (error) {
        customerOrdersNote.textContent = error.message;
      }
    });

    loadCustomerAccount().catch((error) => {
      customerLoginNote.textContent = error.message;
    });
    refreshCustomerAccountOrders = loadCustomerAccount;
  }

  const toTopButton = document.getElementById('toTop');
  if (toTopButton) {
    toTopButton.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
  }

  window.addEventListener('scroll', () => {
    setHeaderState();
    setActiveNav();
  }, { passive: true });

  window.addEventListener('load', () => {
    setHeaderState();
    setActiveNav();
  });

  document.querySelectorAll('[data-idea-message]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!form || !formNote) return;
      const message = form.querySelector('#cf-msg');
      if (!message) return;
      message.value = button.dataset.ideaMessage || '';
      message.dispatchEvent(new Event('input', { bubbles: true }));
      formNote.textContent = 'جهّزنا بداية الطلب؛ عدّل المقاس والخامة ثم أرسل.';
      document.getElementById('contact')?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'center'
      });
      message.focus({ preventScroll: true });
    });
  });

  if (form && formNote) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = form.querySelector('#cf-name');
      const phone = form.querySelector('#cf-phone');
      const message = form.querySelector('#cf-msg');
      if (!name || !phone || !message) return;

      const fields = [name, phone, message];
      const valid = [name.value.trim().length >= 2, phone.value.trim().length >= 7, message.value.trim().length >= 5];
      fields.forEach((field, index) => field.setAttribute('aria-invalid', String(!valid[index])));
      if (valid.some((isValid) => !isValid)) {
        formNote.textContent = 'راجع الاسم ورقم الهاتف وتفاصيل المشروع قبل الإرسال.';
        fields[valid.findIndex((isValid) => !isValid)]?.focus();
        return;
      }

      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      form.setAttribute('aria-busy', 'true');
      formNote.textContent = 'جار إرسال تفاصيل مشروعك…';
      try {
        const response = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.value.trim(), phone: phone.value.trim(), message: message.value.trim() })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'تعذر إرسال تفاصيل المشروع.');
        formNote.textContent = 'تم تسجيل طلبك. نراجع التفاصيل ونتواصل معك لمناقشة الخطوة التالية.';
        form.reset();
        fields.forEach((field) => field.removeAttribute('aria-invalid'));
        // نعيد بيانات العميل المسجل ونحدّث سجل طلباته ليشمل الطلب الجديد.
        prefillContactForm();
        if (customerAccount) refreshCustomerAccountOrders?.().catch(() => {});
      } catch (error) {
        formNote.textContent = error instanceof TypeError
          ? 'تعذر الاتصال بالورشة الآن. احتفظنا بتفاصيلك في النموذج؛ تحقق من الاتصال ثم أعد المحاولة.'
          : error.message;
      } finally {
        submit.disabled = false;
        form.removeAttribute('aria-busy');
      }
    });

    form.querySelectorAll('input, textarea').forEach((field) => {
      field.addEventListener('input', () => field.removeAttribute('aria-invalid'));
    });
  }

  setHeaderState();
  setActiveNav();
});
