// Luciole India Hair - Main Application
const SITE_NAME = 'Luciole India Hair';
const WHATSAPP_NUMBER = "237654470561";
const WHATSAPP_BASE = `https://wa.me/${WHATSAPP_NUMBER}`;

// Charge les modifications de l'administration. Une seule migration remplace
// l'ancien catalogue d'échantillons par les modèles réellement ajoutés.
function copyCatalog(products) {
  return products.map(product => ({
    ...product,
    lengths: product.lengths.map(length => ({ ...length })),
    images: [...product.images]
  }));
}

function loadCatalog() {
  const storedVersion = localStorage.getItem('luciole_catalog_version');
  const storedProducts = JSON.parse(localStorage.getItem('luciole_products') || 'null');
  if (storedVersion !== CATALOG_VERSION || !Array.isArray(storedProducts)) {
    const newCatalog = copyCatalog(PRODUCTS);
    localStorage.setItem('luciole_products', JSON.stringify(newCatalog));
    localStorage.setItem('luciole_catalog_version', CATALOG_VERSION);
    return newCatalog;
  }
  return storedProducts;
}

let PRODUCTS_DATA = loadCatalog();
// Expose the active catalogue to the separate group-purchase script.
window.PRODUCTS_DATA = PRODUCTS_DATA;

let cart = JSON.parse(localStorage.getItem('luciole_cart') || '[]');
let currentProduct = null;
let selectedLength = null;
let selectedQty = 1;
let lastFocusedElement = null;

function getProductReferencePrice(product) {
  const numericPrice = Number(product?.referencePrice);
  return Number.isFinite(numericPrice) && numericPrice > 0 ? numericPrice : 0;
}

function getEffectivePrice(product, variant = null) {
  if (!product) return 0;
  if (product.promo && Number(product.promoPrice) > 0) return Number(product.promoPrice);
  if (variant && Number(variant.price) > 0) return Number(variant.price);
  return getProductReferencePrice(product);
}

function getProductMinPrice(product) {
  const variantPrices = (product?.lengths || []).map(length => Number(length.price)).filter(price => price > 0);
  const referencePrice = getProductReferencePrice(product);
  const candidates = variantPrices.length ? variantPrices : (referencePrice > 0 ? [referencePrice] : []);
  return candidates.length ? Math.min(...candidates) : 0;
}

function buildProductShareUrl(productId) {
  const url = new URL(window.location.href);
  url.searchParams.set('product', String(productId));
  url.hash = '';
  return url.toString();
}

function updateProductShareMeta(product) {
  const origin = window.location.origin || 'https://lucioleindiahair.com';
  const title = product ? `${product.name} | ${SITE_NAME}` : `${SITE_NAME} | Greffes, Mèches & Perruques Premium`;
  const description = product ? `${product.name} • ${product.category} • ${product.texture} • ${product.color}` : 'Découvrez nos greffes, mèches, closures, frontals et perruques premium au Cameroun.';
  const imagePath = product?.images?.[0] || 'images/logo-luciole.png';
  const imageUrl = new URL(imagePath, `${origin}${window.location.pathname}`).toString();

  document.title = title;
  const metaDescription = document.querySelector('meta[name="description"]');
  if (metaDescription) metaDescription.setAttribute('content', description);
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute('content', title);
  const ogDescription = document.querySelector('meta[property="og:description"]');
  if (ogDescription) ogDescription.setAttribute('content', description);
  const ogImage = document.querySelector('meta[property="og:image"]');
  if (ogImage) ogImage.setAttribute('content', imageUrl);
  const twitterTitle = document.querySelector('meta[name="twitter:title"]');
  if (twitterTitle) twitterTitle.setAttribute('content', title);
  const twitterDescription = document.querySelector('meta[name="twitter:description"]');
  if (twitterDescription) twitterDescription.setAttribute('content', description);
  const twitterImage = document.querySelector('meta[name="twitter:image"]');
  if (twitterImage) twitterImage.setAttribute('content', imageUrl);
}

function updateProductUrl(productId) {
  const url = new URL(window.location.href);
  if (productId) {
    url.searchParams.set('product', String(productId));
  } else {
    url.searchParams.delete('product');
  }
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function openProductFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const productId = Number(params.get('product'));
  if (!Number.isFinite(productId) || productId <= 0) return;
  window.setTimeout(() => openProductModal(productId), 0);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  renderCategories();
  renderProducts(PRODUCTS_DATA);
  renderTestimonials();
  renderFAQ();
  updateCartUI();
  setupEventListeners();
  setupNavbarScroll();
  updateProductShareMeta();
  openProductFromQuery();
  applyFirestorePrices();
});

async function applyFirestorePrices() {
  try {
    const client = window.FirebaseClient;
    if (!client || typeof client.fetchPriceOverrides !== 'function') return;
    const overrides = await client.fetchPriceOverrides();
    if (!overrides || !Object.keys(overrides).length) return;
    let changed = false;
    PRODUCTS_DATA.forEach(product => {
      const price = overrides[String(product.id)];
      if (typeof price === 'number' && price > 0 && product.referencePrice !== price) {
        product.referencePrice = price;
        product.lengths.forEach((variant) => {
          variant.price = price;
        });
        changed = true;
      }
    });
    if (changed) {
      renderProducts(PRODUCTS_DATA);
    }
  } catch (e) {
    console.warn('[Luciole] applyFirestorePrices :', e.message);
  }
}

function setupNavbarScroll() {
  const navbar = document.querySelector('.navbar');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });
}

function setupEventListeners() {
  // Menu toggle
  const menuToggle = document.querySelector('.menu-toggle');
  const navMenu = document.querySelector('.nav-menu');
  if (menuToggle) {
    menuToggle.addEventListener('click', () => {
      const isOpen = navMenu.classList.toggle('active');
      menuToggle.classList.toggle('active', isOpen);
      menuToggle.setAttribute('aria-expanded', String(isOpen));
      menuToggle.setAttribute('aria-label', isOpen ? 'Fermer le menu' : 'Ouvrir le menu');
    });
  }

  // Close menu on link click
  document.querySelectorAll('.nav-menu a').forEach(link => {
    link.addEventListener('click', () => {
      navMenu.classList.remove('active');
      menuToggle?.classList.remove('active');
      menuToggle?.setAttribute('aria-expanded', 'false');
      menuToggle?.setAttribute('aria-label', 'Ouvrir le menu');
    });
  });

  // Search
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', filterProducts);
  }

  // Filters
  ['filterType', 'filterTexture', 'filterColor', 'filterLength', 'filterPrice'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', filterProducts);
  });

  // Cart
  document.getElementById('cartBtn')?.addEventListener('click', openCart);
  document.getElementById('cartClose')?.addEventListener('click', closeCart);
  document.getElementById('cartOverlay')?.addEventListener('click', closeCart);
  document.getElementById('cartCity')?.addEventListener('input', (event) => {
    localStorage.setItem('luciole_cart_city', event.target.value);
  });

  // Modal close
  document.getElementById('modalClose')?.addEventListener('click', closeModal);
  document.getElementById('productModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'productModal') closeModal();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (document.getElementById('cartSidebar')?.classList.contains('open')) closeCart();
    if (document.getElementById('productModal')?.classList.contains('active')) closeModal();
  });
}

// Catalogue localisation. The catalogue is managed in French by the admin, while
// visitors can still browse a complete English storefront.
const PRODUCT_NAMES_EN = {
  1: 'Burgundy Afro Volume Lace', 2: 'Extra-Long Straight Black Lace', 3: 'Black Headband Straight Bob', 4: 'Extra-Long Straight Black Lace',
  5: 'Centre-Part Straight Bob', 6: 'Burgundy Straight Lace', 7: 'Black Deep Wave Lace', 8: 'Defined Curl Black Lace',
  9: 'Curly Volume Bob', 10: 'Honey Curl Lace', 11: 'Auburn Wavy Lace', 12: 'Burgundy Curly Lace',
  13: 'Chocolate Wavy Bob', 14: 'Natural Black Straight Bob', 15: 'Black Glamour Curl Lace', 16: 'Chocolate Wavy Lace',
  17: 'Chocolate Body Wave Lace', 18: 'Burgundy Twist Short Style', 19: 'Long Chocolate Body Wave', 20: 'Side-Bang Body Wave Lace',
  21: 'Natural Kinky Curly Lace', 22: 'Long Burgundy Straight Lace', 23: 'Black Square Headband Bob', 24: 'Curly Bob with Bangs',
  25: 'Extra-Long Honey Straight Lace', 26: 'Soft Short Black Bob', 27: 'Afro Kinky Curly Lace', 28: 'Chocolate Glamour Curl Bob',
  29: 'Black Body Wave Lace', 30: 'Chocolate Afro Volume Lace', 31: 'Natural Chocolate Straight Lace', 32: 'Straight Lace with Bangs',
  33: 'Long Black Kinky Curly Lace', 34: 'Silver Grey Straight Bob', 35: 'Colourful Curly Lace Collection', 36: 'Black Kinky Curly Lace', 37: 'Black Glamour Body Wave Lace'
};
const CATEGORY_EN = { lace: ['Lace wigs', 'Parting styles with lace finishing'], lisse: ['Straight hair', 'Sleek fall and clean finish'], ondulé: ['Wavy hair', 'Body wave and soft waves'], bouclé: ['Curly hair', 'Defined curls and volume'], court: ['Short styles', 'Bobs, bangs and short styles'], long: ['Long lengths', '20-inch styles and longer'] };
const TEXTURE_EN = { lisse: 'Straight', ondulé: 'Wavy', bouclé: 'Curly' };
const COLOR_EN = { bordeaux: 'Burgundy', 'noir naturel': 'Natural black', 'brun ou noir': 'Brown or black', 'brun miel': 'Honey brown', auburn: 'Auburn', 'brun chocolat': 'Chocolate brown', 'miel doré': 'Golden honey', 'brun foncé': 'Dark brown', 'gris argent': 'Silver grey', 'noir, brun et miel': 'Black, brown and honey' };

