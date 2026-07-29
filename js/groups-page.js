(() => {
  let stopProducts = null;
  const savedProducts = (() => {
    try {
      const value = JSON.parse(localStorage.getItem('luciole_products') || 'null');
      return Array.isArray(value) && value.length ? value : null;
    } catch (_) { return null; }
  })();
  window.PRODUCTS_DATA = savedProducts || window.LUCIOLE_SEED_PRODUCTS || [];

  function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 3500);
  }
  window.showToast = showToast;

  function setGroupsLanguage(language) {
    const lang = language === 'en' ? 'en' : 'fr';
    localStorage.setItem('luciole_lang', lang);
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-fr][data-en]').forEach((element) => {
      element.textContent = element.dataset[lang];
    });
    document.querySelectorAll('[data-set-lang]').forEach((button) => {
      button.classList.toggle('active', button.dataset.setLang === lang);
    });
    window.GroupUI?.render?.();
  }
  window.setGroupsLanguage = setGroupsLanguage;

  function startProductSync() {
    if (stopProducts || !window.FirebaseClient?.subscribePublishedProducts) return;
    stopProducts = window.FirebaseClient.subscribePublishedProducts((products) => {
      if (!products.length) return;
      window.PRODUCTS_DATA = products;
      localStorage.setItem('luciole_products', JSON.stringify(products));
      window.dispatchEvent(new CustomEvent('luciole-catalog-updated', { detail: products }));
    }, (error) => console.warn('Catalogue Firestore indisponible :', error));
  }

  document.addEventListener('DOMContentLoaded', () => {
    setGroupsLanguage(localStorage.getItem('luciole_lang') || 'fr');
    document.querySelectorAll('[data-set-lang]').forEach((button) => button.addEventListener('click', () => setGroupsLanguage(button.dataset.setLang)));
    const toggle = document.querySelector('.menu-toggle');
    const menu = document.getElementById('mainMenu');
    toggle?.addEventListener('click', () => {
      const open = menu.classList.toggle('active');
      toggle.classList.toggle('active', open);
      toggle.setAttribute('aria-expanded', String(open));
    });
    menu?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
      menu.classList.remove('active');
      toggle?.classList.remove('active');
      toggle?.setAttribute('aria-expanded', 'false');
    }));
    startProductSync();
  });
  window.addEventListener('firebase-ready', startProductSync);
})();
