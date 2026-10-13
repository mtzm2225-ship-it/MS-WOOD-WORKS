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
  const socialPosts = document.getElementById('socialPosts');
  const commentsDialog = document.getElementById('galleryComments');
  const commentForm = document.getElementById('galleryCommentForm');
  const commentList = document.getElementById('galleryCommentList');
  const commentNote = document.getElementById('galleryCommentNote');

  const galleryAssets = [
    { id: 'walnut-desk', src: 'img/WhatsApp Image 2026-10-12 at 11.46.46 AM.jpeg', alt: 'مكتب خشبي فاخر', category: 'أثاث فاخر', title: 'مكتب الجوز التنفيذي' },
    { id: 'workshop-details', src: 'img/WhatsApp Image 2026-10-12 at 11.46.46 AM (1).jpeg', alt: 'تفاصيل النجارة داخل الورشة', category: 'الورشة', title: 'تفاصيل الصنعة' },
    { id: 'custom-boards', src: 'img/WhatsApp Image 2026-10-12 at 11.46.46 AM (2).jpeg', alt: 'قطع خشبية مخصصة', category: 'تصميم', title: 'ألواح مخصصة' },
    { id: 'fine-interior', src: 'img/WhatsApp Image 2026-10-12 at 11.46.46 AM (3).jpeg', alt: 'أثاث خشبي فاخر', category: 'ديكور', title: 'لمسات فاخرة' },
    { id: 'hand-finish', src: 'img/WhatsApp Image 2026-10-12 at 11.46.46 AM (4).jpeg', alt: 'تفاصيل تشطيب الخشب', category: 'تشطيب', title: 'تلميع يدوي' },
    { id: 'craft-detail', src: 'img/WhatsApp Image 2026-10-12 at 11.46.47 AM.jpeg', alt: 'حرفة النجارة', category: 'الحِرفة', title: 'دقة التنفيذ' },
    { id: 'wood-detail', src: 'img/WhatsApp Image 2026-10-12 at 11.46.47 AM (1).jpeg', alt: 'قطع خشبية جاهزة للتشطيب', category: 'الحرفية', title: 'الخشب يميل للتفاصيل' },
    { id: 'modern-space', src: 'img/WhatsApp Image 2026-10-12 at 11.46.47 AM (2).jpeg', alt: 'أثاث خشبي داخل مسرح منزلي', category: 'تجهيز', title: 'مساحات معاصرة' },
    { id: 'brand-story', src: 'img/MS Woodworks_ Crafted in Warmth.png', alt: 'هوية MS Woodworks', category: 'الهوية', title: 'صنعنا فتميزنا' },
    { id: 'executive-walnut', src: 'img/Gemini_Generated_Image_98tp7s98tp7s98tp.jpeg', alt: 'أثاث تنفيذي من الجوز الداكن', category: 'تنفيذي', title: 'مكتب جوز فاخر' },
    { id: 'brand-mark', src: 'img/Gemini_Generated_Image_rm6yb4rm6yb4rm6y.jpeg', alt: 'شعار MS Woodworks', category: 'العلامة', title: 'هوية الحِرفة' }
  ];

  // نستخدم مستمعًا واحدًا للمعرض لأن بطاقاته تُنشأ ديناميكيًا.
  const renderGallery = () => {
    if (!galleryGrid) return;

    galleryGrid.innerHTML = galleryAssets.map((item, index) => {
      const wide = index % 4 === 0 || index % 5 === 0 ? 'tile--wide' : '';
      return `
        <figure class="tile ${wide} reveal" data-delay="${(index % 5) + 1}">
          <img src="${item.src}" alt="${item.alt}" loading="lazy" />
          <figcaption class="tile__cap">
            <span class="tile__cat">${item.category}</span>
            <h3 class="tile__title">${item.title}</h3>
            <span class="tile__more">شاهد التفاصيل <i>→</i></span>
            <button class="tile__comment" type="button" data-comments-for="${item.id}">تعليقات العملاء</button>
          </figcaption>
        </figure>
      `;
    }).join('');

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

  if (commentForm && commentNote) {
    commentForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = commentForm.querySelector('button[type="submit"]');
      const formData = new FormData(commentForm);
      submit.disabled = true;
      commentNote.textContent = '';
      try {
        const response = await fetch('/api/comments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            galleryId: commentForm.dataset.galleryId,
            name: formData.get('name'),
            body: formData.get('body')
          })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'تعذر إرسال التعليق.');
        commentNote.textContent = result.message;
        commentForm.reset();
      } catch (error) {
        commentNote.textContent = error instanceof TypeError
          ? 'تعذر الاتصال بالخادم. حاول لاحقًا.'
          : error.message;
      } finally {
        submit.disabled = false;
      }
    });
  }

  const renderSocialPosts = () => {
    if (!socialPosts) return;

    socialPosts.innerHTML = galleryAssets.slice(0, 3).map((item, index) => {
      const textMap = [
        'لمسات أخيرة على مكتب جوز مخصص لعميل في القاهرة. ♥ 128',
        'صباح آخر داخل الورشة… حبة خشب جديدة تنتظر قرارها. ♥ 94',
        'التوقيع على كل قطعة: MS — حين يتحدث الاسم عن الصنعة. ♥ 152'
      ];

      return `
        <li class="fb__post">
          <div class="fb__post-img"><img src="${item.src}" alt="${item.alt}" loading="lazy" /></div>
          <p>${textMap[index] || 'منشور جديد من الورشة. ♥ 120'}</p>
        </li>
      `;
    }).join('');
  };

  const syncFeatureImages = () => {
    const workshopImage = document.querySelector('.workshop__media img');
    const coverImage = document.querySelector('.fb__cover img');

    if (workshopImage && galleryAssets[1]) workshopImage.src = galleryAssets[1].src;
    if (coverImage && galleryAssets[9]) coverImage.src = galleryAssets[9].src;
  };

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
  renderSocialPosts();
  syncFeatureImages();

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