function tr(key, fallback = '') {
  return translations?.[currentLang]?.[key] || fallback;
}

function localizeProduct(product) {
  if (!product) return product;
  if (currentLang !== 'en') return product;
  const texture = TEXTURE_EN[product.texture] || product.texture;
  const color = COLOR_EN[product.color] || product.color;
  const category = product.category === 'Cheveux courts' ? 'Short styles' : 'Lace wigs';
  return {
    ...product,
    name: PRODUCT_NAMES_EN[product.id] || product.name,
    texture,
    color,
    category,
    type: 'wig',
    density: product.density === 'À confirmer' ? 'To be confirmed' : product.density,
    weight: product.weight === 'À confirmer' ? 'To be confirmed' : product.weight,
    availability: product.availability === 'Prix à confirmer' ? 'Price to be confirmed' : product.availability,
    delivery: 'Delivery time confirmed on WhatsApp according to your city',
    description: `This ${texture.toLowerCase()} ${color.toLowerCase()} style is shown in the catalogue photo. The exact size, availability and price are confirmed by our team before your order is validated.`,
    care: texture === 'Straight' ? 'Wash gently with a mild shampoo, moisturize the lengths and protect the hair before using heat.' : texture === 'Wavy' ? 'Detangle from ends to roots, moisturize lightly and use a wide-tooth comb to preserve the waves.' : 'Mist before detangling, apply moisturizing care and do not brush curls when dry to preserve their definition.',
    lengths: product.lengths.map((length) => ({ ...length, length: length.length.replace(' pouces', ' inches') }))
  };
}

// Categories
function renderCategories() {
  const grid = document.getElementById('categoriesGrid');
  if (!grid) return;
  const categoryIcons = {
    lace: 'fa-wand-magic-sparkles',
    lisse: 'fa-wand-sparkles',
    ondulé: 'fa-water',
    bouclé: 'fa-wind',
    court: 'fa-scissors',
    long: 'fa-star'
  };
  grid.innerHTML = CATEGORIES.map(cat => {
    const [name, desc] = currentLang === 'en' ? (CATEGORY_EN[cat.id] || [cat.name, cat.desc]) : [cat.name, cat.desc];
    return `
    <div class="category-card" onclick="filterByCategory('${cat.id}')">
      <div class="texture-image-wrap">
        <img src="${cat.image}" alt="${name}" loading="lazy" decoding="async" width="400" height="300">
        <span class="texture-icon"><i class="fas ${categoryIcons[cat.id] || 'fa-heart'}"></i></span>
        <span class="texture-reaction"><i class="fas fa-heart"></i> ${currentLang === 'en' ? 'Love it' : 'À aimer'}</span>
      </div>
      <div class="category-info">
        <h3>${name}</h3>
        <p>${desc}</p>
        <button class="btn btn-outline btn-sm">${tr('see-products', 'Découvrir')}</button>
      </div>
    </div>
  `; }).join('');
}

function filterByCategory(catId) {
  document.getElementById('nos-cheveux')?.scrollIntoView({ behavior: 'smooth' });
  // Simple filter by category name matching
  const filtered = PRODUCTS_DATA.filter(p => {
    const cat = CATEGORIES.find(c => c.id === catId);
    if (!cat) return true;
    return p.category.toLowerCase().includes(cat.name.toLowerCase().split(' ')[0].toLowerCase()) ||
           p.type === catId ||
           p.texture === catId ||
           (catId === 'long' && p.lengths.some(l => parseInt(l.length) >= 20)) ||
           (catId === 'court' && p.lengths.some(l => parseInt(l.length) <= 12)) ||
           (catId === 'lace' && p.category.includes('lace')) ||
           (catId === 'perruque' && p.type === 'perruque');
  });
  renderProducts(filtered.length ? filtered : PRODUCTS_DATA);
}

