import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  writeBatch
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyA_yhUg0V4KANKljVZ3OFtxSQdUHTQDktw',
  authDomain: 'luciole-india-hair-2911c.firebaseapp.com',
  projectId: 'luciole-india-hair-2911c',
  storageBucket: 'luciole-india-hair-2911c.firebasestorage.app',
  messagingSenderId: '894131951013',
  appId: '1:894131951013:web:915011f532c5e57292844c'
};

const OWNER_EMAIL = 'kerenetchapga@gmail.com';
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

let products = [];
let pendingPayments = [];
let stopProducts = null;
let stopPayments = null;
let currentAdmin = null;
let paymentLoadVersion = 0;

const byId = (id) => document.getElementById(id);
const escapeHTML = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const toNumber = (value) => Math.max(0, Math.round(Number(value) || 0));
const money = (value) => `${new Intl.NumberFormat('fr-FR').format(Number(value) || 0)} FCFA`;

function setLoginStatus(message, error = false) {
  const element = byId('adminLoginStatus');
  if (!element) return;
  element.textContent = message;
  element.style.color = error ? '#e63946' : '#6b6b6b';
}

function normalizeProduct(id, raw = {}) {
  const numericId = Number(raw.id ?? id);
  return {
    ...raw,
    id: Number.isFinite(numericId) ? numericId : id,
    referencePrice: toNumber(raw.referencePrice),
    promoPrice: raw.promoPrice == null ? null : toNumber(raw.promoPrice),
    promo: Boolean(raw.promo && toNumber(raw.promoPrice) > 0),
    stock: Math.max(0, Math.round(Number(raw.stock) || 0)),
    published: raw.published !== false,
    lengths: Array.isArray(raw.lengths)
      ? raw.lengths.map((variant) => ({ length: String(variant.length || '').trim(), price: toNumber(variant.price) })).filter((variant) => variant.length)
      : [],
    images: Array.isArray(raw.images) ? raw.images.map(String).filter(Boolean) : []
  };
}

async function isAuthorizedAdmin(user) {
  if (!user) return false;
  if ((user.email || '').toLowerCase() === OWNER_EMAIL) return true;
  const profile = await getDoc(doc(db, 'users', user.uid));
  return profile.exists() && ['general_admin', 'payment_manager'].includes(profile.data().role);
}

async function readLegacyOverrides() {
  try {
    const snapshot = await getDoc(doc(db, 'catalog_prices', 'overrides'));
    return snapshot.exists() ? (snapshot.data().prices || {}) : {};
  } catch (_) {
    return {};
  }
}

function getSeedProducts() {
  try {
    const saved = JSON.parse(localStorage.getItem('luciole_products') || 'null');
    if (Array.isArray(saved) && saved.length) return saved;
  } catch (_) {}
  return window.LUCIOLE_SEED_PRODUCTS || [];
}

async function bootstrapProductsIfNeeded() {
  const productsRef = collection(db, 'products');
  const existing = await getDocs(productsRef);
  if (!existing.empty) return;

  const overrides = await readLegacyOverrides();
  const seed = getSeedProducts();
  if (!seed.length) throw new Error('Le catalogue initial est introuvable.');
  const batch = writeBatch(db);
  seed.forEach((source) => {
    const product = normalizeProduct(source.id, source);
    const legacyPrice = toNumber(overrides[String(product.id)]);
    if (legacyPrice > 0) {
      product.referencePrice = legacyPrice;
      product.lengths = product.lengths.map((variant) => ({ ...variant, price: legacyPrice }));
    }
    batch.set(doc(db, 'products', String(product.id)), {
      ...product,
      published: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: currentAdmin.uid
    });
  });
  await batch.commit();
}

function showPanel() {
  byId('loginScreen').style.display = 'none';
  byId('adminPanel').classList.add('active');
}

function hidePanel() {
  byId('adminPanel').classList.remove('active');
  byId('loginScreen').style.display = 'flex';
}

