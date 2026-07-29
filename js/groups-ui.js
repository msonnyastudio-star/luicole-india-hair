/* Firebase Authentication drives the private group interface.
 * Payment proofs are compressed, private and readable only by an administrator.
 */
const GroupUI = (() => {
  const USER_KEY = 'luciole_group_user';
  const GROUPS_KEY = 'luciole_contribution_groups';
  const PAYMENT_ACCOUNTS = Object.freeze({
    orange: {
      operator: 'Orange Money',
      number: '+237657946480',
      displayNumber: '+237 657 946 480',
      accountName: 'Assom Nang Galine'
    },
    mtn: {
      operator: 'MTN Mobile Money',
      number: '+237654884748',
      displayNumber: '+237 654 884 748',
      accountName: 'Tchapga Gaetan'
    }
  });
  const MAX_PROOF_SOURCE_BYTES = 10 * 1024 * 1024;
  const MAX_PROOF_STORED_BYTES = 450 * 1024;
  let pendingProduct = null;
  let firestoreGroups = null;
  let publicGroups = null;
  let activeGroupTab = 'public';
  let stopMemberGroups = null;
  let stopPublicGroups = null;
  let stopMessages = null;

  const isEnglish = () => document.documentElement.lang === 'en';
  const text = (fr, en) => isEnglish() ? en : fr;
  const money = (value) => new Intl.NumberFormat(isEnglish() ? 'en-US' : 'fr-FR').format(value) + ' FCFA';
  const escapeHTML = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  const getUser = () => JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  const getGroups = () => getUser()?.source === 'firebase' ? (firestoreGroups || []) : JSON.parse(localStorage.getItem(GROUPS_KEY) || '[]');
  const saveGroups = (groups) => localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
  const modal = () => document.getElementById('groupModal');
  const createId = (prefix) => window.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const createInviteCode = () => {
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const values = window.crypto?.getRandomValues ? window.crypto.getRandomValues(new Uint32Array(8)) : Array.from({ length: 8 }, () => Math.floor(Math.random() * 0xffffffff));
    return `LUC-${Array.from(values, (value) => alphabet[value % alphabet.length]).join('')}`;
  };

  const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(text('Impossible de lire la capture.', 'Unable to read the screenshot.')));
    reader.readAsDataURL(blob);
  });

  const loadProofImage = async (file) => {
    if (window.createImageBitmap) return window.createImageBitmap(file);
    const source = await blobToDataUrl(file);
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(text('Cette image ne peut pas être ouverte.', 'This image cannot be opened.')));
      image.src = source;
    });
  };

  async function compressPaymentProof(file) {
    if (!(file instanceof File) || !file.size) throw new Error(text('Ajoutez la capture du reçu de paiement.', 'Add a screenshot of the payment receipt.'));
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) throw new Error(text('La preuve doit être une image JPG, PNG ou WebP.', 'The proof must be a JPG, PNG or WebP image.'));
    if (file.size > MAX_PROOF_SOURCE_BYTES) throw new Error(text('La capture dépasse 10 Mo.', 'The screenshot is larger than 10 MB.'));

    const image = await loadProofImage(file);
    const originalWidth = image.width || image.naturalWidth;
    const originalHeight = image.height || image.naturalHeight;
    const initialScale = Math.min(1, 1400 / originalWidth, 2000 / originalHeight);
    let output = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const scale = initialScale * Math.pow(0.82, attempt);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(originalWidth * scale));
      canvas.height = Math.max(1, Math.round(originalHeight * scale));
      const context = canvas.getContext('2d', { alpha: false });
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const quality = Math.max(0.48, 0.82 - (attempt * 0.08));
      output = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (output && output.size <= MAX_PROOF_STORED_BYTES) break;
    }
    image.close?.();
    if (!output || output.size > MAX_PROOF_STORED_BYTES) throw new Error(text('La capture reste trop volumineuse après compression.', 'The screenshot is still too large after compression.'));
    return {
      dataUrl: await blobToDataUrl(output),
      contentType: output.type,
      size: output.size,
      originalName: file.name.slice(0, 120)
    };
  }
  const firebaseError = (error) => {
    if (error?.silent) return;
    const messages = {
      'permission-denied': text('Accès refusé. Veuillez vous reconnecter.', 'Access denied. Please sign in again.'),
      'unavailable': text('Connexion instable. Vérifiez votre réseau puis réessayez.', 'Unstable connection. Check your network and try again.'),
      'unauthenticated': text('Votre session a expiré. Reconnectez-vous pour continuer.', 'Your session has expired. Sign in again to continue.')
    };
    const message = messages[error?.code] || error?.message || text('Une erreur est survenue. Réessayez.', 'An error occurred. Please try again.');
    showAuthInlineError(message) || showToast(message);
  };

  // Shows the error inside the open auth form (like most sign-in pages do) instead of a toast
  // that disappears too fast to read. Returns true if an inline slot was found and used.
  function showAuthInlineError(message) {
    const slot = document.getElementById('authErrorBox');
    if (!slot) return false;
    slot.textContent = message;
    slot.hidden = false;
    return true;
  }

  function openModal(content, { discussion = false } = {}) {
    const element = modal();
    const cardClass = discussion ? 'group-modal-card discussion-modal-card' : 'group-modal-card';
    const closeBtn = discussion ? '' : `<button class="group-modal-close" type="button" data-group-close aria-label="${text('Fermer', 'Close')}"><i class="fas fa-times"></i></button>`;
    element.innerHTML = `<div class="${cardClass}" role="dialog" aria-modal="true" aria-label="${text('Espace groupes', 'Group space')}">${closeBtn}${content}</div>`;
    if (discussion) element.dataset.mode = 'discussion'; else delete element.dataset.mode;
    element.classList.add('active');
    element.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => element.querySelector('input, button, select, textarea')?.focus(), 0);
  }

  function closeModal() {
    const element = modal();
    stopMessages?.();
    stopMessages = null;
    element.classList.remove('active');
    element.setAttribute('aria-hidden', 'true');
    element.innerHTML = '';
    delete element.dataset.mode;
    document.body.style.overflow = '';
  }

  function formatMessageTime(createdAt) {
    if (!createdAt) return '';
    try {
      const date = createdAt?.toDate ? createdAt.toDate() : new Date(createdAt);
      if (isNaN(date.getTime())) return '';
      const now = new Date();
      const diffMin = Math.round((now - date) / 60000);
      if (diffMin < 1) return text("À l'instant", 'Just now');
      if (diffMin < 60) return `${diffMin} min`;
      if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
    } catch (_) { return ''; }
  }

  function showToast(message) {
    if (typeof window.showToast === 'function') window.showToast(message);
    else window.alert(message);
  }

  function render() {
    const user = getUser();
    const prompt = document.getElementById('groupsAuthPrompt');
    const dashboard = document.getElementById('groupsDashboard');
    const account = document.getElementById('accountBtn');
    if (account) account.innerHTML = user ? `<i class="fas fa-user-check"></i><span class="account-label">${escapeHTML(user.name)}</span>` : `<i class="fas fa-user"></i><span class="account-label">${text('Mon espace', 'My account')}</span>`;
    // Authentication is shared with the main site, but group data is rendered
    // only on the dedicated Groupes page.
    if (!prompt || !dashboard || !document.querySelector('[data-groups-page]')) return;

    document.querySelectorAll('[data-group-tab]').forEach((button) => {
      const selected = button.dataset.groupTab === activeGroupTab;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', String(selected));
    });

    const needsPrivateLogin = activeGroupTab === 'private' && !user;
    prompt.hidden = !needsPrivateLogin;
    prompt.style.display = needsPrivateLogin ? 'flex' : 'none';
    dashboard.hidden = needsPrivateLogin;
    dashboard.style.display = needsPrivateLogin ? 'none' : '';
    if (needsPrivateLogin) return;

    const grid = document.getElementById('groupsGrid');
    const isPublicTab = activeGroupTab === 'public';
    const groups = isPublicTab ? (publicGroups || []) : getGroups().filter((group) => group.privacy === 'private');
    if ((isPublicTab && publicGroups === null) || (!isPublicTab && firestoreGroups === null)) {
      grid.innerHTML = `<div class="groups-state"><i class="fas fa-spinner fa-spin"></i><p>${text('Synchronisation des groupes…', 'Syncing groups…')}</p></div>`;
      return;
    }
    if (!groups.length) {
      grid.innerHTML = `<div class="groups-state"><i class="fas fa-people-group"></i><h3>${isPublicTab ? text('Aucun groupe public pour le moment', 'No public groups yet') : text('Aucun groupe privé pour le moment', 'No private groups yet')}</h3><p>${text('Créez le premier cercle et avancez doucement vers votre prochaine couronne.', 'Create the first circle and move gently toward your next crown.')}</p><button class="btn btn-primary" data-create-group><i class="fas fa-plus"></i> ${text('Créer un groupe', 'Create a group')}</button></div>`;
      return;
    }
    grid.innerHTML = groups.map((group) => renderGroupCard(group, isPublicTab)).join('');
  }

  function renderGroupCard(group, publicCard = false) {
      const confirmed = Number(group.confirmedTotal) || GroupDomain.sumConfirmed(group.contributions || []);
      const remaining = Math.max(0, Number(group.targetAmount) - confirmed);
      const percentage = Math.min(100, Math.round((confirmed / group.targetAmount) * 100));
      const declaredCount = (group.contributions || []).filter((item) => item.status === 'declared').length;
      const alreadyMember = Boolean(getUser() && getGroups().some((item) => item.id === group.id));
      const completed = group.status === 'completed' || remaining <= 0;
      const publicActions = `<button type="button" class="btn btn-outline" data-details="${group.id}"><i class="fas fa-eye"></i> ${text('Voir le détail', 'View details')}</button><button type="button" class="btn btn-primary" data-join-public="${group.id}"><i class="fas ${alreadyMember ? 'fa-arrow-right' : 'fa-hand-sparkles'}"></i> ${alreadyMember ? text('Ouvrir', 'Open') : text('Rejoindre', 'Join')}</button>`;
      const privateActions = `<button type="button" class="btn btn-outline" data-details="${group.id}"><i class="fas fa-eye"></i> ${text('Détails', 'Details')}</button>${!completed && group.privacy === 'private' ? `<button type="button" class="btn btn-outline" data-invite="${group.id}"><i class="fas fa-user-plus"></i> ${text('Inviter', 'Invite')}</button>` : ''}${completed ? `<span class="group-completed-label"><i class="fas fa-circle-check"></i> ${text('Objectif atteint', 'Target reached')}</span>` : `<button type="button" class="btn btn-outline" data-contribute="${group.id}">${text('Cotiser', 'Contribute')}</button>`}<button type="button" class="btn btn-primary" data-discussion="${group.id}">${text('Discussion', 'Chat')}</button>`;
      return `<article class="group-card ${publicCard ? 'group-card-public' : 'group-card-private'}">
        <div class="group-card-content">
          <div class="group-card-top"><div class="group-title-wrap"><span class="group-community-icon"><i class="fas fa-users"></i></span><div><h3>${escapeHTML(group.name)}</h3><p class="group-card-product">${escapeHTML(group.productName)} · ${escapeHTML(group.variant)}</p></div></div><span class="group-status"><i class="fas ${completed ? 'fa-circle-check' : group.privacy === 'private' ? 'fa-lock' : 'fa-globe-africa'}"></i> ${completed ? text('Terminé', 'Completed') : group.privacy === 'private' ? text('Privé', 'Private') : text('Public', 'Public')}</span></div>
          <p class="group-beneficiary"><i class="fas fa-gift"></i> ${text('Bénéficiaire', 'Beneficiary')}: ${escapeHTML(group.beneficiary)}</p>
          <div class="group-amounts"><span>${text('Confirmé', 'Confirmed')} <strong>${money(confirmed)}</strong></span><span>${text('Reste', 'Remaining')} ${money(remaining)}</span></div>
          <div class="group-progress" aria-label="${text('Progression', 'Progress')} ${percentage}%"><span style="width:${percentage}%"></span></div>
          <div class="group-card-meta"><span><i class="fas fa-users"></i> ${group.memberCount || 1}/${group.maxMembers || 10}</span><span><i class="fas fa-calendar-check"></i> ${escapeHTML(frequencyLabel(group.frequency))}</span>${publicCard ? '' : `<span><i class="fas fa-file-invoice"></i> ${declaredCount} ${text('à vérifier', 'to review')}</span>`}</div>
          <div class="group-card-actions">${publicCard ? publicActions : privateActions}</div>
        </div>
      </article>`;
  }

  function frequencyLabel(value) {
    const labels = {
      weekly: text('Chaque semaine', 'Weekly'),
      biweekly: text('Toutes les 2 semaines', 'Every 2 weeks'),
      monthly: text('Chaque mois', 'Monthly')
    };
    return labels[value] || labels.monthly;
  }

  function showWelcome(name) {
    openModal(`
      <div class="welcome-screen">
        <div class="welcome-check"><i class="fas fa-check"></i></div>
        <h2 class="welcome-title">${text('Bienvenue', 'Welcome')}${name ? ', ' + escapeHTML(name) : ''}</h2>
        <p class="welcome-text">${text(
          'Votre compte a été créé avec succès. Vous pouvez maintenant créer des groupes d\u2019achat, suivre vos cotisations et discuter avec vos proches en toute sécurité.',
          'Your account was created successfully. You can now create group purchases, track contributions and chat with your loved ones in a secure space.'
        )}</p>
        <div class="welcome-perks">
          <div class="welcome-perk"><i class="fas fa-users"></i><span>${text('Groupes privés', 'Private groups')}</span></div>
          <div class="welcome-perk"><i class="fas fa-hand-holding-heart"></i><span>${text('Achats en famille', 'Family purchases')}</span></div>
          <div class="welcome-perk"><i class="fas fa-shield-halved"></i><span>${text('Espace sécurisé', 'Secure space')}</span></div>
        </div>
        <button class="btn btn-welcome" type="button" data-group-close>${text('Continuer', 'Continue')}</button>
      </div>`);
  }

  function authFormMarkup(mode) {
    const isSignup = mode === 'signup';
    return `
      <div class="authbox-error" id="authErrorBox" role="alert" hidden></div>
      <button class="btn-google-official" type="button" data-firebase-google>
        <svg width="18" height="18" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><path fill="#4285F4" d="M47.5 24.6c0-1.6-.1-3.1-.4-4.6H24v8.7h13.2c-.6 3-2.3 5.5-4.9 7.2v6h7.9c4.6-4.2 7.3-10.4 7.3-17.3z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.9-6c-2.1 1.4-4.9 2.3-8 2.3-6.1 0-11.3-4.1-13.2-9.7H2.7v6.2C6.6 42.5 14.8 48 24 48z"/><path fill="#FBBC05" d="M10.8 28.8c-.5-1.4-.7-2.8-.7-4.4s.3-3.1.7-4.4v-6.2H2.7C1 17.1 0 20.4 0 24s1 6.9 2.7 9.2l8.1-4.4z"/><path fill="#EA4335" d="M24 9.6c3.4 0 6.5 1.2 8.9 3.5l6.6-6.6C35.9 2.5 30.5 0 24 0 14.8 0 6.6 5.5 2.7 14.8l8.1 4.4z"/></svg>
        <span>${text('Continuer avec Google', 'Continue with Google')}</span>
      </button>
      <div class="authbox-divider"><span>${text('ou', 'or')}</span></div>
      <form class="authbox-form" id="${isSignup ? 'firebaseSignupForm' : 'firebaseSigninForm'}" novalidate>
        ${isSignup ? `<label>${text('Votre prénom', 'Your first name')}<input name="displayName" type="text" autocomplete="given-name" maxlength="60" required placeholder="${text('Ex. Aminata', 'E.g. Aminata')}"></label>` : ''}
        <label>${text('Adresse e-mail', 'Email address')}<input name="email" type="email" autocomplete="email" required placeholder="vous@exemple.com"></label>
        <label>${text('Mot de passe', 'Password')}<input name="password" type="password" autocomplete="${isSignup ? 'new-password' : 'current-password'}" minlength="6" required placeholder="${text('6 caractères minimum', 'Minimum 6 characters')}"></label>
        ${isSignup ? '' : `<a href="javascript:void(0)" class="authbox-forgot" data-forgot-password>${text('Mot de passe oublié\u00a0?', 'Forgot your password?')}</a>`}
        <button class="btn-authbox-primary" type="submit">${isSignup ? text('Créer mon compte', 'Create my account') : text('Se connecter', 'Sign in')}</button>
      </form>
      <p class="authbox-switch">
        ${isSignup
          ? `${text('Vous avez déjà un compte\u00a0?', 'Already have an account?')} <a href="javascript:void(0)" data-auth-tab="signin">${text('Se connecter', 'Sign in')}</a>`
          : `${text('Nouveau chez Luciole\u00a0?', 'New to Luciole?')} <a href="javascript:void(0)" data-auth-tab="signup">${text('Créer un compte', 'Create an account')}</a>`}
      </p>`;
  }

  function showAuth(mode = 'signin') {
    openModal(`
      <div class="authbox">
        <div class="authbox-brand">
          <img src="images/logo-luciole.png" alt="Luciole India Hair" class="authbox-logo">
          <span>Luciole India Hair</span>
        </div>
        <h2 class="authbox-title">${mode === 'signup' ? text('Créer un compte', 'Create an account') : text('Se connecter', 'Sign in')}</h2>
        <p class="authbox-subtitle">${text('Accédez à vos groupes, cotisations et discussions privées.', 'Access your groups, contributions and private chats.')}</p>
        <div class="authbox-panel" id="authPanel">${authFormMarkup(mode)}</div>
      </div>`);
  }

  function showAccount() {
    const user = getUser();
    if (!user) { showAuth(); return; }
    openModal(`<div class="authbox account-status-box">
      <div class="authbox-brand"><img src="images/logo-luciole.png" alt="Luciole India Hair" class="authbox-logo"><span>Luciole India Hair</span></div>
      <h2 class="authbox-title">${text('Vous êtes connectée', 'You are signed in')}</h2>
      <p class="authbox-subtitle">${escapeHTML(user.name)}${user.email ? ` · ${escapeHTML(user.email)}` : ''}</p>
      <button class="btn-authbox-primary" type="button" data-group-close>${text('Continuer', 'Continue')}</button>
      <button class="account-signout" type="button" data-group-signout>${text('Se déconnecter', 'Sign out')}</button>
    </div>`);
  }

  function showForgotPassword() {
    openModal(`
      <div class="authbox">
        <div class="authbox-brand">
          <img src="images/logo-luciole.png" alt="Luciole India Hair" class="authbox-logo">
          <span>Luciole India Hair</span>
        </div>
        <h2 class="authbox-title">${text('Réinitialiser le mot de passe', 'Reset your password')}</h2>
        <p class="authbox-subtitle">${text('Indiquez votre adresse e-mail : nous vous enverrons un lien pour créer un nouveau mot de passe.', 'Enter your email address and we will send you a link to create a new password.')}</p>
        <div class="authbox-error" id="authErrorBox" role="alert" hidden></div>
        <form class="authbox-form" id="forgotPasswordForm" novalidate>
          <label>${text('Adresse e-mail', 'Email address')}<input name="email" type="email" autocomplete="email" required placeholder="vous@exemple.com"></label>
          <button class="btn-authbox-primary" type="submit">${text('Envoyer le lien', 'Send the link')}</button>
        </form>
        <p class="authbox-switch"><a href="javascript:void(0)" data-auth-tab="signin">${text('Retour à la connexion', 'Back to sign in')}</a></p>
      </div>`);
  }

  function applyFirebaseUser(user) {
    stopMemberGroups?.();
    stopMemberGroups = null;
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      firestoreGroups = null; // reset pour déclencher le spinner au rechargement
      closeModal();
      render();
      if (document.querySelector('[data-groups-page]')) startMemberGroupsSubscription(user.id);
      if (pendingProduct) showCreateGroup(pendingProduct);
      return;
    }
    const storedUser = getUser();
    if (storedUser?.source === 'firebase') localStorage.removeItem(USER_KEY);
    firestoreGroups = null;
    render();
  }

  function startMemberGroupsSubscription(userId) {
    if (!window.FirebaseClient?.subscribeMemberGroups) {
      refreshFirestoreGroups();
      return;
    }
    stopMemberGroups = window.FirebaseClient.subscribeMemberGroups(userId, (groups) => {
      firestoreGroups = groups;
      render();
    }, (error) => {
      console.warn('Synchronisation des groupes privés impossible :', error);
      firestoreGroups = Array.isArray(firestoreGroups) ? firestoreGroups : [];
      render();
    });
  }

  function startPublicGroupsSubscription() {
    if (!document.querySelector('[data-groups-page]') || stopPublicGroups || !window.FirebaseClient?.subscribePublicGroups) return;
    stopPublicGroups = window.FirebaseClient.subscribePublicGroups((groups) => {
      publicGroups = groups;
      render();
    }, (error) => {
      console.warn('Synchronisation des groupes publics impossible :', error);
      publicGroups = [];
      render();
    });
  }

  async function refreshFirestoreGroups() {
    const user = getUser();
    if (!user?.source || !window.FirebaseClient) return;
    const previousGroups = Array.isArray(firestoreGroups) ? [...firestoreGroups] : [];
    try {
      firestoreGroups = await window.FirebaseClient.getMemberGroups(user.id);
      render();
    } catch (error) {
      console.warn('Impossible de charger les groupes Firestore :', error);
      // Keep the last known list (including optimistic groups) if available.
      // Only fall back to [] when this is the very first load.
      firestoreGroups = previousGroups.length ? previousGroups : [];
      render();
    }
  }

  function getDefaultProduct() {
    const product = (window.PRODUCTS_DATA || window.PRODUCTS || [])[0];
    return product && { productId: product.id, productName: product.name, variant: product.lengths[0].length, targetAmount: product.lengths[0].price };
  }

  function getGroupProduct(data) {
    if (pendingProduct) return pendingProduct;
    const [productId, lengthIndex] = String(data.get('catalogVariant') || '').split(':').map(Number);
    const product = (window.PRODUCTS_DATA || []).find((item) => item.id === productId);
    const length = product?.lengths?.[lengthIndex];
    if (!product || !length) throw new Error(text('Choisissez un modèle et une longueur.', 'Choose a style and a length.'));
    return { productId: product.id, productName: product.name, variant: length.length, targetAmount: Number(length.price) || 0 };
  }

  function showCreateGroup(product = pendingProduct || null) {
    if (!getUser()) {
      pendingProduct = product;
      showAuth();
      return;
    }
    pendingProduct = product;
    const variants = (window.PRODUCTS_DATA || []).flatMap((item) => item.lengths.map((length, index) => ({ item, length, index })));
    if (!product && !variants.length) {
      showToast(text('Le catalogue est encore en cours de chargement. Réessayez dans un instant.', 'The catalogue is still loading. Please try again in a moment.'));
      return;
    }
    const fixedProduct = product ? `<label>${text('Produit', 'Product')}<small>${escapeHTML(product.productName)} · ${escapeHTML(product.variant)} · ${money(product.targetAmount)}</small></label>` : `<label>${text('Modèle et longueur', 'Style and length')}<select name="catalogVariant" required>${variants.map(({ item, length, index }) => `<option value="${item.id}:${index}">${escapeHTML(item.name)} — ${escapeHTML(length.length)}</option>`).join('')}</select></label>`;
    const targetValue = Number(product?.targetAmount) > 0 ? `value="${Number(product.targetAmount)}"` : '';
    openModal(`<h2>${text('Créer un groupe d’achat', 'Create a purchase group')}</h2>
      <p>${text('Le montant objectif est enregistré à la création : les cotisations du groupe serviront uniquement à atteindre ce montant.', 'The target amount is recorded when the group is created: contributions will only be used to reach that target.')}</p>
      <form class="group-form" id="createGroupForm" novalidate>
        <label>${text('Nom du groupe', 'Group name')}<input name="name" required maxlength="80" placeholder="${text('Ex. Famille Leona', 'E.g. Leona family')}"></label>
        ${fixedProduct}
        <label>${text('Montant objectif (FCFA)', 'Target amount (FCFA)')}<input name="targetAmount" type="number" min="1" ${targetValue} required><small>${text('À renseigner si le prix du catalogue n’est pas encore défini.', 'Fill this in if the catalogue price has not yet been set.')}</small></label>
        <label>${text('Bénéficiaire', 'Beneficiary')}<input name="beneficiary" required maxlength="80" placeholder="${text('Nom de la personne qui recevra le produit', 'Name of the person receiving the product')}"></label>
        <label>${text('Fréquence de cotisation', 'Contribution frequency')}<select name="frequency"><option value="weekly">${text('Chaque semaine', 'Weekly')}</option><option value="biweekly">${text('Toutes les 2 semaines', 'Every 2 weeks')}</option><option value="monthly" selected>${text('Chaque mois', 'Monthly')}</option></select></label>
        <label>${text('Date de début', 'Start date')}<input name="startDate" type="date" required></label>
        <label>${text('Nombre maximum de membres', 'Maximum members')}<input name="maxMembers" type="number" min="2" max="100" value="10" required></label>
        <label>${text('Visibilité', 'Visibility')}<select name="privacy"><option value="public">${text('Public — visible et ouvert', 'Public — visible and open')}</option><option value="private">${text('Privé — accessible par code', 'Private — invitation code only')}</option></select></label>
        <label>${text('Message de présentation', 'Introduction message')} <textarea name="message" maxlength="500" placeholder="${text('Facultatif', 'Optional')}"></textarea></label>
        <button class="btn btn-primary" type="submit"><i class="fas fa-users"></i> ${text('Créer le groupe', 'Create group')}</button>
      </form>`);
  }

  async function createGroup(form) {
    const data = new FormData(form);
    const product = getGroupProduct(data);
    const user = getUser();
    const targetAmount = Number(data.get('targetAmount'));
    const name = data.get('name').trim();
    const beneficiary = data.get('beneficiary').trim();
    if (!name || !beneficiary) throw new Error(text('Complétez le nom du groupe et le nom de la bénéficiaire.', 'Complete the group name and beneficiary name.'));
    if (!Number.isFinite(targetAmount) || targetAmount <= 0) throw new Error(text('Indiquez un montant objectif supérieur à zéro.', 'Enter a target amount greater than zero.'));
    const group = {
      id: createId('group'),
      name,
      beneficiary,
      privacy: data.get('privacy'),
      frequency: data.get('frequency'),
      startDate: data.get('startDate'),
      maxMembers: Math.max(2, Math.min(100, Number(data.get('maxMembers')) || 10)),
      message: data.get('message').trim(),
      creatorId: user.id,
      productId: product.productId,
      productName: product.productName,
      variant: product.variant,
      targetAmount,
      priceSnapshot: { productId: product.productId, variant: product.variant, amount: targetAmount },
      inviteCode: createInviteCode(),
      memberCount: 1,
      contributions: [],
      messages: [{ system: true, content: text('Le groupe a été créé. Les cotisations confirmées uniquement feront progresser l’objectif.', 'The group was created. Only confirmed contributions move the target forward.') }],
      createdAt: new Date().toISOString()
    };
    if (user.source === 'firebase') {
      await window.FirebaseClient.createContributionGroup(group, user);
      const current = Array.isArray(firestoreGroups) ? firestoreGroups : [];
      firestoreGroups = [group, ...current.filter((item) => item.id !== group.id)];
      render();
      await refreshFirestoreGroups();
    } else {
      const groups = getGroups();
      groups.unshift(group);
      saveGroups(groups);
    }
    pendingProduct = null;
    closeModal();
    render();
    showToast(text('Groupe créé. Vous êtes administratrice du groupe.', 'Group created. You are the group administrator.'));
  }

  function showInvite(group) {
    const code = group.inviteCode;
    if (!code) {
      showToast(text('Ce groupe a été créé avant les invitations. Créez un nouveau groupe pour obtenir un code sécurisé.', 'This group was created before invitations were added. Create a new group to get a secure code.'));
      return;
    }
    openModal(`<h2>${text('Inviter dans ce groupe', 'Invite people to this group')}</h2>
      <p>${text('Partagez ce code uniquement avec les personnes de confiance que vous souhaitez ajouter à «', 'Share this code only with trusted people you want to add to “')}${escapeHTML(group.name)}».</p>
      <div class="group-invite-code"><span>${escapeHTML(code)}</span><button class="btn btn-primary" type="button" data-copy-invite="${escapeHTML(code)}"><i class="fas fa-copy"></i> ${text('Copier', 'Copy')}</button></div>
      <p class="group-payment-warning">${text('Chaque personne doit se connecter, puis choisir « Rejoindre un groupe » et saisir ce code. Ne publiez pas ce code sur les réseaux sociaux.', 'Each person must sign in, choose “Join a group”, then enter this code. Do not post this code on social media.')}</p>`);
  }

  function showJoinGroup() {
    if (!getUser()) { showAuth(); return; }
    openModal(`<h2>${text('Rejoindre un groupe', 'Join a group')}</h2>
      <p>${text('Demandez le code d’invitation à la personne qui a créé le groupe.', 'Ask the person who created the group for the invitation code.')}</p>
      <form class="group-form" id="joinGroupForm" novalidate>
        <label>${text('Code d’invitation', 'Invitation code')}<input name="inviteCode" required maxlength="12" autocomplete="off" placeholder="LUC-ABCDEFGH" style="text-transform:uppercase"></label>
        <button class="btn btn-primary" type="submit"><i class="fas fa-user-plus"></i> ${text('Rejoindre le groupe', 'Join group')}</button>
      </form>`);
  }

  async function joinGroup(form) {
    const code = new FormData(form).get('inviteCode').trim().toUpperCase();
    if (!code) throw new Error(text('Saisissez le code d’invitation.', 'Enter the invitation code.'));
    const user = getUser();
    if (user.source === 'firebase') {
      const invite = await window.FirebaseClient.joinContributionGroup(code, user);
      closeModal();
      if (!invite.alreadyMember) {
        // Optimistically show the group immediately so the joiner sees it right away.
        const optimistic = {
          id: invite.groupId,
          name: invite.groupName || 'Groupe privé Luciole',
          beneficiary: invite.beneficiary || 'Bénéficiaire à confirmer',
          privacy: invite.privacy || 'private',
          creatorId: invite.creatorId || null,
          productId: invite.productId || null,
          productName: invite.productName || 'Greffe sélectionnée',
          variant: invite.variant || 'Longueur à confirmer',
          targetAmount: Number(invite.targetAmount) > 0 ? Number(invite.targetAmount) : 1,
          memberCount: Number(invite.memberCount) > 0 ? Number(invite.memberCount) : 1,
          contributions: [],
          messages: []
        };
        const existing = Array.isArray(firestoreGroups) ? firestoreGroups : [];
        firestoreGroups = [optimistic, ...existing.filter((g) => g.id !== invite.groupId)];
        render();
      }
      showToast(invite.alreadyMember ? text('Vous faites déjà partie de ce groupe.', 'You are already a member of this group.') : text('Bienvenue dans le groupe ! Vous pouvez maintenant discuter et cotiser.', 'Welcome to the group! You can now chat and contribute.'));
      // Refresh from Firestore in background (non-blocking).
      refreshFirestoreGroups().catch(console.warn);
      return;
    }
    const groups = getGroups();
    const group = groups.find((item) => item.inviteCode === code);
    if (!group) throw new Error(text('Ce code est introuvable sur cet appareil. Connectez-vous avec Firebase pour rejoindre un groupe partagé.', 'This code cannot be found on this device. Sign in with Firebase to join a shared group.'));
    closeModal();
    showToast(text('Vous faites déjà partie de ce groupe sur cet appareil.', 'You are already a member of this group on this device.'));
  }

  async function joinPublic(group) {
    const user = getUser();
    if (!user) {
      pendingProduct = null;
      showAuth();
      return;
    }
    if (getGroups().some((item) => item.id === group.id)) {
      render();
      showDetails(findGroup(group.id));
      return;
    }
    if (user.source !== 'firebase' || !window.FirebaseClient?.joinPublicGroup) {
      throw new Error(text('Connectez-vous avec Firebase pour rejoindre ce groupe.', 'Sign in with Firebase to join this group.'));
    }
    const result = await window.FirebaseClient.joinPublicGroup(group.id, user);
    showToast(result.alreadyMember ? text('Vous faites déjà partie de ce groupe.', 'You already belong to this group.') : text('Bienvenue ! Vous pouvez maintenant ouvrir les détails, cotiser et discuter.', 'Welcome! You can now open details, contribute and chat.'));
    render();
  }

  async function showDetails(group) {
    if (!group) return;
    const isMember = Boolean(getUser() && getGroups().some((item) => item.id === group.id));
    let details = group;
    if (isMember && getUser()?.source === 'firebase' && window.FirebaseClient?.getGroupDetails) {
      details = await window.FirebaseClient.getGroupDetails(group.id);
    }
    const contributions = details.contributions || [];
    const confirmed = Number(details.confirmedTotal) || GroupDomain.sumConfirmed(contributions);
    const remaining = Math.max(0, Number(details.targetAmount) - confirmed);
    const percentage = Math.min(100, Math.round((confirmed / Math.max(1, Number(details.targetAmount))) * 100));
    const members = details.members || [];
    const confirmedHistory = contributions.filter((item) => item.status === 'confirmed');
    openModal(`<div class="group-detail-head"><span class="group-community-icon"><i class="fas fa-people-group"></i></span><div><p class="eyebrow">${details.privacy === 'private' ? text('Cercle privé', 'Private circle') : text('Cercle public', 'Public circle')}</p><h2>${escapeHTML(details.name)}</h2><p>${escapeHTML(details.productName)} · ${escapeHTML(details.variant)}</p></div></div>
      <div class="group-detail-stats"><div><strong>${money(details.targetAmount)}</strong><span>${text('Objectif', 'Target')}</span></div><div><strong>${money(confirmed)}</strong><span>${text('Collecté', 'Collected')}</span></div><div><strong>${members.length || details.memberCount || 1}/${details.maxMembers || 10}</strong><span>${text('Membres', 'Members')}</span></div></div>
      <div class="group-progress group-detail-progress"><span style="width:${percentage}%"></span></div>
      <p class="group-detail-message">${escapeHTML(details.presentationMessage || details.message || text('Ensemble, chaque petite cotisation rapproche la bénéficiaire de sa couronne.', 'Together, every contribution brings the beneficiary closer to her crown.'))}</p>
      <div class="group-detail-grid">
        <section><h3><i class="fas fa-calendar-days"></i> ${text('Organisation', 'Schedule')}</h3><p>${frequencyLabel(details.frequency)} · ${text('Début', 'Starts')} ${escapeHTML(details.startDate || text('à confirmer', 'to be confirmed'))}</p><p>${text('Bénéficiaire', 'Beneficiary')} : <strong>${escapeHTML(details.beneficiary)}</strong></p></section>
        <section><h3><i class="fas fa-users"></i> ${text('Membres', 'Members')}</h3>${isMember ? (members.length ? `<ul>${members.map((member) => `<li>${escapeHTML(member.name || text('Membre Luciole', 'Luciole member'))}${member.role === 'group_admin' ? ` <small>· Admin</small>` : ''}</li>`).join('')}</ul>` : `<p>${text('La liste se synchronise…', 'The list is syncing…')}</p>`) : `<p>${text('La liste des membres est réservée au groupe.', 'The member list is reserved for the group.')}</p>`}</section>
        <section><h3><i class="fas fa-clock-rotate-left"></i> ${text('Mes cotisations', 'My contributions')}</h3>${isMember ? (confirmedHistory.length ? `<ul>${confirmedHistory.map((item) => `<li>${money(item.amount)} · ${escapeHTML(item.senderName || text('Membre', 'Member'))}</li>`).join('')}</ul>` : `<p>${text('Aucune de vos cotisations n’est confirmée pour le moment.', 'None of your contributions is confirmed yet.')}</p>`) : `<p>${money(remaining)} ${text('restent à collecter.', 'remain to be collected.')}</p>`}</section>
      </div>
      <div class="group-detail-actions">${isMember ? `${details.status === 'completed' || remaining <= 0 ? `<span class="group-completed-label"><i class="fas fa-circle-check"></i> ${text('Objectif atteint', 'Target reached')}</span>` : `<button class="btn btn-outline" data-contribute="${details.id}">${text('Cotiser', 'Contribute')}</button>`}<button class="btn btn-primary" data-discussion="${details.id}"><i class="fas fa-comments"></i> ${text('Ouvrir la discussion', 'Open chat')}</button>` : `<button class="btn btn-primary" data-join-public="${details.id}"><i class="fas fa-hand-sparkles"></i> ${text('Rejoindre ce groupe', 'Join this group')}</button>`}</div>`);
  }

  function findGroup(id) { return getGroups().find((group) => group.id === id) || (publicGroups || []).find((group) => group.id === id); }
  function updateGroup(updated) { saveGroups(getGroups().map((group) => group.id === updated.id ? updated : group)); }

  function showContribution(group) {
    const confirmed = Number(group.confirmedTotal) || GroupDomain.sumConfirmed(group.contributions || []);
    const remaining = Math.max(0, Number(group.targetAmount) - confirmed);
    if (group.status === 'completed' || remaining <= 0) return showToast(text('L’objectif de ce groupe est déjà atteint.', 'This group target has already been reached.'));
    openModal(`<h2>${text('Contribuer à', 'Contribute to')} « ${escapeHTML(group.name)} »</h2>
      <p>${text('Reste à collecter', 'Remaining to collect')}: <strong>${money(remaining)}</strong>. ${text('Une cotisation déclarée ne modifie pas le total tant qu’un administrateur général ne l’a pas confirmée.', 'A declared contribution does not change the total until a site administrator confirms it.')}</p>
      <form class="group-form" id="contributionForm" data-group-id="${group.id}">
        <fieldset class="payment-account-picker">
          <legend>${text('1. Choisissez le compte officiel Luciole', '1. Choose the official Luciole account')}</legend>
          ${Object.entries(PAYMENT_ACCOUNTS).map(([key, account], index) => `<label class="payment-account-option">
            <input type="radio" name="paymentMethod" value="${key}" ${index === 0 ? 'checked' : ''} required>
            <span class="payment-account-logo ${key}">${key === 'orange' ? 'OM' : 'MTN'}</span>
            <span><strong>${account.operator}</strong><small>${account.displayNumber}<br>${text('Nom', 'Name')} : ${account.accountName}</small></span>
          </label>`).join('')}
        </fieldset>
        <p class="payment-security-note"><i class="fas fa-shield-halved"></i> ${text('Envoyez uniquement au numéro sélectionné ci-dessus. Luciole ne vous demandera jamais de payer sur un autre numéro dans la discussion du groupe.', 'Only send to the selected number above. Luciole will never ask you to pay another number in the group chat.')}</p>
        <label>${text('Montant envoyé', 'Amount sent')} (FCFA)<input name="amount" type="number" min="1" max="${remaining}" required></label>
        <label>${text('Numéro Mobile Money de l’expéditeur', 'Sender Mobile Money number')}<input name="phone" inputmode="tel" autocomplete="tel" required></label>
        <label>${text('Nom de l’expéditeur', 'Sender name')}<input name="senderName" required></label>
        <label>${text('Référence de transaction', 'Transaction reference')}<input name="reference" required maxlength="100"></label>
        <label>${text('Date et heure approximatives', 'Approximate date and time')}<input name="transferredAt" type="datetime-local" required></label>
        <label class="payment-proof-field">${text('Capture du reçu de paiement', 'Payment receipt screenshot')} *
          <input name="proof" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required>
          <small>${text('JPG, PNG ou WebP, 10 Mo maximum. L’image est compressée, privée et supprimée quand l’objectif du groupe est terminé.', 'JPG, PNG or WebP, up to 10 MB. The image is compressed, private and deleted when the group target is completed.')}</small>
        </label>
        <label>${text('Note', 'Note')} <textarea name="note" maxlength="500" placeholder="${text('Facultatif', 'Optional')}"></textarea></label>
        <p class="group-payment-warning">${text('La capture seule ne confirme pas le paiement. L’administrateur compare la référence avec le relevé du compte officiel avant validation.', 'The screenshot alone does not confirm payment. The administrator checks the reference against the official account statement before approval.')}</p>
        <button class="btn btn-primary" type="submit">${text('Déclarer le paiement', 'Declare payment')}</button>
      </form>`);
  }

  async function declareContribution(form) {
    const group = findGroup(form.dataset.groupId);
    const data = new FormData(form);
    const confirmed = Number(group.confirmedTotal) || GroupDomain.sumConfirmed(group.contributions || []);
    const remaining = Math.max(0, Number(group.targetAmount) - confirmed);
    try { GroupDomain.assertContributionAmount(data.get('amount'), remaining); } catch (error) { showToast(error.message); return; }
    if (getUser()?.source !== 'firebase' || !window.FirebaseClient?.declareContribution) {
      throw new Error(text('Reconnectez-vous avec Firebase pour sécuriser votre preuve de paiement.', 'Sign in with Firebase again to secure your payment proof.'));
    }
    const method = data.get('paymentMethod');
    const recipient = PAYMENT_ACCOUNTS[method];
    if (!recipient) throw new Error(text('Choisissez Orange Money ou MTN Mobile Money.', 'Choose Orange Money or MTN Mobile Money.'));
    const submitButton = form.querySelector('button[type="submit"]');
    setButtonLoading(submitButton, true, text('Sécurisation de la preuve…', 'Securing proof…'));
    try {
      const proof = await compressPaymentProof(data.get('proof'));
      const contribution = {
        memberId: getUser().id,
        amount: Number(data.get('amount')),
        paymentMethod: method,
        recipientOperator: recipient.operator,
        recipientNumber: recipient.number,
        recipientName: recipient.accountName,
        senderPhone: data.get('phone').trim(),
        senderName: data.get('senderName').trim(),
        reference: data.get('reference').trim(),
        transferredAt: data.get('transferredAt'),
        note: data.get('note').trim(),
        status: 'declared'
      };
      await window.FirebaseClient.declareContribution(group.id, contribution, proof);
      await refreshFirestoreGroups();
      closeModal();
      render();
      showToast(text('Paiement déclaré avec sa preuve privée. Il attend la vérification de Luciole.', 'Payment declared with its private proof. It is awaiting Luciole verification.'));
    } finally {
      setButtonLoading(submitButton, false);
    }
  }

  function renderMessagesMarkup(messages, currentUserId) {
    return messages.length
      ? messages.map((msg) => {
          if (msg.system) return `<div class="chat-message chat-system"><span>${escapeHTML(msg.content)}</span></div>`;
          const isMine = msg.authorId === currentUserId;
          const timeLabel = formatMessageTime(msg.createdAt);
          return `<div class="chat-message ${isMine ? 'chat-mine' : 'chat-theirs'}">${!isMine ? `<div class="chat-author">${escapeHTML(msg.author || '')}</div>` : ''}<div class="chat-bubble">${escapeHTML(msg.content)}</div>${timeLabel ? `<div class="chat-time">${timeLabel}</div>` : ''}</div>`;
        }).join('')
      : `<div class="chat-empty"><i class="fas fa-comment-dots"></i><span>${text('Aucun message pour le moment. Soyez la première à écrire !', 'No messages yet. Be the first to write!')}</span></div>`;
  }

  async function showDiscussion(group) {
    if (getUser().source === 'firebase') group.messages = await window.FirebaseClient.getGroupMessages(group.id);
    const currentUserId = getUser().id;
    const msgs = group.messages || [];
    const messagesHtml = renderMessagesMarkup(msgs, currentUserId);

    openModal(`<div class="discussion-header">
        <div class="discussion-title">
          <span class="discussion-icon"><i class="fas fa-comments"></i></span>
          <div>
            <h2>${escapeHTML(group.name)}</h2>
            <small>${text('Discussion privée · membres acceptés', 'Private chat · accepted members')}</small>
          </div>
        </div>
        <button class="discussion-close-btn" type="button" data-group-close aria-label="${text('Fermer', 'Close')}"><i class="fas fa-times"></i></button>
      </div>
      <div class="chat-messages" id="chatMessages">${messagesHtml}</div>
      <form class="chat-input-area" id="messageForm" data-group-id="${group.id}" novalidate>
        <textarea class="chat-textarea" name="content" maxlength="1000" required placeholder="${text('Écrire un message…', 'Write a message…')}" rows="1"></textarea>
        <button class="chat-send-btn" type="submit" aria-label="${text('Envoyer', 'Send')}"><i class="fas fa-paper-plane"></i></button>
      </form>`, { discussion: true });

    window.setTimeout(() => {
      const chatEl = document.getElementById('chatMessages');
      if (chatEl) chatEl.scrollTop = chatEl.scrollHeight;
      document.querySelector('.chat-textarea')?.focus();
    }, 80);
    stopMessages?.();
    if (getUser().source === 'firebase' && window.FirebaseClient?.subscribeGroupMessages) {
      stopMessages = window.FirebaseClient.subscribeGroupMessages(group.id, (messages) => {
        group.messages = messages;
        const chatEl = document.getElementById('chatMessages');
        if (!chatEl) return;
        const nearBottom = chatEl.scrollHeight - chatEl.scrollTop - chatEl.clientHeight < 100;
        chatEl.innerHTML = renderMessagesMarkup(messages, currentUserId);
        if (nearBottom) chatEl.scrollTop = chatEl.scrollHeight;
      }, firebaseError);
    }
  }

  async function sendMessage(form) {
    const group = findGroup(form.dataset.groupId);
    const content = new FormData(form).get('content').trim();
    if (!content) return;
    form.reset();
    if (getUser().source === 'firebase') {
      await window.FirebaseClient.sendGroupMessage(group.id, { author: getUser().name, authorId: getUser().id, content });
    } else {
      group.messages.push({ id: createId('message'), author: getUser().name, authorId: getUser().id, content, createdAt: new Date().toISOString() });
      updateGroup(group);
    }
    await showDiscussion(group);
  }

  function openCreateForProduct(product) { showCreateGroup(product); }

  function setButtonLoading(button, isLoading, loadingLabel) {
    if (!button) return;
    if (isLoading) {
      button.dataset.originalHtml = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> ${escapeHTML(loadingLabel)}`;
    } else {
      button.disabled = false;
      if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
    }
  }

  function bindEvents() {
    document.addEventListener('click', (event) => {
      const authButton = event.target.closest('[data-group-auth], #accountBtn');
      if (authButton) {
        authButton.id === 'accountBtn' ? showAccount() : showAuth();
        return;
      }
      if (event.target.closest('[data-group-close]') || event.target === modal()) { closeModal(); return; }
      if (event.target.closest('[data-group-signout]')) {
        const user = getUser();
        if (user?.source === 'firebase' && window.FirebaseClient) window.FirebaseClient.signOut(window.FirebaseClient.auth).catch(firebaseError);
        else { localStorage.removeItem(USER_KEY); closeModal(); render(); }
        return;
      }
      if (event.target.closest('#createGroupBtn, [data-create-group]')) { showCreateGroup(); return; }
      if (event.target.closest('[data-join-group]')) { showJoinGroup(); return; }
      const groupTab = event.target.closest('[data-group-tab]');
      if (groupTab) {
        activeGroupTab = groupTab.dataset.groupTab;
        render();
        return;
      }
      const joinPublicButton = event.target.closest('[data-join-public]');
      if (joinPublicButton) {
        joinPublic(findGroup(joinPublicButton.dataset.joinPublic)).catch(firebaseError);
        return;
      }
      const detailsButton = event.target.closest('[data-details]');
      if (detailsButton) {
        showDetails(findGroup(detailsButton.dataset.details)).catch(firebaseError);
        return;
      }
      const invite = event.target.closest('[data-invite]');
      if (invite) { showInvite(findGroup(invite.dataset.invite)); return; }
      const copyInvite = event.target.closest('[data-copy-invite]');
      if (copyInvite) {
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(copyInvite.dataset.copyInvite).then(() => showToast(text('Code copié.', 'Code copied.'))).catch(() => showToast(copyInvite.dataset.copyInvite));
        } else showToast(copyInvite.dataset.copyInvite);
        return;
      }
      const contribute = event.target.closest('[data-contribute]');
      if (contribute) { showContribution(findGroup(contribute.dataset.contribute)); return; }
      const discussion = event.target.closest('[data-discussion]');
      if (discussion) { showDiscussion(findGroup(discussion.dataset.discussion)).catch(firebaseError); return; }
      const authTab = event.target.closest('[data-auth-tab]');
      if (authTab) { showAuth(authTab.dataset.authTab); return; }
      if (event.target.closest('[data-forgot-password]')) { showForgotPassword(); return; }
    });
    document.addEventListener('submit', (event) => {
      if (event.target.id === 'createGroupForm') { event.preventDefault(); createGroup(event.target).catch(firebaseError); }
      if (event.target.id === 'joinGroupForm') { event.preventDefault(); joinGroup(event.target).catch(firebaseError); }
      if (event.target.id === 'contributionForm') { event.preventDefault(); declareContribution(event.target).catch(firebaseError); }
      if (event.target.id === 'messageForm') { event.preventDefault(); sendMessage(event.target).catch(firebaseError); }
    });
    document.addEventListener('click', (event) => {
      const googleButton = event.target.closest('[data-firebase-google]');
      if (googleButton) {
        if (!window.FirebaseClient) return showToast(text('Chargement en cours, réessayez dans un instant.', 'Still loading, please try again in a moment.'));
        document.getElementById('authErrorBox')?.setAttribute('hidden', '');
        setButtonLoading(googleButton, true, text('Connexion...', 'Signing in...'));
        window.FirebaseClient.signInWithGoogle()
          .catch(firebaseError)
          .finally(() => setButtonLoading(googleButton, false));
      }
    });
    document.addEventListener('submit', (event) => {
      if (event.target.id === 'firebaseSigninForm' || event.target.id === 'firebaseSignupForm') {
        event.preventDefault();
        if (!window.FirebaseClient) return showToast(text('Chargement en cours, réessayez dans un instant.', 'Still loading, please try again in a moment.'));
        document.getElementById('authErrorBox')?.setAttribute('hidden', '');
        const isSignup = event.target.id === 'firebaseSignupForm';
        const data = new FormData(event.target);
        const submitButton = event.target.querySelector('button[type="submit"]');
        setButtonLoading(submitButton, true, text('Veuillez patienter...', 'Please wait...'));
        window.FirebaseClient.signInWithEmail(data.get('email'), data.get('password'), isSignup, isSignup ? (data.get('displayName') || '').trim() : '')
          .catch(firebaseError)
          .finally(() => setButtonLoading(submitButton, false));
      }
      if (event.target.id === 'forgotPasswordForm') {
        event.preventDefault();
        if (!window.FirebaseClient) return showToast(text('Chargement en cours, réessayez dans un instant.', 'Still loading, please try again in a moment.'));
        document.getElementById('authErrorBox')?.setAttribute('hidden', '');
        const email = new FormData(event.target).get('email');
        const submitButton = event.target.querySelector('button[type="submit"]');
        setButtonLoading(submitButton, true, text('Envoi...', 'Sending...'));
        window.FirebaseClient.resetPassword(email)
          .then(() => {
            closeModal();
            showToast(text('E-mail envoyé. Vérifiez votre boîte de réception.', 'Email sent. Check your inbox.'));
          })
          .catch(firebaseError)
          .finally(() => setButtonLoading(submitButton, false));
      }
    });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && modal()?.classList.contains('active')) closeModal(); });
  }

  function init() {
    try {
      const deferredPurchase = sessionStorage.getItem('luciole_pending_group_purchase');
      if (deferredPurchase) {
        pendingProduct = JSON.parse(deferredPurchase);
        sessionStorage.removeItem('luciole_pending_group_purchase');
        window.setTimeout(() => showCreateGroup(pendingProduct), 0);
      }
    } catch (_) {
      sessionStorage.removeItem('luciole_pending_group_purchase');
    }
    bindEvents();
    window.addEventListener('firebase-auth-state', (event) => applyFirebaseUser(event.detail));
    window.addEventListener('firebase-auth-error', (event) => firebaseError(event.detail));
    window.addEventListener('firebase-new-user', (event) => showWelcome(event.detail?.name));
    window.addEventListener('firebase-ready', startPublicGroupsSubscription);
    startPublicGroupsSubscription();
    render();
  }
  return { init, openCreateForProduct, showAuth, render };
})();

window.GroupUI = GroupUI;
document.addEventListener('DOMContentLoaded', () => GroupUI.init());