// Products
function renderProducts(products) {
  const grid = document.getElementById('productsGrid');
  if (!grid) return;
  if (!products.length) {
    grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;padding:40px;color:#6b6b6b;">Aucun produit trouvé.</p>';
    return;
  }
  grid.innerHTML = products.map(rawProduct => {
    const p = localizeProduct(rawProduct);
    const minPrice = getProductMinPrice(p);
    const displayPrice = p.promo && p.promoPrice ? p.promoPrice : minPrice;
    const badgeHtml = p.badge ? `<span class="product-badge badge-${p.badge}">${
      p.badge === 'nouveau' ? tr('badge-new', 'Nouveau') :
      p.badge === 'promo' ? tr('badge-promo', 'Promotion') :
      p.badge === 'best' ? tr('badge-best', 'Meilleure vente') :
      p.badge === 'limite' ? tr('badge-limited', 'Stock limité') : p.badge
    }</span>` : '';
    return `
      <div class="product-card" data-id="${p.id}">
        ${badgeHtml}
        <div class="product-image">
          <img src="${p.images[0]}" alt="${p.name}" loading="lazy" decoding="async" width="400" height="400">
          <div class="product-actions-overlay">
            <button class="btn btn-primary btn-sm" onclick="openProductModal(${p.id})">${tr('view', 'Voir')}</button>
            <button class="btn btn-whatsapp btn-sm" onclick="quickWhatsApp(${p.id})"><i class="fab fa-whatsapp"></i></button>
          </div>
        </div>
        <div class="product-info">
          <h3>${p.name}</h3>
          <div class="product-meta">
            <span>${p.category}</span>
            <span>${p.texture}</span>
            <span>${p.color}</span>
          </div>
          <div class="product-price">
            <span class="price-current">${formatPrice(displayPrice)}</span>
            ${p.promo && p.promoPrice ? `<span class="price-old">${formatPrice(minPrice)}</span>` : ''}
          </div>
          <div class="product-buttons">
            <button class="btn btn-outline btn-sm" onclick="openProductModal(${p.id})">${tr('details', 'Détails')}</button>
            <button class="btn btn-whatsapp btn-sm" onclick="quickWhatsApp(${p.id})">${tr('order', 'Commander')}</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function filterProducts() {
  const search = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const type = document.getElementById('filterType')?.value || '';
  const texture = document.getElementById('filterTexture')?.value || '';
  const color = document.getElementById('filterColor')?.value || '';
  const length = document.getElementById('filterLength')?.value || '';
  const price = document.getElementById('filterPrice')?.value || '';

  let filtered = PRODUCTS_DATA.filter(rawProduct => {
    const p = localizeProduct(rawProduct);
    const matchSearch = !search || 
      p.name.toLowerCase().includes(search) ||
      p.category.toLowerCase().includes(search) ||
      p.texture.toLowerCase().includes(search) ||
      p.color.toLowerCase().includes(search) ||
      p.description.toLowerCase().includes(search);
    
    const matchType = !type || rawProduct.type === type || rawProduct.category.toLowerCase().includes(type);
    const matchTexture = !texture || rawProduct.texture === texture;
    const matchColor = !color || rawProduct.color.toLowerCase().includes(color);
    const matchLength = !length || rawProduct.lengths.some(l => l.length.includes(length));
    
    let matchPrice = true;
    if (price) {
      const minP = getProductMinPrice(p);
      if (!Number(minP)) return false;
      if (price === '0-30000') matchPrice = minP <= 30000;
      else if (price === '30000-50000') matchPrice = minP > 30000 && minP <= 50000;
      else if (price === '50000-100000') matchPrice = minP > 50000 && minP <= 100000;
      else if (price === '100000+') matchPrice = minP > 100000;
    }

    return matchSearch && matchType && matchTexture && matchColor && matchLength && matchPrice;
  });

  renderProducts(filtered);
}

function formatPrice(price) {
  const numericPrice = Number(price);
  if (!Number.isFinite(numericPrice) || numericPrice <= 0) return tr('price-confirm', 'Prix à confirmer');
  return new Intl.NumberFormat(currentLang === 'en' ? 'en-US' : 'fr-FR').format(numericPrice) + ' FCFA';
}

// Product Modal
function openProductModal(id) {
  currentProduct = localizeProduct(PRODUCTS_DATA.find(p => p.id === id));
  if (!currentProduct) return;

  selectedLength = currentProduct.lengths[0];
  selectedQty = 1;

  const modal = document.getElementById('productModal');
  const body = document.getElementById('modalBody');

  const price = getEffectivePrice(currentProduct, selectedLength);

  body.innerHTML = `
    <div class="modal-gallery">
      <img src="${currentProduct.images[0]}" alt="${currentProduct.name}" class="modal-main-img" id="mainImg" loading="eager" decoding="async">
      <div class="modal-thumbs">
        ${currentProduct.images.map((img, i) => `
          <img src="${img}" alt="${tr('view', 'Vue')} ${i+1}" class="${i===0?'active':''}" onclick="changeMainImg('${img}', this)">
        `).join('')}
      </div>
    </div>
    <div class="modal-details">
      <h2>${currentProduct.name}</h2>
      <div class="product-meta" style="margin-bottom:12px;">
        <span>${currentProduct.category}</span>
        <span>${currentProduct.texture}</span>
        <span>${currentProduct.color}</span>
        <span>${currentProduct.availability}</span>
      </div>
      <div class="modal-price" id="modalPrice">${formatPrice(price)}</div>
      <div class="modal-specs">
        <div><strong>${tr('density', 'Densité')}:</strong> ${currentProduct.density}</div>
        <div><strong>${tr('weight', 'Poids')}:</strong> ${currentProduct.weight}</div>
        <div><strong>${tr('type', 'Type')}:</strong> ${currentProduct.type}</div>
        <div><strong>${tr('delivery', 'Livraison')}:</strong> ${currentProduct.delivery}</div>
      </div>
      <p class="modal-description">${currentProduct.description}</p>
      <p class="modal-description"><strong>${tr('care', "Conseils d'entretien")}:</strong> ${currentProduct.care}</p>
      
      <div class="length-selector">
        <label>${tr('size-length', 'Taille / longueur disponible')}</label>
        <div class="length-options" id="lengthOptions">
          ${currentProduct.lengths.map((l, i) => `
            <button class="length-btn ${i===0?'active':''}" 
              onclick="selectLength(${i}, this)">
              ${l.length} — ${formatPrice(l.price)}
            </button>
          `).join('')}
        </div>
      </div>
      
      <div class="qty-selector">
        <label>${tr('quantity', 'Quantité')}</label>
        <div class="qty-control">
          <button onclick="changeQty(-1)">−</button>
          <input type="number" id="qtyInput" value="1" min="1" max="20" onchange="selectedQty=parseInt(this.value)||1; updateModalPrice()">
          <button onclick="changeQty(1)">+</button>
        </div>
      </div>
      
      <div class="modal-actions">
        <button class="btn btn-outline" onclick="addToCart()">
          <i class="fas fa-shopping-bag"></i> ${tr('add-cart', 'Ajouter au panier')}
        </button>
        <button class="btn btn-whatsapp" onclick="orderOnWhatsApp()">
          <i class="fab fa-whatsapp"></i> ${tr('buy-now', 'Acheter maintenant')}
        </button>
        <button class="btn btn-primary" onclick="openGroupPurchase()">
          <i class="fas fa-users"></i> ${tr('buy-group', 'Acheter avec un groupe')}
        </button>
      </div>
    </div>
  `;

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
  updateProductShareMeta(currentProduct);
  updateProductUrl(currentProduct.id);
}

function closeModal() {
  document.getElementById('productModal').classList.remove('active');
  document.body.style.overflow = '';
  currentProduct = null;
  updateProductUrl(null);
}

function changeMainImg(src, el) {
  document.getElementById('mainImg').src = src;
  document.querySelectorAll('.modal-thumbs img').forEach(img => img.classList.remove('active'));
  el.classList.add('active');
}

function selectLength(index, btn) {
  selectedLength = currentProduct.lengths[index];
  document.querySelectorAll('.length-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  updateModalPrice();
}

function changeQty(delta) {
  selectedQty = Math.max(1, Math.min(20, selectedQty + delta));
  document.getElementById('qtyInput').value = selectedQty;
  updateModalPrice();
}

function updateModalPrice() {
  if (!currentProduct || !selectedLength) return;
  const unitPrice = getEffectivePrice(currentProduct, selectedLength);
  const total = unitPrice * selectedQty;
  document.getElementById('modalPrice').textContent = formatPrice(total) + (selectedQty > 1 ? ` (${selectedQty} × ${formatPrice(unitPrice)})` : '');
}

// Cart
function addToCart() {
  if (!currentProduct || !selectedLength) return;

  const unitPrice = getEffectivePrice(currentProduct, selectedLength);

  if (!Number(unitPrice)) {
    showToast(tr('price-size-confirm', 'Le prix de cette taille est à confirmer sur WhatsApp.'));
    return;
  }

  const existing = cart.find(item => 
    item.id === currentProduct.id && item.length === selectedLength.length
  );

  if (existing) {
    existing.qty += selectedQty;
  } else {
    cart.push({
      id: currentProduct.id,
      name: currentProduct.name,
      length: selectedLength.length,
      price: unitPrice,
      qty: selectedQty,
      image: currentProduct.images[0],
      type: currentProduct.type
    });
  }

  saveCart();
  updateCartUI();
  showToast(tr('cart-added', 'Produit ajouté au panier'));
  closeModal();
}

function saveCart() {
  localStorage.setItem('luciole_cart', JSON.stringify(cart));
}

function updateCartUI() {
  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  const countEl = document.getElementById('cartCount');
  if (countEl) {
    countEl.textContent = count;
    countEl.style.display = count > 0 ? 'flex' : 'none';
  }

  const itemsEl = document.getElementById('cartItems');
  if (!itemsEl) return;

  if (cart.length === 0) {
    itemsEl.innerHTML = `
      <div class="cart-empty">
        <i class="fas fa-shopping-bag" style="font-size:3rem;color:#c9a227;margin-bottom:16px;"></i>
        <p>${tr('cart-empty', 'Votre panier est vide')}</p>
        <p style="font-size:0.85rem;margin-top:8px;">${tr('cart-empty-sub', 'Découvrez nos collections premium')}</p>
      </div>
    `;
  } else {
    itemsEl.innerHTML = cart.map((item, index) => `
      <div class="cart-item">
        <img src="${item.image}" alt="${item.name}" loading="lazy" decoding="async" width="70" height="70">
        <div class="cart-item-info">
          <h4>${item.name}</h4>
          <div class="meta">${item.length}</div>
          <div class="cart-item-price">${formatPrice(item.price * item.qty)}</div>
          <div class="cart-item-qty">
            <button onclick="updateCartQty(${index}, -1)">−</button>
            <span>${item.qty}</span>
            <button onclick="updateCartQty(${index}, 1)">+</button>
          </div>
        </div>
        <button class="cart-item-remove" onclick="removeFromCart(${index})">
          <i class="fas fa-trash-alt"></i>
        </button>
      </div>
    `).join('');
  }

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  document.getElementById('cartSubtotal').textContent = formatPrice(subtotal);
  document.getElementById('cartTotal').textContent = formatPrice(subtotal);

  const cityInput = document.getElementById('cartCity');
  if (cityInput && !cityInput.value) cityInput.value = localStorage.getItem('luciole_cart_city') || '';
}

function updateCartQty(index, delta) {
  cart[index].qty = Math.max(1, cart[index].qty + delta);
  saveCart();
  updateCartUI();
}

function removeFromCart(index) {
  cart.splice(index, 1);
  saveCart();
  updateCartUI();
  showToast(tr('cart-removed', 'Produit retiré du panier'));
}

function openCart() {
  lastFocusedElement = document.activeElement;
  const cartSidebar = document.getElementById('cartSidebar');
  cartSidebar.classList.add('open');
  cartSidebar.setAttribute('aria-hidden', 'false');
  document.getElementById('cartOverlay').classList.add('open');
  document.getElementById('cartBtn')?.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
  window.setTimeout(() => document.getElementById('cartClose')?.focus(), 200);
}

function closeCart() {
  const cartSidebar = document.getElementById('cartSidebar');
  cartSidebar.classList.remove('open');
  cartSidebar.setAttribute('aria-hidden', 'true');
  document.getElementById('cartOverlay').classList.remove('open');
  document.getElementById('cartBtn')?.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
  lastFocusedElement?.focus?.();
}

// WhatsApp functions
function getWhatsAppUrl(message) {
  return `${WHATSAPP_BASE}?text=${encodeURIComponent(message)}`;
}

function quickWhatsApp(id) {
  const product = localizeProduct(PRODUCTS_DATA.find(p => p.id === id));
  if (!product) return;
  const minPrice = getProductMinPrice(product);
  const price = product.promo && product.promoPrice ? product.promoPrice : minPrice;
  const shareUrl = buildProductShareUrl(product.id);
  const msg = currentLang === 'en'
    ? `Hello ${SITE_NAME}, I would like more information or to order this product.

📦 Product: ${product.name}
📏 Length: to be confirmed
🔢 Quantity: 1
💰 Price: ${formatPrice(price)}
🔗 Ref: #${product.id}
🔗 View product: ${shareUrl}

Thank you!`
    : `Bonjour ${SITE_NAME}, je souhaite avoir plus d'informations ou passer une commande pour ce produit.

📦 Produit : ${product.name}
📏 Longueur : à confirmer
🔢 Quantité : 1
💰 Prix : ${formatPrice(price)}
🔗 Réf : #${product.id}
🔗 Voir le produit : ${shareUrl}

Merci !`;
  window.open(getWhatsAppUrl(msg), '_blank');
}

function orderOnWhatsApp() {
  if (!currentProduct || !selectedLength) return;
  const unitPrice = getEffectivePrice(currentProduct, selectedLength);
  const total = unitPrice * selectedQty;
  const priceText = Number(unitPrice) ? formatPrice(unitPrice) : tr('price-confirm', 'Prix à confirmer');
  const totalText = Number(unitPrice) ? formatPrice(total) : tr('price-confirm', 'Prix à confirmer');
  const shareUrl = buildProductShareUrl(currentProduct.id);

  const msg = currentLang === 'en' ? `Hello ${SITE_NAME}, I would like more information or to order this product.

📦 Product: ${currentProduct.name}
📏 Length: ${selectedLength.length}
🔢 Quantity: ${selectedQty}
💰 Unit price: ${priceText}
💵 Total amount: ${totalText}
🔗 Ref: #${currentProduct.id}
🔗 View product: ${shareUrl}

Thank you!` : `Bonjour ${SITE_NAME}, je souhaite avoir plus d'informations ou passer une commande pour ce produit.

📦 Produit : ${currentProduct.name}
📏 Longueur : ${selectedLength.length}
🔢 Quantité : ${selectedQty}
💰 Prix unitaire : ${priceText}
💵 Montant total : ${totalText}
🔗 Réf : #${currentProduct.id}
🔗 Voir le produit : ${shareUrl}

Merci !`;
  window.open(getWhatsAppUrl(msg), '_blank');
}

function openGroupPurchase() {
  if (!currentProduct || !selectedLength) return;
  const price = getEffectivePrice(currentProduct, selectedLength);
  if (!Number(price)) {
    showToast(tr('group-price-needed', 'Renseignez le prix de cette taille dans l’administration avant de créer un groupe.'));
    return;
  }
  const product = {
    productId: currentProduct.id,
    productName: currentProduct.name,
    variant: selectedLength.length,
    targetAmount: price
  };
  closeModal();
  if (window.GroupUI) window.GroupUI.openCreateForProduct(product);
  else showToast(tr('groups-loading', 'L’espace groupes est en cours de chargement.'));
}

function finalizeOrderWhatsApp() {
  if (cart.length === 0) {
    showToast(tr('cart-empty', 'Votre panier est vide'));
    return;
  }

  const city = document.getElementById('cartCity')?.value.trim() || (currentLang === 'en' ? 'Not specified' : 'Non précisée');
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  let msg = currentLang === 'en' ? `Hello ${SITE_NAME}, I would like to finalize my order.

📍 Delivery city: ${city}

📋 ORDER SUMMARY:
` : `Bonjour ${SITE_NAME}, je souhaite finaliser ma commande.

📍 Ville de livraison : ${city}

📋 RÉCAPITULATIF DE LA COMMANDE :
`;

  cart.forEach((item, i) => {
    msg += currentLang === 'en' ? `
${i + 1}. ${item.name}
   • Length: ${item.length}
   • Quantity: ${item.qty}
   • Unit price: ${formatPrice(item.price)}
   • Subtotal: ${formatPrice(item.price * item.qty)}
   • Ref: #${item.id}
` : `
${i + 1}. ${item.name}
   • Longueur : ${item.length}
   • Quantité : ${item.qty}
   • Prix unitaire : ${formatPrice(item.price)}
   • Sous-total : ${formatPrice(item.price * item.qty)}
   • Réf : #${item.id}
`;
  });

  msg += currentLang === 'en' ? `
────────────────────
💰 Subtotal: ${formatPrice(subtotal)}
🚚 Delivery fee: To be confirmed according to your city
💵 Estimated total: ${formatPrice(subtotal)}

Please confirm the delivery fee and availability.` : `
────────────────────
💰 Sous-total : ${formatPrice(subtotal)}
🚚 Frais de livraison : À confirmer selon la ville
💵 Total provisoire : ${formatPrice(subtotal)}

Merci de me confirmer les frais de livraison et la disponibilité.`;

  window.open(getWhatsAppUrl(msg), '_blank');
}

function openGeneralWhatsApp() {
  const msg = currentLang === 'en'
    ? `Hello ${SITE_NAME}, I would like more information or to place an order.`
    : `Bonjour ${SITE_NAME}, je souhaite avoir plus d'informations ou passer une commande.`;
  window.open(getWhatsAppUrl(msg), '_blank');
}

function showLegal(kind) {
  const messages = currentLang === 'en' ? {
    privacy: 'Privacy policy: We do not collect personal data through this website. Conversations take place exclusively on WhatsApp.',
    terms: 'Terms and conditions: Orders are confirmed and paid through WhatsApp. Delivery fees are confirmed according to the destination. Returns may be possible under conditions (unopened product).'
  } : {
    privacy: 'Politique de confidentialité : Nous ne collectons aucune donnée personnelle via le site. Les échanges se font exclusivement via WhatsApp.',
    terms: 'Conditions générales : Les commandes sont validées et payées via WhatsApp. Les frais de livraison sont confirmés selon la destination. Retours possibles sous conditions (produit non ouvert).'
  };
  window.alert(messages[kind]);
}

// Testimonials
function renderTestimonials() {
  const grid = document.getElementById('testimonialsGrid');
  if (!grid) return;
  const testimonialTexts = currentLang === 'en'
    ? [
      'A beautiful choice of styles and a helpful team to advise on length.',
      'Ordering on WhatsApp is easy and the follow-up is reassuring.',
      'I found a curly style that matched my look exactly.'
    ]
    : TESTIMONIALS.map((testimonial) => testimonial.text);
  grid.innerHTML = TESTIMONIALS.map((t, index) => `
    <div class="testimonial-card">
      <div class="testimonial-header">
        <div class="testimonial-avatar">${t.name.charAt(0)}</div>
        <div class="testimonial-info">
          <h4>${t.name}</h4>
          <span>${t.city}</span>
        </div>
      </div>
      <div class="stars">${'★'.repeat(t.rating)}${'☆'.repeat(5 - t.rating)}</div>
      <p class="testimonial-text">"${testimonialTexts[index]}"</p>
    </div>
  `).join('');
}

// FAQ
function renderFAQ() {
  const list = document.getElementById('faqList');
  if (!list) return;
  const source = (typeof currentLang !== 'undefined' && currentLang === 'en' && typeof FAQ_EN !== 'undefined') ? FAQ_EN : FAQ;
  list.innerHTML = source.map((item, i) => `
    <div class="faq-item" id="faq-${i}">
      <button class="faq-question" onclick="toggleFAQ(${i})">
        ${item.q}
        <i class="fas fa-chevron-down"></i>
      </button>
      <div class="faq-answer">
        <div class="faq-answer-inner">${item.a}</div>
      </div>
    </div>
  `).join('');
}

function toggleFAQ(index) {
  const item = document.getElementById(`faq-${index}`);
  const isActive = item.classList.contains('active');
  document.querySelectorAll('.faq-item').forEach(el => el.classList.remove('active'));
  if (!isActive) item.classList.add('active');
}

// Toast
function showToast(message) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// Expose functions globally
window.openProductModal = openProductModal;
window.quickWhatsApp = quickWhatsApp;
window.filterByCategory = filterByCategory;
window.changeMainImg = changeMainImg;
window.selectLength = selectLength;
window.changeQty = changeQty;
window.addToCart = addToCart;
window.updateCartQty = updateCartQty;
window.removeFromCart = removeFromCart;
window.orderOnWhatsApp = orderOnWhatsApp;
window.openGroupPurchase = openGroupPurchase;
window.finalizeOrderWhatsApp = finalizeOrderWhatsApp;
window.openGeneralWhatsApp = openGeneralWhatsApp;
window.showLegal = showLegal;
window.toggleFAQ = toggleFAQ;
window.closeModal = closeModal;
window.openCart = openCart;
window.closeCart = closeCart;


/* ===================== i18n / Language Switch ===================== */
const translations = {
  fr: {
    rights: "Tous droits réservés",
    "nav-home": "Accueil",
    "nav-hair": "Nos cheveux",
    "nav-wigs": "Perruques",
    "nav-grafts": "Greffes",
    "nav-closures": "Closures & Frontals",
    "nav-promo": "Promotions",
    "nav-delivery": "Livraison",
    "nav-about": "À propos",
    "hero-title": "Vente de greffes premium au Cameroun",
    "hero-sub": "Greffes lace et sans lace, closures, frontals et perruques prêtes à poser. Prix visibles, livraison nationale et commande rapide sur WhatsApp.",
    "btn-discover": "Découvrir nos collections",
    "btn-order-wa": "Commander sur WhatsApp",
    "adv1": "Cheveux de qualité premium",
    "adv2": "Livraison partout au Cameroun",
    "adv3": "Commande rapide sur WhatsApp",
    "adv4": "Assistance personnalisée",
    "adv5": "Produits pour tous les styles",
    "nav-groups": "Achats en groupe",
    "video-eyebrow": "En mouvement",
    "video-title": "Nos styles en vidéo",
    "video-sub": "Voyez le volume, la brillance et le mouvement de nos greffes et perruques avant de choisir votre coup de cœur.",
    "video-catalog": "Voir le catalogue",
    "video-unsupported": "Votre navigateur ne peut pas lire cette vidéo.",
    "video-label": "Look en vidéo",
    "video-card1-title": "Le mouvement qui fait la différence",
    "video-card1-text": "Appuyez sur lecture pour voir le rendu réel du modèle.",
    "video-card2-title": "Des textures à voir sous tous les angles",
    "video-card2-text": "Faites défiler ou utilisez les flèches pour découvrir les vidéos.",
    "groups-eyebrow": "La communauté Luciole",
    "groups-title": "On se retrouve, on cotise, on brille ✨",
    "groups-sub": "Créez un petit groupe avec votre famille, vos amis ou vos proches pour financer ensemble un modèle précis. Un espace simple, privé et joyeux.",
    "groups-create": "Créer un groupe",
    "groups-join": "Rejoindre un groupe",
    "groups-safety": "Pour votre sécurité, créez ou rejoignez principalement des groupes composés de personnes que vous connaissez et en qui vous avez confiance.",
    "groups-prompt-title": "Votre cercle Luciole vous attend 💬",
    "groups-prompt-text": "Connectez-vous pour créer un groupe, suivre les cotisations et échanger avec vos proches en toute simplicité.",
    "groups-login": "Se connecter",
    "groups-my": "Mes groupes",
    "groups-invites": "Invitations",
    "groups-contributions": "Mes cotisations",
    "groups-notifications": "Notifications",
    "textures-eyebrow": "Choisis ton mood",
    "textures-title": "Textures & styles qui font plaisir",
    "textures-sub": "Lisse, bouclé, body wave ou bob : explorez les textures selon votre envie du jour.",
    "cat-title": "Nos Catégories",
    "cat-sub": "Explorez notre gamme complète de cheveux premium pour tous les styles et toutes les envies.",
    "catalog-title": "Notre catalogue de cheveux",
    "catalog-sub": "Greffes, mèches, closures, frontals et perruques premium à choisir selon votre style.",
    "hero-lace-title": "Greffes lace HD",
    "hero-lace-sub": "Finition naturelle pour mariage, shooting, soirée.",
    "hero-nolace-title": "Greffes sans lace",
    "hero-nolace-sub": "Bob chic et volume quotidien, facile à entretenir.",
    "promo-title": "Campagne Pose Professionnelle",
    "promo-sub": "Nos professionnelles réalisent vos poses lace et greffes pour mariage, anniversaire, soirée, shooting et événements VIP.",
    "promo-1-title": "Pose Lace Mariage",
    "promo-1-text": "Finition HD, baby hair, ajustement de la ligne frontale et fixation longue tenue pour le jour J.",
    "promo-1-action": "Réserver ma pose",
    "promo-2-title": "Pose Anniversaire & Soirée",
    "promo-2-text": "Coiffage glamour, boucles définies, volume maîtrisé et finition photo-ready pour vos événements.",
    "promo-2-action": "Voir les styles",
    "promo-3-title": "Pose VIP à domicile",
    "promo-3-text": "Douala, Yaoundé et environs : nos professionnelles se déplacent selon planning pour votre pose complète.",
    "promo-4-title": "Conseil Morphologie & Choix de lace",
    "promo-4-text": "Nous vous aidons à choisir lace frontal, closure ou sans lace selon votre visage et votre budget.",
    "promo-4-action": "Parler à une pro",
    "delivery-title": "Livraison partout au Cameroun",
    "delivery-sub": "Nous livrons vos commandes dans toutes les régions du pays.",
    "delivery-text1": `« ${SITE_NAME} livre vos commandes dans toutes les régions du Cameroun. Les délais et frais de livraison sont confirmés sur WhatsApp selon votre ville et votre quartier. »`,
    "delivery-text2": "Que vous soyez à Douala, Yaoundé ou dans une ville plus éloignée, nous organisons la livraison de vos greffes, mèches et perruques avec soin.",
    "about-title": `À propos de ${SITE_NAME}`,
    "about-p1": `${SITE_NAME} est une boutique camerounaise spécialisée dans la vente de cheveux, greffes, mèches et perruques de qualité. Notre mission est d'aider chaque femme à trouver une coiffure adaptée à son style, à son budget et à sa personnalité. Nous proposons un accompagnement personnalisé et une livraison dans tout le Cameroun.`,
    "about-p2": "Chaque produit est sélectionné avec exigence pour garantir authenticité, douceur et longévité. Que vous recherchiez des greffes indiennes, brésiliennes, des closures, des frontals ou une perruque prête à porter, nous sommes à votre écoute sur WhatsApp pour vous conseiller.",
    "testimonials-title": "Avis de nos clientes",
    "testimonials-sub": "Des femmes du Cameroun entier nous font confiance.",
    "faq-title": "Foire aux questions",
    "faq-sub": "Tout ce que vous devez savoir avant de commander.",
    "btn-follow-fb": "Facebook",
    "btn-contact": "Nous contacter",
    "btn-share": "Partager mon expérience",
    "view": "Voir",
    "badge-new": "Nouveau",
    "badge-promo": "Promotion",
    "badge-best": "Meilleure vente",
    "badge-limited": "Stock limité",
    "price-confirm": "Prix à confirmer",
    "density": "Densité",
    "weight": "Poids",
    "type": "Type",
    "delivery": "Livraison",
    "care": "Conseils d’entretien",
    "size-length": "Taille / longueur disponible",
    "quantity": "Quantité",
    "buy-now": "Acheter maintenant",
    "buy-group": "Acheter avec un groupe",
    "cart-subtotal": "Sous-total",
    "cart-delivery-fee": "Frais de livraison",
    "cart-delivery-confirm": "À confirmer selon la ville",
    "cart-total": "Total provisoire",
    "cart-city-label": "Votre ville de livraison",
    "cart-city-placeholder": "Ex : Douala, Yaoundé, Bafoussam…",
    "cart-empty-sub": "Découvrez nos collections premium",
    "cart-added": "Produit ajouté au panier",
    "cart-removed": "Produit retiré du panier",
    "price-size-confirm": "Le prix de cette taille est à confirmer sur WhatsApp.",
    "group-price-needed": "Renseignez le prix de cette taille dans l’administration avant de créer un groupe.",
    "groups-loading": "L’espace groupes est en cours de chargement.",
    "partner-eyebrow": "Une présence locale",
    "partner-title": "Notre partenaire à Yaoundé",
    "partner-p1": "Pour mieux accompagner notre clientèle à Yaoundé, Beng Ndongo Hermine Virginie représente Luciole India Hair avec disponibilité, écoute et professionnalisme.",
    "partner-p2": "Elle est votre interlocutrice de proximité pour vous orienter, répondre à vos questions et faciliter le suivi de vos demandes dans la ville de Yaoundé.",
    "partner-reassurance": "Vous bénéficiez du même accompagnement attentif et des mêmes exigences de qualité que partout chez Luciole India Hair.",
    "delivery-all-cities": "+ toutes les villes",
    "cart-title": "Mon Panier",
    "cart-empty": "Votre panier est vide",
    "cart-finalize": "Finaliser ma commande sur WhatsApp",
    "search-placeholder": "Rechercher un produit...",
    "footer-desc": "Vente de greffes, mèches, extensions et perruques au Cameroun. Qualité premium, livraison nationale, service personnalisé sur WhatsApp.",
    "nav-products": "Nos produits",
    "see-products": "Voir les produits",
    "details": "Détails",
    "order": "Commander",
    "add-cart": "Ajouter au panier",
    "delivery-secure": "Livraison sécurisée",
    "delivery-secure-text": "Vos produits sont emballés avec soin et suivis jusqu'à votre porte.",
    "delivery-quote": "Demander un devis livraison",
    "nav-label": "Navigation",
    "info-label": "Informations",
    "contact-label": "Contact",
    "privacy": "Politique de confidentialité",
    "terms": "Conditions générales de vente",
    "faq-label": "FAQ",
    "testimonials-label": "Témoignages",
    "type-filter": "Type",
    "texture-filter": "Texture",
    "color-filter": "Couleur",
    "length-filter": "Longueur",
    "price-filter": "Prix",
    "promo-web-title": "Besoin d’un site web professionnel ?",
    "promo-web-text": `Vous aussi, créez une boutique en ligne élégante et moderne comme ${SITE_NAME}. Contactez-nous pour un site sur mesure.`,
    "promo-web-btn": "Contacter Luciole Services",

  },
  en: {
    rights: "All rights reserved",
    "nav-home": "Home",
    "nav-hair": "Our Hair",
    "nav-wigs": "Wigs",
    "nav-grafts": "Hair Bundles",
    "nav-closures": "Closures & Frontals",
    "nav-promo": "Promotions",
    "nav-delivery": "Delivery",
    "nav-about": "About",
    "hero-title": "Premium hair bundles for sale in Cameroon",
    "hero-sub": "Lace and non-lace bundles, closures, frontals and ready-to-wear wigs. Visible prices, nationwide delivery and fast WhatsApp ordering.",
    "btn-discover": "Discover our collections",
    "btn-order-wa": "Order on WhatsApp",
    "adv1": "Premium quality hair",
    "adv2": "Delivery all over Cameroon",
    "adv3": "Fast order via WhatsApp",
    "adv4": "Personalized assistance",
    "adv5": "Products for every style",
    "nav-groups": "Group purchases",
    "video-eyebrow": "In motion",
    "video-title": "Our styles on video",
    "video-sub": "See the volume, shine and movement of our hair bundles and wigs before choosing your favourite.",
    "video-catalog": "View the catalogue",
    "video-unsupported": "Your browser cannot play this video.",
    "video-label": "Watch the look",
    "video-card1-title": "Movement that makes all the difference",
    "video-card1-text": "Press play to see the style in real life.",
    "video-card2-title": "Textures to see from every angle",
    "video-card2-text": "Swipe or use the arrows to discover the videos.",
    "groups-eyebrow": "The Luciole community",
    "groups-title": "Meet up, contribute, shine ✨",
    "groups-sub": "Create a small group with family, friends or loved ones to fund a specific style together. A simple, private and joyful space.",
    "groups-create": "Create a group",
    "groups-join": "Join a group",
    "groups-safety": "For your safety, mainly create or join groups with people you know and trust.",
    "groups-prompt-title": "Your Luciole circle is waiting 💬",
    "groups-prompt-text": "Sign in to create a group, track contributions and chat easily with your loved ones.",
    "groups-login": "Sign in",
    "groups-my": "My groups",
    "groups-invites": "Invitations",
    "groups-contributions": "My contributions",
    "groups-notifications": "Notifications",
    "textures-eyebrow": "Choose your mood",
    "textures-title": "Textures & styles to love",
    "textures-sub": "Straight, curly, body wave or bob: explore textures to match your mood today.",
    "cat-title": "Our Categories",
    "cat-sub": "Explore our complete range of premium hair for every style and preference.",
    "catalog-title": "Our hair catalog",
    "catalog-sub": "Premium hair bundles, weaves, closures, frontals and wigs to match your style.",
    "hero-lace-title": "HD lace bundles",
    "hero-lace-sub": "Natural finish for weddings, photoshoots and parties.",
    "hero-nolace-title": "Non-lace bundles",
    "hero-nolace-sub": "Chic bob and daily volume, easy to maintain.",
    "promo-title": "Professional Installation Campaign",
    "promo-sub": "Our professionals install lace and bundles for weddings, birthdays, parties, shoots and VIP events.",
    "promo-1-title": "Wedding Lace Installation",
    "promo-1-text": "HD finish, baby hair styling, frontal line adjustment and long-hold fixing for your big day.",
    "promo-1-action": "Book my install",
    "promo-2-title": "Birthday & Party Installation",
    "promo-2-text": "Glam styling, defined curls, controlled volume and photo-ready finish for your events.",
    "promo-2-action": "View styles",
    "promo-3-title": "VIP Home Installation",
    "promo-3-text": "Douala, Yaoundé and nearby areas: our professionals can come to you based on schedule.",
    "promo-4-title": "Face Shape & Lace Guidance",
    "promo-4-text": "We help you choose lace frontal, closure or non-lace based on your face shape and budget.",
    "promo-4-action": "Talk to a pro",
    "delivery-title": "Delivery all over Cameroon",
    "delivery-sub": "We deliver your orders to every region of the country.",
    "delivery-text1": `« ${SITE_NAME} delivers your orders to every region of Cameroon. Delivery times and fees are confirmed on WhatsApp according to your city and neighborhood. »`,
    "delivery-text2": "Whether you are in Douala, Yaoundé or a more remote town, we carefully arrange the delivery of your hair bundles, weaves and wigs.",
    "about-title": `About ${SITE_NAME}`,
    "about-p1": `${SITE_NAME} is a Cameroonian boutique specializing in quality hair, bundles, weaves and wigs. Our mission is to help every woman find a hairstyle that matches her style, budget and personality. We offer personalized support and delivery throughout Cameroon.`,
    "about-p2": "Every product is carefully selected to guarantee authenticity, softness and longevity. Whether you are looking for Indian or Brazilian bundles, closures, frontals or a ready-to-wear wig, we are available on WhatsApp to advise you.",
    "testimonials-title": "Customer Reviews",
    "testimonials-sub": "Women from all over Cameroon trust us.",
    "faq-title": "Frequently Asked Questions",
    "faq-sub": "Everything you need to know before ordering.",
    "btn-follow-fb": "Facebook",
    "btn-contact": "Contact us",
    "btn-share": "Share my experience",
    "view": "View",
    "badge-new": "New",
    "badge-promo": "Promotion",
    "badge-best": "Best seller",
    "badge-limited": "Limited stock",
    "price-confirm": "Price to be confirmed",
    "density": "Density",
    "weight": "Weight",
    "type": "Type",
    "delivery": "Delivery",
    "care": "Care advice",
    "size-length": "Available size / length",
    "quantity": "Quantity",
    "buy-now": "Buy now",
    "buy-group": "Buy with a group",
    "cart-subtotal": "Subtotal",
    "cart-delivery-fee": "Delivery fee",
    "cart-delivery-confirm": "To be confirmed according to your city",
    "cart-total": "Estimated total",
    "cart-city-label": "Your delivery city",
    "cart-city-placeholder": "E.g. Douala, Yaoundé, Bafoussam…",
    "cart-empty-sub": "Discover our premium collections",
    "cart-added": "Product added to cart",
    "cart-removed": "Product removed from cart",
    "price-size-confirm": "The price for this size must be confirmed on WhatsApp.",
    "group-price-needed": "Add a price for this size in the admin area before creating a group.",
    "groups-loading": "The group space is loading.",
    "partner-eyebrow": "A local presence",
    "partner-title": "Our Yaoundé representative",
    "partner-p1": "To better serve our customers in Yaoundé, Beng Ndongo Hermine Virginie represents Luciole India Hair with availability, attentive listening and professionalism.",
    "partner-p2": "She is your local contact to guide you, answer your questions and help follow up on your requests in Yaoundé.",
    "partner-reassurance": "You benefit from the same attentive support and quality standards as everywhere at Luciole India Hair.",
    "delivery-all-cities": "+ all cities",
    "cart-title": "My Cart",
    "cart-empty": "Your cart is empty",
    "cart-finalize": "Finalize my order on WhatsApp",
    "search-placeholder": "Search a product...",
    "footer-desc": "Sale of hair bundles, weaves, extensions and wigs in Cameroon. Premium quality, nationwide delivery, personalized service on WhatsApp.",
    "nav-products": "Our products",
    "see-products": "See products",
    "details": "Details",
    "order": "Order",
    "add-cart": "Add to cart",
    "delivery-secure": "Secure delivery",
    "delivery-secure-text": "Your products are carefully packaged and tracked to your door.",
    "delivery-quote": "Request a delivery quote",
    "nav-label": "Navigation",
    "info-label": "Information",
    "contact-label": "Contact",
    "privacy": "Privacy Policy",
    "terms": "Terms & Conditions",
    "faq-label": "FAQ",
    "testimonials-label": "Reviews",
    "type-filter": "Type",
    "texture-filter": "Texture",
    "color-filter": "Color",
    "length-filter": "Length",
    "price-filter": "Price",
    "promo-web-title": "Need a professional website?",
    "promo-web-text": `You too can create an elegant, modern online store like ${SITE_NAME}. Contact us for a custom website.`,
    "promo-web-btn": "Contact Luciole Services",

  }
};

let currentLang = localStorage.getItem('luciole_lang') || 'fr';

function setLanguage(lang) {
  if (!translations[lang]) return;
  currentLang = lang;
  localStorage.setItem('luciole_lang', lang);
  document.documentElement.lang = lang;
  const t = translations[lang];

  // data-i18n elements
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (t[key]) el.textContent = t[key];
  });

  // Placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (t[key]) el.placeholder = t[key];
  });

  // Hero title (with HTML span)
  const heroH1 = document.querySelector('.hero-content h1');
  if (heroH1) {
    heroH1.innerHTML = lang === 'fr'
      ? 'Vente de <span>greffes premium</span> au Cameroun'
      : 'Premium <span>hair bundles</span> for sale in Cameroon';
  }

  // About paragraphs
  const aboutPs = document.querySelectorAll('.about-content > p');
  if (aboutPs[0] && t['about-p1']) aboutPs[0].textContent = t['about-p1'];
  if (aboutPs[1] && t['about-p2']) aboutPs[1].textContent = t['about-p2'];

  // Delivery texts
  const delTexts = document.querySelectorAll('.delivery-text p');
  if (delTexts[0] && t['delivery-text1']) delTexts[0].textContent = t['delivery-text1'];
  if (delTexts[1] && t['delivery-text2']) delTexts[1].textContent = t['delivery-text2'];

  // Footer description
  const footerP = document.querySelector('.footer-brand > p');
  if (footerP && t['footer-desc']) footerP.textContent = t['footer-desc'];

  // Search placeholder
  const search = document.getElementById('searchInput');
  if (search && t['search-placeholder']) search.placeholder = t['search-placeholder'];

  // Accessible labels follow the selected language as well.
  document.getElementById('accountBtn')?.setAttribute('aria-label', lang === 'en' ? 'Open my account' : 'Ouvrir mon espace');
  document.getElementById('cartBtn')?.setAttribute('aria-label', lang === 'en' ? 'Open cart' : 'Ouvrir le panier');
  document.getElementById('cartClose')?.setAttribute('aria-label', lang === 'en' ? 'Close cart' : 'Fermer le panier');
  const menuToggle = document.querySelector('.menu-toggle');
  if (menuToggle && !menuToggle.classList.contains('active')) menuToggle.setAttribute('aria-label', lang === 'en' ? 'Open menu' : 'Ouvrir le menu');

  // Footer column titles
  document.querySelectorAll('[data-i18n="nav-label"]').forEach(el => el.textContent = t['nav-label'] || el.textContent);
  document.querySelectorAll('[data-i18n="info-label"]').forEach(el => el.textContent = t['info-label'] || el.textContent);
  document.querySelectorAll('[data-i18n="contact-label"]').forEach(el => el.textContent = t['contact-label'] || el.textContent);

  // Footer links that have data-i18n
  document.querySelectorAll('.footer-links a[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (t[key]) el.textContent = t[key];
  });

  // Filter labels (first option of each select)
  const filterMap = [
    ['filterType', 'type-filter'],
    ['filterTexture', 'texture-filter'],
    ['filterColor', 'color-filter'],
    ['filterLength', 'length-filter'],
    ['filterPrice', 'price-filter']
  ];
  filterMap.forEach(([id, key]) => {
    const sel = document.getElementById(id);
    if (sel && sel.options[0] && t[key]) sel.options[0].textContent = t[key];
  });
  const filterOptionLabels = lang === 'en' ? {
    filterType: { lace: 'Lace wig', court: 'Short style / bob', perruque: 'All styles' },
    filterTexture: { lisse: 'Straight', ondulé: 'Wavy', bouclé: 'Curly' },
    filterColor: { noir: 'Natural black', brun: 'Brown / chocolate', bordeaux: 'Burgundy', miel: 'Golden honey' },
    filterPrice: { '0-30000': 'Under 30,000', '30000-50000': '30,000 – 50,000', '50000-100000': '50,000 – 100,000', '100000+': 'Over 100,000' }
  } : {
    filterType: { lace: 'Perruque lace', court: 'Coupe courte / bob', perruque: 'Tous les modèles' },
    filterTexture: { lisse: 'Lisse', ondulé: 'Ondulé', bouclé: 'Bouclé' },
    filterColor: { noir: 'Noir naturel', brun: 'Brun / Chocolat', bordeaux: 'Bordeaux', miel: 'Miel doré' },
    filterPrice: { '0-30000': 'Moins de 30 000', '30000-50000': '30 000 – 50 000', '50000-100000': '50 000 – 100 000', '100000+': 'Plus de 100 000' }
  };
  Object.entries(filterOptionLabels).forEach(([id, labels]) => {
    document.querySelectorAll(`#${id} option`).forEach((option) => {
      if (labels[option.value]) option.textContent = labels[option.value];
    });
  });
  document.querySelectorAll('#filterLength option[value]').forEach((option) => {
    if (option.value) option.textContent = `${option.value} ${lang === 'en' ? 'inches' : 'pouces'}`;
  });

  // Delivery visual box
  const delVisualH = document.querySelector('.delivery-visual h3');
  if (delVisualH && t['delivery-secure']) delVisualH.textContent = t['delivery-secure'];
  const delVisualP = document.querySelector('.delivery-visual p');
  if (delVisualP && t['delivery-secure-text']) delVisualP.textContent = t['delivery-secure-text'];
  const delQuoteBtn = document.querySelector('.delivery-visual .btn');
  if (delQuoteBtn && t['delivery-quote']) {
    delQuoteBtn.innerHTML = '<i class="fab fa-whatsapp"></i> ' + t['delivery-quote'];
  }

  // Contact / share buttons in about & testimonials
  document.querySelectorAll('.about-content .btn-primary span, .about-content .btn-primary').forEach(el => {
    if (el.childNodes.length && t['btn-contact']) {
      // keep icon if present
    }
  });

  // Active lang buttons
  document.querySelectorAll('.lang-btn').forEach(btn => {
    const txt = btn.textContent.trim().toUpperCase();
    const isFr = txt.includes('FR') || txt.includes('FRANÇAIS') || txt.includes('FRANCAIS');
    const isEn = txt.includes('EN') || txt.includes('ENGLISH');
    btn.classList.toggle('active', (lang === 'fr' && isFr) || (lang === 'en' && isEn));
  });

  // Re-render dynamic parts
  if (typeof renderCategories === 'function') renderCategories();
  if (typeof renderProducts === 'function') {
    const data = (typeof PRODUCTS_DATA !== 'undefined' && PRODUCTS_DATA) ? PRODUCTS_DATA : PRODUCTS;
    renderProducts(data);
  }
  if (typeof renderFAQ === 'function') renderFAQ();
  if (typeof renderTestimonials === 'function') renderTestimonials();
  if (window.GroupUI?.render) window.GroupUI.render();
  if (typeof updateCartUI === 'function') updateCartUI();
  if (typeof window.refreshVideoStories === 'function') window.refreshVideoStories();

  // Web promo banner
  const promoH = document.querySelector('.web-promo-text h3');
  const promoP = document.querySelector('.web-promo-text p');
  const promoBtn = document.querySelector('.web-promo-btn');
  if (promoH && t['promo-web-title']) promoH.textContent = t['promo-web-title'];
  if (promoP && t['promo-web-text']) promoP.textContent = t['promo-web-text'];
  if (promoBtn && t['promo-web-btn']) promoBtn.innerHTML = '<i class="fab fa-whatsapp"></i> ' + t['promo-web-btn'];
}