function subscribeProducts() {
  stopProducts?.();
  stopProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
    products = snapshot.docs
      .map((item) => normalizeProduct(item.id, item.data()))
      .sort((a, b) => Number(a.id) - Number(b.id));
    localStorage.setItem('luciole_products', JSON.stringify(products));
    localStorage.setItem('luciole_catalog_version', window.LUCIOLE_CATALOG_VERSION || 'firestore');
    renderAdminTable();
  }, (error) => {
    console.error(error);
    alert(`Impossible de charger le catalogue Firestore : ${error.message}`);
  });
}

function paymentDate(value) {
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString('fr-FR') : 'Non précisée';
}

function paymentTimestamp(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
}

function renderPayments() {
  const tbody = byId('paymentsTableBody');
  if (!tbody) return;
  byId('statPending').textContent = pendingPayments.length;
  byId('paymentsCount').textContent = `${pendingPayments.length} paiement(s) en attente`;
  if (!pendingPayments.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="adm-empty-row"><i class="fas fa-circle-check"></i> Aucune cotisation en attente.</td></tr>';
    return;
  }
  tbody.innerHTML = pendingPayments.map((payment) => `<tr>
    <td><div class="adm-product-name">${escapeHTML(payment.groupName)}</div><div class="adm-product-id">${escapeHTML(payment.groupId)}</div></td>
    <td><strong>${escapeHTML(payment.senderName || 'Membre')}</strong><div class="adm-product-id">${escapeHTML(payment.senderPhone || '')}<br>${escapeHTML(paymentDate(payment.transferredAt))}</div></td>
    <td><strong>${escapeHTML(payment.recipientOperator || payment.paymentMethod || '')}</strong><div class="adm-product-id">${escapeHTML(payment.recipientNumber || '')}<br>${escapeHTML(payment.recipientName || '')}</div></td>
    <td><strong>${money(payment.amount)}</strong></td>
    <td><strong>${escapeHTML(payment.reference || '')}</strong><div class="adm-product-id">${escapeHTML(payment.note || '')}</div></td>
    <td><span class="adm-payment-status">À vérifier</span></td>
    <td><div class="adm-payment-actions">
      <button class="proof" onclick="showPaymentProof('${escapeHTML(payment.proofId || payment.id)}')"><i class="fas fa-image"></i> Preuve</button>
      <button class="confirm" onclick="confirmPayment('${escapeHTML(payment.groupId)}','${escapeHTML(payment.id)}')"><i class="fas fa-check"></i> Confirmer</button>
      <button class="reject" onclick="rejectPayment('${escapeHTML(payment.groupId)}','${escapeHTML(payment.id)}','${escapeHTML(payment.proofId || payment.id)}')"><i class="fas fa-xmark"></i> Refuser</button>
    </div></td>
  </tr>`).join('');
}

function subscribePayments() {
  stopPayments?.();
  const pendingQuery = query(collectionGroup(db, 'contributions'), where('status', '==', 'declared'));
  stopPayments = onSnapshot(pendingQuery, async (snapshot) => {
    const version = ++paymentLoadVersion;
    try {
      const rows = await Promise.all(snapshot.docs.map(async (item) => {
        const groupRef = item.ref.parent.parent;
        const groupSnapshot = await getDoc(groupRef);
        return {
          id: item.id,
          groupId: groupRef.id,
          groupName: groupSnapshot.exists() ? (groupSnapshot.data().name || 'Groupe Luciole') : 'Groupe Luciole',
          ...item.data()
        };
      }));
      if (version !== paymentLoadVersion) return;
      pendingPayments = rows.sort((a, b) => paymentTimestamp(b.createdAt) - paymentTimestamp(a.createdAt));
      renderPayments();
    } catch (error) {
      console.error(error);
      tbodyPaymentError(error);
    }
  }, tbodyPaymentError);
}

