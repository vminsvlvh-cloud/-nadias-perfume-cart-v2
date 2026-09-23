window.NADIA_PRODUCTS = [
  {
    "slug": "fares",
    "name_ar": "فارس",
    "name_en": "Fares"
  },
  {
    "slug": "empire",
    "name_ar": "إمباير",
    "name_en": "Empire"
  },
  {
    "slug": "legacy",
    "name_ar": "ليغاسي",
    "name_en": "Legacy"
  },
  {
    "slug": "asil",
    "name_ar": "أصيل",
    "name_en": "Asil"
  },
  {
    "slug": "saif",
    "name_ar": "سيف",
    "name_en": "Saif"
  },
  {
    "slug": "shazalia",
    "name_ar": "شاذاليا",
    "name_en": "Shazalia"
  },
  {
    "slug": "layali",
    "name_ar": "ليالي",
    "name_en": "Layali"
  },
  {
    "slug": "pearl",
    "name_ar": "لؤلؤة",
    "name_en": "Pearl"
  },
  {
    "slug": "hikaya",
    "name_ar": "حكاية",
    "name_en": "Hikaya"
  },
  {
    "slug": "athar",
    "name_ar": "أثر",
    "name_en": "Athar"
  },
  {
    "slug": "moment",
    "name_ar": "لحظة",
    "name_en": "Moment"
  },
  {
    "slug": "layan",
    "name_ar": "ليان",
    "name_en": "Layan"
  },
  {
    "slug": "abeer",
    "name_ar": "عبير",
    "name_en": "Abeer"
  },
  {
    "slug": "secret",
    "name_ar": "سر",
    "name_en": "Secret"
  },
  {
    "slug": "sukoon",
    "name_ar": "سكون",
    "name_en": "Sukoon"
  },
  {
    "slug": "waad",
    "name_ar": "وعد",
    "name_en": "Wa'ad"
  },
  {
    "slug": "liqaa",
    "name_ar": "لقاء",
    "name_en": "Liqaa"
  },
  {
    "slug": "naseem",
    "name_ar": "نسيم",
    "name_en": "Naseem"
  },
  {
    "slug": "bouh",
    "name_ar": "بوح",
    "name_en": "Bouh"
  },
  {
    "slug": "essence",
    "name_ar": "إسنس",
    "name_en": "Essence"
  }
];

window.NADIA_PRODUCT_GALLERY = [
  '574059516_1790146252538736.jpeg',
  '862600568_1790146247108323.jpeg',
  '899942807_1790146229818310.jpeg',
  '65178432_1790146327567901.jpeg',
  '158379733_1790146335114179.jpeg',
  '238285533_1790146351210496.jpeg',
  '168549998_1790146360830918.jpeg'
];
window.NADIA_PRODUCTS.forEach((product,index)=>{
  if(!product.image) product.image=window.NADIA_PRODUCT_GALLERY[index % window.NADIA_PRODUCT_GALLERY.length];
});