function hideLangBanner() {
  const banner = document.getElementById('langBanner');
  if (banner) {
    banner.classList.add('hidden');
    setTimeout(() => { banner.style.display = 'none'; }, 700);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setLanguage(currentLang);
  setTimeout(hideLangBanner, 5000);
});

window.setLanguage = setLanguage;
window.hideLangBanner = hideLangBanner;


/* ===== Scroll Reveal ===== */
function initScrollReveal() {
  const reveals = document.querySelectorAll('.section-title, .section-subtitle, .category-card, .promo-card, .testimonial-card, .faq-item, .delivery-content > div, .about-content');
  reveals.forEach((el, i) => {
    el.classList.add('reveal');
    if (i % 4 === 1) el.classList.add('reveal-delay-1');
    if (i % 4 === 2) el.classList.add('reveal-delay-2');
    if (i % 4 === 3) el.classList.add('reveal-delay-3');
  });
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) entry.target.classList.add('visible');
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}
document.addEventListener('DOMContentLoaded', initScrollReveal);

/* ===== Video promotion carousel ===== */
const VIDEO_STORIES = {
  fr: [
    { kicker: 'BEAUTÉ • CONFIANCE • SORORITÉ', title: 'Ta beauté n’a pas besoin d’autorisation.', text: 'Fais de ta couronne une signature. Tu es déjà la lumière du plan.' },
    { kicker: 'ENTRE ELLES, ON AVANCE', title: 'Un rêve devient plus léger quand on cotise ensemble.', text: 'Crée ton groupe Luciole, invite tes sœurs et rapprochez-vous du modèle qui vous fait vibrer.' },
    { kicker: 'CROWN YOUR STORY', title: 'Tu n’es pas “trop”. Tu es exactement la vibe.', text: 'Choisis le look qui te ressemble et entre dans chaque pièce avec confiance.' },
    { kicker: 'GLOW UP COLLECTIF', title: 'Une cotisation après l’autre, le glow-up arrive.', text: 'En famille ou entre amies, chaque petite contribution construit un grand moment pour l’une de vous.' },
    { kicker: 'MAIN CHARACTER ENERGY', title: 'Ta couronne raconte déjà une histoire puissante.', text: 'Ose la texture, la longueur, la couleur et le style qui te font te sentir invincible.' },
    { kicker: 'ENSEMBLE, ON BRILLE', title: 'Quand les femmes se soutiennent, tout devient possible.', text: 'Lance un groupe, motivez-vous et célébrez la beauté de chacune, sans comparaison.' }
  ],
  en: [
    { kicker: 'BEAUTY • CONFIDENCE • SISTERHOOD', title: 'Your beauty does not need permission.', text: 'Make your crown your signature. You are already the light in the frame.' },
    { kicker: 'WE MOVE TOGETHER', title: 'A dream feels lighter when we contribute together.', text: 'Create your Luciole group, invite your sisters and move closer to the style you love.' },
    { kicker: 'CROWN YOUR STORY', title: 'You are not “too much”. You are exactly the vibe.', text: 'Choose the look that feels like you and walk into every room with confidence.' },
    { kicker: 'COLLECTIVE GLOW UP', title: 'One contribution at a time, the glow-up is coming.', text: 'With family or friends, each small contribution builds a big moment for one of you.' },
    { kicker: 'MAIN CHARACTER ENERGY', title: 'Your crown already tells a powerful story.', text: 'Own the texture, length, colour and style that make you feel unstoppable.' },
    { kicker: 'WE SHINE TOGETHER', title: 'When women support women, anything is possible.', text: 'Start a group, motivate each other and celebrate every kind of beauty without comparison.' }
  ]
};

