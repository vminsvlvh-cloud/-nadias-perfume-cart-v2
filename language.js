// Shared language state for every page. Product data is never translated here.
let lang = 'ar';
try { lang = localStorage.getItem('nadia_lang') === 'en' ? 'en' : 'ar'; } catch (_) {}
const t = (ar, en) => lang === 'ar' ? ar : en;
function translatePage() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-ar][data-en]').forEach(el => { el.textContent = el.dataset[lang]; });
  document.querySelectorAll('[data-placeholder-ar][data-placeholder-en]').forEach(el => {
    el.placeholder = t(el.dataset.placeholderAr, el.dataset.placeholderEn);
  });
  document.querySelectorAll('[data-aria-ar][data-aria-en]').forEach(el => {
    el.setAttribute('aria-label', t(el.dataset.ariaAr, el.dataset.ariaEn));
  });
  document.querySelectorAll('[data-language-toggle]').forEach(el => {
    el.textContent = t('EN', 'AR');
    el.setAttribute('aria-label', t('Switch to English', 'التبديل إلى العربية'));
    el.setAttribute('lang', t('en', 'ar'));
  });
}
function toggleLang() {
  setLang(lang === 'ar' ? 'en' : 'ar');
}
function setLang(value) {
  lang = value === 'en' ? 'en' : 'ar';
  try { localStorage.setItem('nadia_lang', lang); } catch (_) {}
  document.dispatchEvent(new Event('languagechange'));
}
translatePage();
document.addEventListener('languagechange', translatePage);
document.addEventListener('DOMContentLoaded', translatePage);
window.addEventListener('storage', event => {
  if (event.key === 'nadia_lang') {
    lang = event.newValue === 'en' ? 'en' : 'ar';
    document.dispatchEvent(new Event('languagechange'));
  }
});