function tbodyPaymentError(error) {
  const tbody = byId('paymentsTableBody');
  if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="adm-empty-row" style="color:var(--adm-danger)">Impossible de charger les cotisations : ${escapeHTML(error.message)}</td></tr>`;
}

async function showPaymentProof(proofId) {
  const dialog = byId('paymentProofDialog');
  const image = byId('paymentProofImage');
  image.removeAttribute('src');
  try {
    const snapshot = await getDoc(doc(db, 'paymentProofs', proofId));
    if (!snapshot.exists()) throw new Error('Cette preuve a déjà été supprimée.');
    const proof = snapshot.data();
    if (!/^data:image\/(jpeg|png|webp);base64,/i.test(proof.dataUrl || '')) throw new Error('Format de preuve invalide.');
    image.src = proof.dataUrl;
    dialog.showModal();
  } catch (error) {
    alert(`Impossible d’ouvrir la preuve : ${error.message}`);
  }
}

function closePaymentProof() {
  byId('paymentProofImage').removeAttribute('src');
  byId('paymentProofDialog').close();
}

function referenceDocumentId(reference) {
  return encodeURIComponent(String(reference || '').trim().toUpperCase()).slice(0, 900);
}

async function purgeGroupProofs(groupId) {
  const snapshot = await getDocs(query(collection(db, 'paymentProofs'), where('groupId', '==', groupId)));
  for (let start = 0; start < snapshot.docs.length; start += 400) {
    const batch = writeBatch(db);
    snapshot.docs.slice(start, start + 400).forEach((item) => batch.delete(item.ref));
    await batch.commit();
  }
  return snapshot.size;
}

async function confirmPayment(groupId, contributionId) {
  const payment = pendingPayments.find((item) => item.groupId === groupId && item.id === contributionId);
  if (!payment) return alert('Cette cotisation n’est plus en attente.');
  if (payment.memberId === currentAdmin.uid) return alert('Pour votre sécurité, vous ne pouvez pas confirmer votre propre cotisation. Utilisez un autre compte administrateur autorisé.');
  if (!confirm(`Avez-vous vérifié ${money(payment.amount)} et la référence ${payment.reference} dans le relevé du compte officiel ?`)) return;

  const groupRef = doc(db, 'groups', groupId);
  const contributionRef = doc(groupRef, 'contributions', contributionId);
  const referenceRef = doc(db, 'paymentReferences', referenceDocumentId(payment.reference));
  let completed = false;
  try {
    await runTransaction(db, async (transaction) => {
      const [groupSnapshot, contributionSnapshot, referenceSnapshot] = await Promise.all([
        transaction.get(groupRef),
        transaction.get(contributionRef),
        transaction.get(referenceRef)
      ]);
      if (!groupSnapshot.exists() || !contributionSnapshot.exists()) throw new Error('Groupe ou cotisation introuvable.');
      const contribution = contributionSnapshot.data();
      if (contribution.status !== 'declared') throw new Error('Cette cotisation a déjà été traitée.');
      if (referenceSnapshot.exists() && referenceSnapshot.data().contributionId !== contributionId) throw new Error('Cette référence de transaction a déjà été confirmée.');
      const group = groupSnapshot.data();
      const confirmedTotal = Math.max(0, Number(group.confirmedTotal) || 0);
      const amount = Math.max(0, Number(contribution.amount) || 0);
      const target = Math.max(1, Number(group.targetAmount) || 1);
      const remaining = Math.max(0, target - confirmedTotal);
      if (!amount || amount > remaining) throw new Error(`Le montant dépasse le reste à collecter (${money(remaining)}). Refusez cette déclaration et demandez un montant corrigé.`);
      const nextTotal = confirmedTotal + amount;
      completed = nextTotal >= target;
      transaction.set(referenceRef, {
        reference: contribution.reference,
        groupId,
        contributionId,
        confirmedBy: currentAdmin.uid,
        confirmedAt: serverTimestamp()
      });
      transaction.update(contributionRef, {
        status: 'confirmed',
        confirmedBy: currentAdmin.uid,
        confirmedAt: serverTimestamp()
      });
      const groupUpdate = {
        confirmedTotal: nextTotal,
        status: completed ? 'completed' : 'funding',
        updatedAt: serverTimestamp()
      };
      if (completed) groupUpdate.completedAt = serverTimestamp();
      transaction.update(groupRef, groupUpdate);
      transaction.set(doc(collection(groupRef, 'messages')), {
        system: true,
        content: completed ? 'Objectif atteint ! Les preuves privées de paiement sont maintenant supprimées.' : `Une cotisation de ${money(amount)} a été confirmée par Luciole.`,
        createdAt: serverTimestamp()
      });
    });
    if (!completed) {
      alert('✅ Paiement confirmé après vérification du relevé officiel.');
      return;
    }
    try {
      const deletedProofs = await purgeGroupProofs(groupId);
      alert(`✅ Paiement confirmé, objectif atteint et ${deletedProofs} preuve(s) privée(s) supprimée(s).`);
    } catch (cleanupError) {
      console.error('Payment confirmed, but proof cleanup failed:', cleanupError);
      alert('⚠️ Le paiement est confirmé et le groupe est terminé, mais le nettoyage des captures a échoué. Réessayez depuis une connexion stable.');
    }
  } catch (error) {
    alert(`Confirmation impossible : ${error.message}`);
  }
}

async function rejectPayment(groupId, contributionId, proofId) {
  const reason = prompt('Motif du refus (visible dans le suivi administratif) :', 'Référence introuvable ou informations incorrectes');
  if (reason === null) return;
  try {
    await setDoc(doc(db, 'groups', groupId, 'contributions', contributionId), {
      status: 'rejected',
      rejectionReason: reason.trim().slice(0, 300),
      rejectedBy: currentAdmin.uid,
      rejectedAt: serverTimestamp(),
      proofDeletedAt: serverTimestamp()
    }, { merge: true });
    await deleteDoc(doc(db, 'paymentProofs', proofId)).catch(() => {});
    alert('Cotisation refusée et capture privée supprimée.');
  } catch (error) {
    alert(`Refus impossible : ${error.message}`);
  }
}

async function login() {
  setLoginStatus('Connexion sécurisée en cours…');
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    if (error.code === 'auth/popup-blocked') {
      await signInWithRedirect(auth, googleProvider);
      return;
    }
    if (error.code !== 'auth/popup-closed-by-user') setLoginStatus(`Connexion impossible : ${error.message}`, true);
  }
}

async function logout() {
  stopProducts?.();
  stopProducts = null;
  stopPayments?.();
  stopPayments = null;
  await signOut(auth);
}

function parseVariants(input) {
  return String(input || '').split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const [rawLength, rawPrice = ''] = line.split('|');
    let length = rawLength.trim();
    if (/^\d+$/.test(length)) length += ' pouces';
    return { length, price: toNumber(rawPrice.replace(/\D/g, '')) };
  }).filter((variant) => variant.length);
}

function updateStats() {
  byId('statTotal').textContent = products.length;
  byId('statPromo').textContent = products.filter((product) => product.promo).length;
  byId('statNew').textContent = products.filter((product) => product.badge === 'nouveau').length;
  byId('statStock').textContent = products.filter((product) => product.stock === 0 || product.badge === 'limite' || product.availability === 'Stock limité').length;
  byId('tableCount').textContent = `${products.length} produit(s)`;
}

function badgeHtml(badge) {
  const map = { nouveau: 'Nouveau', promo: 'Promotion', best: 'Best-seller', limite: 'Stock limité' };
  return badge && map[badge]
    ? `<span class="adm-badge ${escapeHTML(badge)}">${map[badge]}</span>`
    : '<span style="color:#bbb;">—</span>';
}

function imageUrl(path) {
  if (!path) return '../images/hair-straight.jpg';
  return /^(https?:|data:|\/)/i.test(path) ? path : `../${path}`;
}

function renderAdminTable() {
  const tbody = byId('adminTableBody');
  tbody.innerHTML = products.map((product) => {
    const variantPrices = product.lengths.map((variant) => Number(variant.price)).filter((price) => price > 0);
    const displayPrice = product.referencePrice || (variantPrices.length ? Math.min(...variantPrices) : 0);
    return `<tr>
      <td><img src="${escapeHTML(imageUrl(product.images[0]))}" class="adm-thumb" onerror="this.src='../images/hair-straight.jpg'" alt="${escapeHTML(product.name)}"></td>
      <td><div class="adm-product-name">${escapeHTML(product.name)}</div><div class="adm-product-id">#${escapeHTML(product.id)} · ${product.published ? 'Publié' : 'Brouillon'}</div></td>
      <td>${escapeHTML(product.category || '')}</td>
      <td><div style="display:flex;align-items:center;gap:6px;">
        <input type="number" class="adm-inline-price" data-product-id="${escapeHTML(product.id)}" value="${displayPrice || ''}" placeholder="0" min="0" step="100" style="width:115px;padding:7px 10px;border:1.5px solid var(--adm-border);border-radius:8px;font-size:0.88rem;font-family:inherit;outline:none;font-weight:600;" onchange="savePriceInline('${escapeHTML(product.id)}', this.value)">
        <span style="font-size:0.7rem;color:var(--adm-gray);">FCFA</span></div></td>
      <td>${badgeHtml(product.badge)}</td>
      <td><div class="adm-row-actions">
        <button class="adm-btn-edit" title="Modifier" onclick="editProduct('${escapeHTML(product.id)}')"><i class="fas fa-pen"></i></button>
        <button class="adm-btn-del" title="Supprimer" onclick="deleteProduct('${escapeHTML(product.id)}')"><i class="fas fa-trash"></i></button>
      </div></td>
    </tr>`;
  }).join('');
  updateStats();
}

async function savePriceInline(productId, rawPrice) {
  const price = toNumber(rawPrice);
  const product = products.find((item) => String(item.id) === String(productId));
  if (!product) return;
  const input = document.querySelector(`.adm-inline-price[data-product-id="${CSS.escape(String(productId))}"]`);
  if (input) input.disabled = true;
  try {
    await setDoc(doc(db, 'products', String(productId)), {
      referencePrice: price,
      lengths: product.lengths.map((variant) => ({ ...variant, price })),
      updatedAt: serverTimestamp(),
      updatedBy: currentAdmin.uid
    }, { merge: true });
    if (input) input.style.borderColor = '#1a7a47';
  } catch (error) {
    if (input) input.style.borderColor = '#e63946';
    alert(`Le prix n'a pas été enregistré dans Firestore : ${error.message}`);
  } finally {
    if (input) input.disabled = false;
  }
}