let videoStoryIndex = 0;
let videoStoryTimer = null;

function renderVideoStories() {
  const stories = VIDEO_STORIES[document.documentElement.lang === 'en' ? 'en' : 'fr'];
  const story = stories[videoStoryIndex % stories.length];
  document.querySelectorAll('[data-video-story]').forEach((element) => {
    element.classList.add('is-changing');
    window.setTimeout(() => {
      element.querySelector('.video-story-kicker').textContent = story.kicker;
      element.querySelector('h3').textContent = story.title;
      element.querySelector('.video-story-text').textContent = story.text;
      const counter = element.closest('.video-story-copy')?.querySelector('.video-story-topline > span:last-child');
      if (counter) counter.textContent = `${String(videoStoryIndex % stories.length + 1).padStart(2, '0')} / ${String(stories.length).padStart(2, '0')}`;
      element.classList.remove('is-changing');
    }, 230);
  });
}

function initVideoStories() {
  if (!document.querySelector('[data-video-story]')) return;
  renderVideoStories();
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  videoStoryTimer = window.setInterval(() => {
    videoStoryIndex += 1;
    renderVideoStories();
  }, 4800);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && videoStoryTimer) {
      window.clearInterval(videoStoryTimer);
      videoStoryTimer = null;
    }
    if (!document.hidden && !videoStoryTimer) videoStoryTimer = window.setInterval(() => { videoStoryIndex += 1; renderVideoStories(); }, 4800);
  });
}

