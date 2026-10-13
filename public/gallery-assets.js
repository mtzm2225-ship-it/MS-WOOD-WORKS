(() => {
  const imageBase = new URL('img/', document.currentScript.src);
  const defineAsset = (id, filename, title, alt, category, featured = false) => ({
    id,
    title,
    alt,
    category,
    featured,
    src: new URL(filename, imageBase).href
  });

  // Keep historical image IDs available for existing customer comments in the admin.
  const assets = [
    defineAsset('walnut-desk', 'WhatsApp Image 2026-10-12 at 11.46.46 AM.jpeg', 'مساحة بطابع MS', 'تصميم لغرفة معيشة خشبية ضمن صورة تعريفية بعلامة MS', 'رؤية التصميم', true),
    defineAsset('workshop-details', 'WhatsApp Image 2026-10-12 at 11.46.46 AM (1).jpeg', 'هوية MS قريبًا', 'ملصق تشويقي يحمل شعار MS Woodworks وعبارة قريبًا', 'هوية العلامة'),
    defineAsset('custom-boards', 'WhatsApp Image 2026-10-12 at 11.46.46 AM (2).jpeg', 'تفاصيل هوية MS', 'تصميم ترويجي لعلامة MS Woodworks داخل مساحة خشبية', 'هوية العلامة', true),
    defineAsset('fine-interior', 'WhatsApp Image 2026-10-12 at 11.46.46 AM (3).jpeg', 'أعمال جديدة قريبًا', 'ملصق تشويقي يحمل شعار MS Woodworks وعبارة قريبًا', 'هوية العلامة'),
    defineAsset('hand-finish', 'WhatsApp Image 2026-10-12 at 11.46.46 AM (4).jpeg', 'غرفة نوم من الجوز', 'غرفة نوم بتصميم خشبي داكن وإضاءة دافئة', 'أثاث حسب الطلب', true),
    defineAsset('craft-detail', 'WhatsApp Image 2026-10-12 at 11.46.47 AM.jpeg', 'مكتب تنفيذي من الجوز', 'مكتب تنفيذي خشبي داخل مساحة عمل فاخرة', 'أثاث تنفيذي'),
    defineAsset('wood-detail', 'WhatsApp Image 2026-10-12 at 11.46.47 AM (1).jpeg', 'تفاصيل المكتب التنفيذي', 'تصميم عمودي لمكتب تنفيذي خشبي مع واجهة تطبيق ظاهرة أسفل الصورة', 'أثاث تنفيذي'),
    defineAsset('modern-space', 'WhatsApp Image 2026-10-12 at 11.46.47 AM (2).jpeg', 'مساحة نوم معاصرة', 'غرفة نوم خشبية بإضاءة دافئة ضمن لقطة شاشة مصورة', 'ديكور داخلي'),
    defineAsset('brand-story', 'MS Woodworks_ Crafted in Warmth.png', 'صُنعنا فتميزنا', 'الهوية البصرية لمجموعة MS Woodworks Crafted in Warmth', 'هوية العلامة'),
    defineAsset('executive-walnut', 'Gemini_Generated_Image_98tp7s98tp7s98tp.jpeg', 'مكتب جوز فاخر', 'مكتب تنفيذي من خشب داكن في مساحة عمل مضاءة طبيعيًا', 'أثاث تنفيذي'),
    defineAsset('brand-mark', 'Gemini_Generated_Image_rm6yb4rm6yb4rm6y.jpeg', 'شعار MS Woodworks', 'الشعار الخشبي الكامل لعلامة MS Woodworks', 'هوية العلامة')
  ];

  window.MSWoodGalleryAssets = Object.freeze({
    gallery: Object.freeze(assets.filter((asset) => asset.featured)),
    byId: Object.freeze(Object.fromEntries(assets.map((asset) => [asset.id, asset])))
  });
})();
