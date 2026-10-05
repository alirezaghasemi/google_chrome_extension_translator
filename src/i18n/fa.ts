export const fa = {
  app: {
    title: 'مترجم هوشمند و اسکرین‌شات جمینای',
    subtitle: 'ترجمه کل صفحه، ترجمه ناحیه‌ای و اسکرین‌شات هوشمند با هوش مصنوعی جمینای'
  },
  actions: {
    translatePage: 'ترجمه کل صفحه',
    translateRegion: 'ترجمه ناحیه انتخابی',
    captureViewport: 'عکس از صفحه',
    captureFullPage: 'عکس از تمام صفحه',
    restoreOriginal: 'بازگردانی متن اصلی',
    pause: 'توقف موقت',
    resume: 'ادامه',
    cancel: 'لغو',
    close: 'بستن',
    closeAll: 'بستن همه پنجره‌ها',
    copy: 'کپی ترجمه',
    copied: 'کپی شد!',
    retranslate: 'ترجمه مجدد',
    save: 'ذخیره تنظیمات',
    saved: 'تنظیمات با موفقیت ذخیره شد',
    testConnection: 'تست اتصال',
    deleteKey: 'حذف کلید',
    download: 'دانلود تصویر',
    copyImage: 'کپی در کلیپ‌بورد',
    settings: 'تنظیمات',
    translatePdf: 'ترجمه سند PDF',
    openPdfTranslator: 'مترجم هوشمند PDF',
    openSidePanel: 'پنل کناری ترجمه',
    translatePdfPage: 'ترجمه این صفحه',
    translateEntirePdf: 'ترجمه کل PDF',
    bilingualMode: 'نمایش دوزبانه',
    exportTranslation: 'خروجی ترجمه'
  },
  pdf: {
    detected: 'سند PDF در حال نمایش',
    detectedDesc: 'این فایل در مرورگر در حال نمایش است. می‌توانید آن را به صورت دوزبانه مطالعه کرده یا از پنل کناری ترجمه استفاده کنید.',
    openInReader: 'مطالعه و ترجمه دوزبانه PDF',
    openSidePanel: 'باز کردن پنل کناری ترجمه',
    dropPdfHere: 'فایل PDF را اینجا رها کنید، یا کلیک کنید',
    pageOf: 'صفحه {current} از {total}',
    translatingPage: 'در حال ترجمه صفحه...',
    translatingDoc: 'در حال ترجمه کل سند PDF...',
    pageTranslated: 'صفحه ترجمه شد',
    noTextFound: 'متن قابل استخراجی در این صفحه یافت نشد (احتمالاً فایل اسکن‌شده یا تصویری است)',
    allowFileUrlsHint: 'برای باز کردن فایل‌های محلی PDF، گزینه "Allow access to file URLs" را در تنظیمات افزونه کروم فعال کنید یا فایل را مستقیماً در این صفحه بکشید.'
  },
  status: {
    apiConfigured: 'کلید API جمینای فعال است',
    apiMissing: 'کلید API جمینای تنظیم نشده است',
    testing: 'در حال بررسی اتصال...',
    validKey: 'کلید API معتبر و فعال است!',
    invalidKey: 'کلید نامعتبر است یا ارتباط با جمینای برقرار نشد',
    analyzing: 'در حال تحلیل با هوش مصنوعی...',
    translating: 'در حال ترجمه صفحه...',
    capturing: 'در حال گرفتن عکس...',
    stitching: 'در حال چسباندن صفحات...',
    pageTranslated: 'ترجمه صفحه به پایان رسید'
  },
  panel: {
    title: 'ترجمه هوشمند جمینای',
    source: 'متن اصلی',
    translation: 'ترجمه',
    explanations: 'توضیحات و اصطلاحات تخصصی',
    noExplanations: 'اصطلاح تخصصی خاصی شناسایی نشد.',
    opacity: 'شفافیت',
    targetLanguage: 'زبان مقصد',
    visualContent: 'تصویر / محتوای بصری'
  },
  settings: {
    tabs: {
      general: 'عمومی',
      translation: 'ترجمه',
      panel: 'پنجره نتایج',
      screenshot: 'اسکرین‌شات',
      ai: 'هوش مصنوعی جمینای',
      privacy: 'حریم خصوصی'
    },
    general: {
      targetLang: 'زبان مقصد پیش‌فرض',
      sourceLang: 'زبان مبدا پیش‌فرض',
      theme: 'پوسته ظاهری',
      system: 'هماهنگ با سیستم',
      dark: 'حالت تیره',
      light: 'حالت روشن',
      uiLang: 'زبان افزونه'
    },
    translation: {
      explainTerms: 'توضیح اصطلاحات تخصصی و اختصارات',
      explainLevel: 'سطح توضیحات تخصصی',
      levelNone: 'بدون توضیح',
      levelImportant: 'فقط اصطلاحات مهم و کلیدی',
      levelTechnical: 'تمام اصطلاحات فنی و تخصصی',
      levelDetailed: 'توضیحات مفصل و زمینه‌ای',
      style: 'سبک ترجمه',
      styleNatural: 'روان و طبیعی (پیشنهادی)',
      styleLiteral: 'تحت‌اللفظی و دقیق',
      styleProfessional: 'رسمی و اداری',
      styleTechnical: 'علمی و مهندسی',
      preserveCode: 'حفظ قطعه‌کدها و بلوک‌های برنامه‌نویسی'
    },
    panel: {
      position: 'موقعیت پیش‌فرض پنجره',
      remember: 'به‌خاطر سپردن آخرین موقعیت جابجاشده',
      opacity: 'شفافیت پنجره شناور',
      width: 'عرض پیش‌فرض (پیکسل)',
      maxHeight: 'حداکثر ارتفاع (پیکسل)',
      draggable: 'امکان جابجایی آزاد پنجره روی صفحه'
    },
    screenshot: {
      format: 'فرمت ذخیره تصویر',
      quality: 'کیفیت تصویر JPEG',
      delay: 'تاخیر پیمایش تمام‌صفحه (میلی‌ثانیه)',
      autoRestore: 'بازگرداندن خودکار موقعیت اسکرول پس از ضبط'
    },
    ai: {
      apiKey: 'کلید اختصاصی Google AI Studio / Gemini API',
      apiKeyHint: 'کلید خود را به صورت رایگان از aistudio.google.com دریافت کنید',
      model: 'مدل هوش مصنوعی',
      temperature: 'درجه خلاقیت / دقت (Temperature)',
      timeout: 'مهلت پاسخ درخواست (ثانیه)'
    },
    privacy: {
      title: 'امنیت و حریم خصوصی داده‌های شما',
      p1: 'کلید API شما منحصراً در حافظه داخلی محلی مرورگر ذخیره شده و هرگز به سرور دیگری ارسال نمی‌شود.',
      p2: 'این افزونه هیچ‌گونه سرور واسط، سیستم رهگیری یا ابزار آماری و آنالیتیکس ندارد.',
      p3: 'محتوای انتخابی و اسکرین‌شات‌ها مستقیماً و فقط هنگام درخواست شما به API رسمی گوگل ارسال می‌شوند.'
    }
  }
};