window.refreshVideoStories = renderVideoStories;
document.addEventListener('DOMContentLoaded', initVideoStories);

function initVideoCarousel() {
  const viewport = document.getElementById('videoCarouselViewport');
  const track = viewport?.querySelector('.video-carousel-track');
  const cards = track ? Array.from(track.children) : [];
  const dots = Array.from(document.querySelectorAll('[data-video-dot]'));
  const previous = document.querySelector('[data-video-prev]');
  const next = document.querySelector('[data-video-next]');
  if (!viewport || !track || cards.length < 2) return;

  let current = 0;
  let timer = null;
  let pointerStart = null;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  function pauseHiddenVideos() {
    cards.forEach((card, index) => {
      if (index !== current) card.querySelector('video')?.pause();
      else card.querySelector('video')?.play?.().catch(() => {});
    });
  }

  function goTo(index) {
    current = (index + cards.length) % cards.length;
    track.style.transform = `translateX(-${current * 100}%)`;
    dots.forEach((dot, dotIndex) => dot.classList.toggle('active', dotIndex === current));
    pauseHiddenVideos();
  }

  function stopAuto() {
    if (timer) window.clearInterval(timer);
    timer = null;
  }

  function startAuto() {
    if (reducedMotion) return;
    stopAuto();
    timer = window.setInterval(() => goTo(current + 1), 6500);
  }

  previous?.addEventListener('click', () => { goTo(current - 1); startAuto(); });
  next?.addEventListener('click', () => { goTo(current + 1); startAuto(); });
  dots.forEach((dot, index) => dot.addEventListener('click', () => { goTo(index); startAuto(); }));
  viewport.addEventListener('mouseenter', stopAuto);
  viewport.addEventListener('mouseleave', startAuto);
  viewport.addEventListener('focusin', stopAuto);
  viewport.addEventListener('focusout', startAuto);
  viewport.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); goTo(current - 1); startAuto(); }
    if (event.key === 'ArrowRight') { event.preventDefault(); goTo(current + 1); startAuto(); }
  });
  viewport.addEventListener('pointerdown', (event) => { pointerStart = event.clientX; });
  viewport.addEventListener('pointerup', (event) => {
    if (pointerStart === null) return;
    const distance = event.clientX - pointerStart;
    pointerStart = null;
    if (Math.abs(distance) < 45) return;
    goTo(distance < 0 ? current + 1 : current - 1);
    startAuto();
  });
  viewport.addEventListener('pointercancel', () => { pointerStart = null; });
  document.addEventListener('visibilitychange', () => document.hidden ? stopAuto() : startAuto());

  goTo(0);
  startAuto();
}
document.addEventListener('DOMContentLoaded', initVideoCarousel);

/* ===== Hero Slider ===== */
(function initHeroSlider() {
  function start() {
    const slides = document.querySelectorAll('.hero-slide');
    const dots = document.querySelectorAll('.hero-dot');
    if (!slides.length) return;
    let current = 0;
    let timer;
    function goTo(index) {
      slides[current].classList.remove('active');
      if (dots[current]) dots[current].classList.remove('active');
      current = (index + slides.length) % slides.length;
      slides[current].classList.add('active');
      if (dots[current]) dots[current].classList.add('active');
    }
    function next() { goTo(current + 1); }
    dots.forEach(dot => {
      dot.addEventListener('click', () => {
        goTo(parseInt(dot.dataset.slide, 10));
        clearInterval(timer);
        timer = setInterval(next, 5500);
      });
    });
    timer = setInterval(next, 5500);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
