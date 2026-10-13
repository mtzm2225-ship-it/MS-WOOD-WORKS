document.addEventListener('DOMContentLoaded', () => {
  const preloader = document.getElementById('preloader');
  const scrollProgress = document.getElementById('scrollProgress');
  const burger = document.getElementById('burger');
  const nav = document.getElementById('nav');
  const header = document.getElementById('header');
  const toTop = document.getElementById('toTop');
  const revealEls = document.querySelectorAll('.reveal');
  const navLinks = document.querySelectorAll('.nav__link');
  const counters = document.querySelectorAll('[data-count]');
  const form = document.getElementById('contactForm');
  const formNote = document.getElementById('formNote');
  const galleryGrid = document.getElementById('galleryGrid');
  const customerReviews = document.getElementById('customerReviews');
  const customerReviewForm = document.getElementById('customerReviewForm');
  const customerReviewNote = document.getElementById('customerReviewNote');
  const commentsDialog = document.getElementById('galleryComments');
  const commentForm = document.getElementById('galleryCommentForm');
  const commentList = document.getElementById('galleryCommentList');
  const commentNote = document.getElementById('galleryCommentNote');
  const adminLoginDialog = document.getElementById('adminLoginDialog');
  const adminLoginForm = document.getElementById('adminLoginForm');
  const adminLoginNote = document.getElementById('adminLoginNote');

  const galleryAssets = window.MSWoodGalleryAssets.gallery;
  const reservedPhotoSlots = 2;

  if (customerReviewForm) {
    const projectSelect = customerReviewForm.elements.namedItem('galleryId');
    galleryAssets.forEach((asset) => {
      const option = document.createElement('option');
      option.value = asset.id;
      option.textContent = asset.title;
      projectSelect.append(option);
    });
  }

  // نستخدم مستمعًا واحدًا للمعرض لأن بطاقاته تُنشأ ديناميكيًا.
  const renderGallery = () => {
    if (!galleryGrid) return;

    galleryGrid.classList.add('gallery__grid--curated');
    const layouts = ['tile--feature', 'tile--side', 'tile--side'];
    const photoTiles = galleryAssets.map((item, index) => {
      return `
        <figure class="tile ${layouts[index] || 'tile--small'} reveal" data-delay="${(index % 5) + 1}">
          <img src="${item.src}" alt="${item.alt}" loading="lazy" />
          <figcaption class="tile__cap">
            <span class="tile__cat">${item.category}</span>
            <h3 class="tile__title">${item.title}</h3>
            <span class="tile__more">شاهد التفاصيل <i>→</i></span>
            <button class="tile__comment" type="button" data-comments-for="${item.id}">تعليقات العملاء</button>
          </figcaption>
        </figure>
      `;
    });
    const emptyTiles = Array.from(
      { length: Math.max(0, reservedPhotoSlots) },
      (_, index) => `<figure class="tile tile--empty" aria-label="مكان مخصص لصورة مشروع قادم"><span>مشروع قادم <b>0${index + 1}</b></span></figure>`
    );
    galleryGrid.innerHTML = [...photoTiles, ...emptyTiles].join('');

    const revealItems = galleryGrid.querySelectorAll('.reveal');
    revealItems.forEach((el) => {
      const delay = Number(el.dataset.delay || 0);
      el.style.setProperty('--delay', delay);
      revealObserver.observe(el);
    });
  };

  const renderComments = (comments) => {
    commentList.replaceChildren();
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
    commentList.textContent = 'جار تحميل التعليقات...';
    try {
      const response = await fetch(`/api/comments/${encodeURIComponent(galleryId)}`);
      const comments = await response.json();
      if (!response.ok) throw new Error(comments.error || 'تعذر تحميل التعليقات.');
      renderComments(comments);
    } catch {
      commentList.textContent = 'تعذر تحميل التعليقات الآن. تأكد من فتح الموقع من الخادم.';
    }
  };

  const renderCustomerReviews = (reviews) => {
    if (!customerReviews) return;
    customerReviews.replaceChildren();

    if (!reviews.length) {
      const empty = document.createElement('p');
      empty.className = 'customer-reviews__empty';
      empty.textContent = 'لا توجد آراء منشورة حتى الآن. يسعدنا أن تشاركنا تجربتك بعد مشاهدة أعمالنا.';
      customerReviews.append(empty);
      return;
    }

    reviews.slice(0, 6).forEach((review) => {
      const card = document.createElement('article');
      card.className = 'customer-review';

      const mark = document.createElement('span');
      mark.className = 'customer-review__mark';
      mark.setAttribute('aria-hidden', 'true');
      mark.textContent = '”';

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

      card.append(mark, body, author, context);
      customerReviews.append(card);
    });
  };

  const loadCustomerReviews = async () => {
    if (!customerReviews) return;

    try {
      const response = await fetch('/api/comments');
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('هذه النسخة لا تشغّل خادم الموقع؛ يلزم ربطها بالـBackend لعرض الآراء واستقبالها.');
        }
        throw new Error('تعذر الاتصال بخدمة الآراء. افتح الموقع من عنوان الاستضافة المرتبط بالخادم.');
      }

      const reviews = await response.json();
      renderCustomerReviews(reviews);
    } catch (error) {
      customerReviews.replaceChildren();
      const unavailable = document.createElement('p');
      unavailable.className = 'customer-reviews__empty';
      unavailable.textContent = error.message || 'تعذر تحميل آراء العملاء الآن.';
      customerReviews.append(unavailable);

      if (customerReviewForm) {
        customerReviewForm.querySelectorAll('input, select, textarea, button').forEach((field) => {
          field.disabled = true;
        });
        customerReviewNote.textContent = 'إرسال الرأي غير متاح حتى يتم ربط الموقع بالخادم.';
      }
    }
  };

  loadCustomerReviews();

  if (galleryGrid && commentsDialog) {
    // هذا المستمع الواحد يتعامل مع أزرار التعليقات لكل الصور.
    galleryGrid.addEventListener('click', (event) => {
      const button = event.target.closest('[data-comments-for]');
      if (!button) return;
      const item = galleryAssets.find((asset) => asset.id === button.dataset.commentsFor);
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
      note.textContent = '';
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
        if (!response.ok) throw new Error(result.error || 'تعذر إرسال التعليق.');
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

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  revealEls.forEach((el) => {
    const delay = Number(el.dataset.delay || 0);
    el.style.setProperty('--delay', delay);
    revealObserver.observe(el);
  });

  renderGallery();

  const animateCounter = (element) => {
    const target = Number(element.dataset.count || 0);
    const duration = 1100;
    const start = performance.now();

    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.floor(target * eased);
      element.textContent = value;
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        element.textContent = target;
      }
    };

    requestAnimationFrame(tick);
  };

  counters.forEach((counter) => {
    if (!counter.dataset.animated) {
      counter.dataset.animated = 'true';
      const observer = new IntersectionObserver(
        (entries, obs) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              animateCounter(entry.target);
              obs.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.5 }
      );
      observer.observe(counter);
    }
  });

  if (burger && nav) {
    burger.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', String(isOpen));
    });

    navLinks.forEach((link) => {
      link.addEventListener('click', () => {
        nav.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  if (adminLoginDialog && adminLoginForm && adminLoginNote) {
    document.getElementById('adminLoginOpen').addEventListener('click', () => {
      adminLoginNote.textContent = '';
      adminLoginDialog.showModal();
    });

    document.getElementById('adminLoginClose').addEventListener('click', () => {
      adminLoginDialog.close();
    });

    adminLoginDialog.addEventListener('click', (event) => {
      if (event.target === adminLoginDialog) adminLoginDialog.close();
    });

    adminLoginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      adminLoginNote.textContent = '';
      const submit = document.getElementById('adminLoginSubmit');
      submit.disabled = true;
      const formData = new FormData(adminLoginForm);

      try {
        const response = await fetch('/api/admin/login', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formData.get('email'),
            password: formData.get('password')
          })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'تعذر تسجيل الدخول.');
        window.location.assign('/admin');
      } catch (error) {
        adminLoginNote.textContent = error instanceof TypeError
          ? 'تعذر الاتصال بالخادم. افتحي الموقع من عنوانه المحلي أو المستضاف.'
          : error.message;
        submit.disabled = false;
      }
    });
  }

  const toTopButton = document.getElementById('toTop');
  if (toTopButton) {
    toTopButton.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  window.addEventListener('scroll', () => {
    setHeaderState();
    setActiveNav();
  }, { passive: true });

  window.addEventListener('load', () => {
    setHeaderState();
    setActiveNav();

    if (preloader) {
      setTimeout(() => {
        preloader.classList.add('is-hidden');
      }, 450);
    }
  });

  if (form && formNote) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const name = form.querySelector('#cf-name');
      const phone = form.querySelector('#cf-phone');
      const message = form.querySelector('#cf-msg');

      if (!name || !phone || !message) {
        formNote.textContent = 'يرجى تعبئة جميع الحقول.';
        return;
      }

      const dataValid = name.value.trim().length >= 2 && phone.value.trim().length >= 7 && message.value.trim().length >= 5;

      if (!dataValid) {
        formNote.textContent = 'أدخل الاسم ورقم الهاتف وتفاصيل المشروع بشكل صحيح.';
        return;
      }

      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      formNote.textContent = 'جار إرسال طلبك...';
      try {
        const response = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.value.trim(), phone: phone.value.trim(), message: message.value.trim() })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'تعذر تسجيل الطلب.');
        formNote.textContent = 'تم تسجيل طلبك بنجاح. سنتواصل معك قريبًا.';
        form.reset();
      } catch (error) {
        formNote.textContent = error instanceof TypeError
          ? 'تعذر الاتصال بالخادم. حاول مرة أخرى لاحقًا.'
          : error.message;
      } finally {
        submit.disabled = false;
      }
    });
  }

  setHeaderState();
  setActiveNav();
});