async function saveProduct() {
  const rawId = byId('editId').value;
  const id = rawId || String(Date.now());
  const name = byId('pName').value.trim();
  const lengths = parseVariants(byId('pVariants').value);
  if (!name) return alert('Le nom est obligatoire.');
  if (!lengths.length) return alert('Ajoutez au moins une taille / longueur.');
  const images = byId('pImages').value.split('\n').map((image) => image.trim()).filter(Boolean);
  const promoPrice = toNumber(byId('pPromoPrice').value);
  const existing = products.find((item) => String(item.id) === String(id));
  const product = normalizeProduct(id, {
    id: Number.isFinite(Number(id)) ? Number(id) : id,
    name,
    type: byId('pType').value,
    texture: byId('pTexture').value,
    color: byId('pColor').value.trim(),
    category: byId('pCategory').value,
    lengths,
    density: byId('pDensity').value.trim(),
    weight: byId('pWeight').value.trim(),
    description: byId('pDescription').value.trim(),
    care: byId('pCare').value.trim() || 'Lavez avec un shampooing doux. Hydratez régulièrement.',
    delivery: existing?.delivery || '3-7 jours selon la ville',
    availability: byId('pAvailability').value,
    stock: byId('pStock').value,
    badge: byId('pBadge').value || null,
    referencePrice: byId('pReferencePrice').value,
    images: images.length ? images : (existing?.images?.length ? existing.images : ['images/catalogue/modele-2.jpg']),
    promo: promoPrice > 0,
    promoPrice: promoPrice || null,
    published: byId('pPublished').checked
  });

  try {
    await setDoc(doc(db, 'products', String(id)), {
      ...product,
      ...(existing ? {} : { createdAt: serverTimestamp() }),
      updatedAt: serverTimestamp(),
      updatedBy: currentAdmin.uid
    }, { merge: true });
    resetForm();
    alert('✅ Produit enregistré dans Firestore. Le site public se met à jour automatiquement.');
  } catch (error) {
    alert(`❌ Enregistrement refusé : ${error.message}`);
  }
}

