/*
 * Shared gallery metadata for the storefront and admin comment references.
 * Historical IDs must remain stable even when an asset is no longer featured.
 */
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

  const assets = [
    defineAsset('walnut-desk', 'WhatsApp Image 2026-10-12 at 11.46.46 AM.jpeg', 'مساحة بطابع MS', 'تصميم ترويجي لعلامة MS Woodworks داخل مساحة معيشة خشبية', 'هوية العلامة'),
    defineAsset('workshop-details', 'WhatsApp Image 2026-10-12 at 11.46.46 AM (1).jpeg', 'هوية MS قريبًا', 'ملصق تشويقي يحمل شعار MS Woodworks وعبارة قريبًا', 'هوية العلامة'),
    defineAsset('custom-boards', 'WhatsApp Image 2026-10-12 at 11.46.46 AM (2).jpeg', 'تفاصيل هوية MS', 'تصميم ترويجي لعلامة MS Woodworks داخل مساحة خشبية', 'هوية العلامة'),
    defineAsset('fine-interior', 'WhatsApp Image 2026-10-12 at 11.46.46 AM (3).jpeg', 'أعمال جديدة قريبًا', 'ملصق تشويقي يحمل شعار MS Woodworks وعبارة قريبًا', 'هوية العلامة'),
    defineAsset('hand-finish', 'WhatsApp Image 2026-10-12 at 11.46.46 AM (4).jpeg', 'تفاصيل مكتب تنفيذي', 'تصوّر تصميمي لمكتب تنفيذي ومكتبة جوز في مساحة عمل', 'تصوّر تصميمي'),
    defineAsset('craft-detail', 'WhatsApp Image 2026-10-12 at 11.46.47 AM.jpeg', 'مكتب تنفيذي بتفاصيل خشبية', 'تصوّر تصميمي لمكتب تنفيذي وأرفف خشبية بإضاءة دافئة', 'تصوّر تصميمي', true),
    defineAsset('wood-detail', 'WhatsApp Image 2026-10-12 at 11.46.47 AM (1).jpeg', 'تفاصيل المكتب التنفيذي', 'تصميم عمودي لمكتب تنفيذي مع عناصر واجهة تطبيق ظاهرة أسفل الصورة', 'هوية العلامة'),
    defineAsset('modern-space', 'WhatsApp Image 2026-10-12 at 11.46.47 AM (2).jpeg', 'غرفة نوم بتصميم خشبي', 'تصوّر تصميمي لغرفة نوم معاصرة يغلب عليها الخشب الداكن', 'تصوّر تصميمي', true),
    defineAsset('brand-story', 'MS Woodworks_ Crafted in Warmth.png', 'صُنعنا فتميزنا', 'الهوية البصرية لمجموعة MS Woodworks Crafted in Warmth', 'هوية العلامة'),
    defineAsset('executive-walnut', 'Gemini_Generated_Image_98tp7s98tp7s98tp.jpeg', 'مكتب تنفيذي من الجوز', 'تصوّر تصميمي لمكتب تنفيذي من خشب داكن في مساحة عمل', 'تصوّر تصميمي', true),
    defineAsset('brand-mark', 'Gemini_Generated_Image_rm6yb4rm6yb4rm6y.jpeg', 'شعار MS Woodworks', 'الشعار الخشبي الكامل لعلامة MS Woodworks', 'هوية العلامة')
  ];

  window.MSWoodGalleryAssets = Object.freeze({
    gallery: Object.freeze(assets.filter((asset) => asset.featured)),
    byId: Object.freeze(Object.fromEntries(assets.map((asset) => [asset.id, asset])))
  });
})();
