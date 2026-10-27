/*
 * Shared gallery metadata for the storefront and admin comment references.
 * Historical IDs must remain stable even when an asset is no longer featured.
 * The same file is loaded by the browser (window.MSWoodGalleryAssets) and by the
 * server (module.exports) so comment requests can only reference real images.
 */
(() => {
  const imageBase = typeof document !== 'undefined' && document.currentScript
    ? new URL('img/', document.currentScript.src)
    : null;
  const defineAsset = (id, filename, title, alt, category, featured = false) => ({
    id,
    title,
    alt,
    category,
    featured,
    src: imageBase ? new URL(filename, imageBase).href : filename
  });

  const assets = [
    defineAsset('dining-table', 'ms-dining-table.jpg', 'طاولة طعام من خشب البلوط', 'تصوّر تصميمي لطاولة طعام من البلوط الطبيعي بستة كراسي وإضاءة نحاسية دافئة', 'طاولات طعام', true),
    defineAsset('bedroom-walnut', 'ms-bedroom-walnut.jpg', 'غرفة نوم بجوز داكن', 'تصوّر تصميمي لغرفة نوم رئيسية بسرير جوز داكن ووحدات جانبية مدمجة', 'غرف نوم', true),
    defineAsset('majlis', 'ms-majlis.jpg', 'مجلس بمعاصر خشبية', 'تصوّر تصميمي لمجلس معاصر بجلسات منخفضة وفاصل من المشربية الخشبية', 'معيشة ومجالس', true),
    defineAsset('kitchen-walnut', 'ms-kitchen-walnut.jpg', 'مطبخ بجوز وتفاصيل نحاسية', 'تصوّر تصميمي لمطبخ بوحدات جوز داكن ومقابض نحاسية وسطح رخامي', 'مطابخ', true),
    defineAsset('library-unit', 'ms-library-unit.jpg', 'وحدة مكتبة وتخزين جدارية', 'تصوّر تصميمي لوحدة مكتبة وتخزين من الجوز الداكن بإضاءة أرفف مدمجة', 'وحدات تخزين', true),
    defineAsset('executive-walnut', 'Gemini_Generated_Image_98tp7s98tp7s98tp.jpeg', 'مكتب تنفيذي من الجوز', 'تصوّر تصميمي لمكتب تنفيذي من خشب داكن في مساحة عمل', 'مكاتب', true),
    defineAsset('craft-detail', 'WhatsApp Image 2026-10-12 at 11.46.47 AM.jpeg', 'مكتب تنفيذي بتفاصيل خشبية', 'تصوّر تصميمي لمكتب تنفيذي وأرفف خشبية بإضاءة دافئة', 'مكاتب', true),
    defineAsset('modern-space', 'WhatsApp Image 2026-10-12 at 11.46.47 AM (2).jpeg', 'غرفة نوم بتصميم خشبي', 'تصوّر تصميمي لغرفة نوم معاصرة يغلب عليها الخشب الداكن', 'غرف نوم', true),
    defineAsset('console-entry', 'ms-console-entry.jpg', 'كونسول مدخل من الجوز', 'تصوّر تصميمي لطاولة كونسول جوز عند المدخل مع مرآة نحاسية وإضاءة دافئة', 'مداخل وكونسول', true),
    defineAsset('craft-hands', 'ms-craft-hands.jpg', 'يدا الحرفي على الخشب', 'صورة قريبة ليد حرفي تسوي سطح خشب الجوز داخل الورشة', 'تفاصيل الصنعة', true),
    defineAsset('walnut-desk', 'WhatsApp Image 2026-10-12 at 11.46.46 AM.jpeg', 'مساحة بطابع MS', 'تصميم ترويجي لعلامة MS Woodworks داخل مساحة معيشة خشبية', 'هوية العلامة'),
    defineAsset('workshop-details', 'WhatsApp Image 2026-10-12 at 11.46.46 AM (1).jpeg', 'هوية MS قريبًا', 'ملصق تشويقي يحمل شعار MS Woodworks وعبارة قريبًا', 'هوية العلامة'),
    defineAsset('custom-boards', 'WhatsApp Image 2026-10-12 at 11.46.46 AM (2).jpeg', 'تفاصيل هوية MS', 'تصميم ترويجي لعلامة MS Woodworks داخل مساحة خشبية', 'هوية العلامة'),
    defineAsset('fine-interior', 'WhatsApp Image 2026-10-12 at 11.46.46 AM (3).jpeg', 'أعمال جديدة قريبًا', 'ملصق تشويقي يحمل شعار MS Woodworks وعبارة قريبًا', 'هوية العلامة'),
    defineAsset('hand-finish', 'WhatsApp Image 2026-10-12 at 11.46.46 AM (4).jpeg', 'تفاصيل مكتب تنفيذي', 'تصوّر تصميمي لمكتب تنفيذي ومكتبة جوز في مساحة عمل', 'تصوّر تصميمي'),
    defineAsset('wood-detail', 'WhatsApp Image 2026-10-12 at 11.46.47 AM (1).jpeg', 'تفاصيل المكتب التنفيذي', 'تصميم عمودي لمكتب تنفيذي مع عناصر واجهة تطبيق ظاهرة أسفل الصورة', 'هوية العلامة'),
    defineAsset('brand-story', 'MS Woodworks_ Crafted in Warmth.png', 'صُنعنا فتميزنا', 'الهوية البصرية لمجموعة MS Woodworks Crafted in Warmth', 'هوية العلامة'),
    defineAsset('brand-mark', 'Gemini_Generated_Image_rm6yb4rm6yb4rm6y.jpeg', 'شعار MS Woodworks', 'الشعار الخشبي الكامل لعلامة MS Woodworks', 'هوية العلامة')
  ];

  const api = Object.freeze({
    gallery: Object.freeze(assets.filter((asset) => asset.featured)),
    byId: Object.freeze(Object.fromEntries(assets.map((asset) => [asset.id, asset])))
  });

  if (typeof window !== 'undefined') window.MSWoodGalleryAssets = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