function editProduct(productId) {
  const product = products.find((item) => String(item.id) === String(productId));
  if (!product) return;
  byId('formTitle').innerHTML = '<i class="fas fa-pen"></i> &nbsp;Modifier le produit';
  byId('editId').value = product.id;
  byId('pName').value = product.name || '';
  byId('pCategory').value = product.category || '';
  byId('pType').value = product.type || 'perruque';
  byId('pTexture').value = product.texture || 'lisse';
  byId('pColor').value = product.color || '';
  byId('pDensity').value = product.density || '';
  byId('pWeight').value = product.weight || '';
  byId('pBadge').value = product.badge || '';
  byId('pVariants').value = product.lengths.map((variant) => `${variant.length} | ${variant.price || ''}`).join('\n');
  byId('pReferencePrice').value = product.referencePrice || '';
  byId('pPromoPrice').value = product.promoPrice || '';
  byId('pDescription').value = product.description || '';
  byId('pCare').value = product.care || '';
  byId('pImages').value = product.images.join('\n');
  byId('pAvailability').value = product.availability || 'Disponible';
  byId('pStock').value = product.stock ?? 0;
  byId('pPublished').checked = product.published !== false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteProduct(productId) {
  if (!confirm('Supprimer définitivement ce produit du catalogue Firestore ?')) return;
  try {
    await deleteDoc(doc(db, 'products', String(productId)));
  } catch (error) {
    alert(`Suppression impossible : ${error.message}`);
  }
}

function resetForm() {
  byId('formTitle').innerHTML = '<i class="fas fa-plus-circle"></i> &nbsp;Ajouter un produit';
  byId('editId').value = '';
  byId('pName').value = '';
  byId('pDescription').value = '';
  byId('pCare').value = '';
  byId('pVariants').value = '';
  byId('pImages').value = '';
  byId('pBadge').value = '';
  byId('pReferencePrice').value = '';
  byId('pPromoPrice').value = '';
  byId('pStock').value = '1';
  byId('pPublished').checked = true;
}

Object.assign(window, { login, logout, savePriceInline, saveProduct, editProduct, deleteProduct, resetForm, showPaymentProof, closePaymentProof, confirmPayment, rejectPayment });

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    currentAdmin = null;
    hidePanel();
    setLoginStatus('Accès réservé au compte administrateur autorisé dans Firebase.');
    return;
  }
  setLoginStatus('Vérification des droits…');
  try {
    if (!(await isAuthorizedAdmin(user))) {
      setLoginStatus(`Le compte ${user.email || ''} n'a pas le rôle administrateur.`, true);
      await signOut(auth);
      return;
    }
    currentAdmin = user;
    showPanel();
    await bootstrapProductsIfNeeded();
    subscribeProducts();
    subscribePayments();
  } catch (error) {
    hidePanel();
    setLoginStatus(`Erreur Firestore : ${error.message}`, true);
  }
});

getRedirectResult(auth).catch((error) => setLoginStatus(`Connexion impossible : ${error.message}`, true));
