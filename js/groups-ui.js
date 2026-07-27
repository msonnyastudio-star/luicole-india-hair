/* Firebase Authentication drives the private group interface.
 * Payment confirmation and private-file URLs remain server-only operations.
 */
const GroupUI = (() => {
  const USER_KEY = 'luciole_group_user';
  const GROUPS_KEY = 'luciole_contribution_groups';
  let pendingProduct = null;
  let firestoreGroups = null;

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
  const firebaseError = (error) => {
    const messages = {
      'permission-denied': text('Accès Firestore refusé. Vérifiez que les règles Firestore ont été déployées pour ce projet Firebase.', 'Firestore access was denied. Check that the Firestore rules have been deployed to this Firebase project.'),
      'unavailable': text('Firestore est momentanément indisponible. Vérifiez votre connexion puis réessayez.', 'Firestore is temporarily unavailable. Check your connection and try again.'),
      'unauthenticated': text('Votre session a expiré. Connectez-vous à nouveau avant de continuer.', 'Your session has expired. Sign in again before continuing.')
    };
    showToast(messages[error?.code] || error?.message || text('Une erreur de connexion est survenue.', 'A connection error occurred.'));
  };

  function openModal(content) {
    const element = modal();
    element.innerHTML = `<div class="group-modal-card" role="dialog" aria-modal="true" aria-label="${text('Espace groupes', 'Group space')}">
      <button class="group-modal-close" type="button" data-group-close aria-label="${text('Fermer', 'Close')}"><i class="fas fa-times"></i></button>${content}</div>`;
    element.classList.add('active');
    element.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => element.querySelector('input, button, select, textarea')?.focus(), 0);
  }

  function closeModal() {
    const element = modal();
    element.classList.remove('active');
    element.setAttribute('aria-hidden', 'true');
    element.innerHTML = '';
    document.body.style.overflow = '';
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
    if (!prompt || !dashboard) return;
    prompt.hidden = Boolean(user);
    dashboard.hidden = !user;
    if (account) account.innerHTML = user ? `<i class="fas fa-user-check"></i><span class="account-label">${escapeHTML(user.name)}</span>` : `<i class="fas fa-user"></i><span class="account-label">${text('Mon espace', 'My account')}</span>`;
    if (!user) return;

    const grid = document.getElementById('groupsGrid');
    const groups = getGroups();
    if (!groups.length) {
      grid.innerHTML = `<div class="groups-auth-prompt"><div><h3>${text('Aucun groupe pour le moment', 'No groups yet')}</h3><p>${text('Choisissez un produit puis créez un groupe privé pour commencer un achat collectif.', 'Choose a product, then create a private group to start a group purchase.')}</p></div><button class="btn btn-primary" data-create-group><i class="fas fa-users"></i> ${text('Créer mon premier groupe', 'Create my first group')}</button></div>`;
      return;
    }
    grid.innerHTML = groups.map((group) => {
      const confirmed = GroupDomain.sumConfirmed(group.contributions || []);
      const remaining = GroupDomain.getRemaining(group.targetAmount, group.contributions || []);
      const percentage = Math.min(100, Math.round((confirmed / group.targetAmount) * 100));
      const declaredCount = (group.contributions || []).filter((item) => item.status === 'declared').length;
      return `<article class="group-card">
        <div class="group-card-content">
          <div class="group-card-top"><div class="group-title-wrap"><span class="group-community-icon"><i class="fas fa-users"></i></span><div><h3>${escapeHTML(group.name)}</h3><p class="group-card-product">${escapeHTML(group.productName)} · ${escapeHTML(group.variant)}</p></div></div><span class="group-status"><i class="fas ${group.privacy === 'private' ? 'fa-lock' : 'fa-compass'}"></i> ${group.privacy === 'private' ? text('Privé', 'Private') : text('Découvrable', 'Discoverable')}</span></div>
          <p class="group-beneficiary"><i class="fas fa-gift"></i> ${text('Bénéficiaire', 'Beneficiary')}: ${escapeHTML(group.beneficiary)}</p>
          <div class="group-amounts"><span>${text('Confirmé', 'Confirmed')} <strong>${money(confirmed)}</strong></span><span>${text('Reste', 'Remaining')} ${money(remaining)}</span></div>
          <div class="group-progress" aria-label="${text('Progression', 'Progress')} ${percentage}%"><span style="width:${percentage}%"></span></div>
          <div class="group-card-meta"><span><i class="fas fa-users"></i> ${group.memberCount || 1} ${text((group.memberCount || 1) > 1 ? 'membres' : 'membre', (group.memberCount || 1) > 1 ? 'members' : 'member')}</span><span><i class="fas fa-file-invoice"></i> ${declaredCount} ${text('à vérifier', 'to review')}</span></div>
          <div class="group-card-actions"><button type="button" class="btn btn-outline" data-invite="${group.id}"><i class="fas fa-user-plus"></i> ${text('Inviter', 'Invite')}</button><button type="button" class="btn btn-outline" data-contribute="${group.id}">${text('Cotiser', 'Contribute')}</button><button type="button" class="btn btn-primary" data-discussion="${group.id}">${text('Discussion', 'Chat')}</button></div>
        </div>
      </article>`;
    }).join('');
  }

  function showAuth() {
    openModal(`<h2>${text('Se connecter à l’espace groupes', 'Sign in to the group space')}</h2>
      <p>${text('Les groupes, cotisations et discussions sont privés. Connectez-vous pour poursuivre.', 'Groups, contributions and chats are private. Sign in to continue.')}</p>
      <div class="auth-options">
        <button class="btn btn-outline" type="button" data-firebase-google><i class="fab fa-google"></i> ${text('Continuer avec Google', 'Continue with Google')}</button>
        <form class="group-form" id="firebaseEmailForm"><label>${text('Adresse e-mail', 'Email address')}<input name="email" type="email" autocomplete="email" required></label><label>${text('Mot de passe', 'Password')}<input name="password" type="password" autocomplete="current-password" minlength="6" required></label><label><input name="createAccount" type="checkbox"> ${text('Créer un compte si nécessaire', 'Create an account if needed')}</label><button class="btn btn-primary" type="submit"><i class="fas fa-envelope"></i> ${text('Continuer avec mon e-mail', 'Continue with email')}</button></form>
      </div>`);
  }

  function applyFirebaseUser(user) {
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      closeModal();
      render();
      refreshFirestoreGroups();
      if (pendingProduct) showCreateGroup(pendingProduct);
      return;
    }
    const storedUser = getUser();
    if (storedUser?.source === 'firebase') localStorage.removeItem(USER_KEY);
    render();
  }

  async function refreshFirestoreGroups() {
    const user = getUser();
    if (!user?.source || !window.FirebaseClient) return;
    try {
      firestoreGroups = await window.FirebaseClient.getMemberGroups(user.id);
      render();
    } catch (error) {
      // Rules are intentionally strict: explain a missing deployment without exposing private data.
      showToast('Impossible de charger vos groupes. Vérifiez que Firestore et ses règles sont déployés.');
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
        <label>${text('Confidentialité', 'Privacy')}<select name="privacy"><option value="private">${text('Privé — recommandé', 'Private — recommended')}</option><option value="discoverable">${text('Découvrable — sur demande d’adhésion', 'Discoverable — membership request required')}</option></select></label>
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
      await refreshFirestoreGroups();
      closeModal();
      showToast(invite.alreadyMember ? text('Vous faites déjà partie de ce groupe.', 'You are already a member of this group.') : text('Bienvenue dans le groupe ! Vous pouvez maintenant discuter et cotiser.', 'Welcome to the group! You can now chat and contribute.'));
      return;
    }
    const groups = getGroups();
    const group = groups.find((item) => item.inviteCode === code);
    if (!group) throw new Error(text('Ce code est introuvable sur cet appareil. Connectez-vous avec Firebase pour rejoindre un groupe partagé.', 'This code cannot be found on this device. Sign in with Firebase to join a shared group.'));
    closeModal();
    showToast(text('Vous faites déjà partie de ce groupe sur cet appareil.', 'You are already a member of this group on this device.'));
  }

  function findGroup(id) { return getGroups().find((group) => group.id === id); }
  function updateGroup(updated) { saveGroups(getGroups().map((group) => group.id === updated.id ? updated : group)); }

  function showContribution(group) {
    const remaining = GroupDomain.getRemaining(group.targetAmount, group.contributions || []);
    openModal(`<h2>${text('Contribuer à', 'Contribute to')} « ${escapeHTML(group.name)} »</h2>
      <p>${text('Reste à collecter', 'Remaining to collect')}: <strong>${money(remaining)}</strong>. ${text('Une cotisation déclarée ne modifie pas le total tant qu’un administrateur général ne l’a pas confirmée.', 'A declared contribution does not change the total until a site administrator confirms it.')}</p>
      <form class="group-form" id="contributionForm" data-group-id="${group.id}">
        <label>${text('Montant envoyé', 'Amount sent')} (FCFA)<input name="amount" type="number" min="1" max="${remaining}" required></label>
        <label>${text('Numéro Orange Money de l’expéditeur', 'Sender Orange Money number')}<input name="phone" inputmode="tel" required></label>
        <label>${text('Nom de l’expéditeur', 'Sender name')}<input name="senderName" required></label>
        <label>${text('Référence de transaction', 'Transaction reference')}<input name="reference" required maxlength="100"></label>
        <label>${text('Date et heure approximatives', 'Approximate date and time')}<input name="transferredAt" type="datetime-local" required></label>
        <label>${text('Note', 'Note')} <textarea name="note" maxlength="500" placeholder="${text('Facultatif', 'Optional')}"></textarea></label>
        <p class="group-payment-warning">${text('Ne déclarez une cotisation que si vous avez réellement effectué le transfert. Une fausse déclaration peut entraîner la suspension de votre compte.', 'Only declare a contribution after making the transfer. A false declaration may result in your account being suspended.')}</p>
        <button class="btn btn-primary" type="submit">${text('Déclarer le paiement', 'Declare payment')}</button>
      </form>`);
  }

  async function declareContribution(form) {
    const group = findGroup(form.dataset.groupId);
    const data = new FormData(form);
    const remaining = GroupDomain.getRemaining(group.targetAmount, group.contributions || []);
    try { GroupDomain.assertContributionAmount(data.get('amount'), remaining); } catch (error) { showToast(error.message); return; }
    const contribution = { id: createId('contribution'), memberId: getUser().id, amount: Number(data.get('amount')), senderPhone: data.get('phone').trim(), senderName: data.get('senderName').trim(), reference: data.get('reference').trim(), transferredAt: data.get('transferredAt'), note: data.get('note').trim(), status: 'declared', createdAt: new Date().toISOString() };
    if (getUser().source === 'firebase') {
      await window.FirebaseClient.declareContribution(group.id, contribution);
      await refreshFirestoreGroups();
    } else {
      group.contributions.push(contribution);
      group.messages.push({ system: true, content: text('Une cotisation a été déclarée et attend une vérification.', 'A contribution was declared and is awaiting verification.') });
      updateGroup(group);
    }
    closeModal();
    render();
    showToast(text('Paiement déclaré. Le total confirmé reste inchangé jusqu’à vérification.', 'Payment declared. The confirmed total remains unchanged until verification.'));
  }

  async function showDiscussion(group) {
    if (getUser().source === 'firebase') group.messages = await window.FirebaseClient.getGroupMessages(group.id);
    const messages = (group.messages || []).map((message) => message.system
      ? `<div class="group-message group-system-message">${escapeHTML(message.content)}</div>`
      : `<div class="group-message"><strong>${escapeHTML(message.author)}</strong>${escapeHTML(message.content)}</div>`).join('') || `<p>${text('Aucun message pour le moment.', 'No messages yet.')}</p>`;
    openModal(`<h2>${text('Discussion privée', 'Private chat')}</h2><p>${text('Seuls les membres acceptés peuvent lire et envoyer des messages.', 'Only accepted members can read and send messages.')}</p>
      <div class="group-message-list">${messages}</div>
      <form class="group-form" id="messageForm" data-group-id="${group.id}" style="margin-top:14px;"><label>${text('Votre message', 'Your message')}<textarea name="content" maxlength="1000" required placeholder="${text('Écrire un message…', 'Write a message…')}"></textarea></label><p class="group-payment-warning">${text('Respectez les autres membres. Ne partagez jamais votre code secret Orange Money, votre mot de passe ou une information bancaire confidentielle.', 'Respect other members. Never share your Orange Money PIN, password or confidential banking information.')}</p><button class="btn btn-primary" type="submit"><i class="fas fa-paper-plane"></i> ${text('Envoyer', 'Send')}</button></form>`);
  }

  async function sendMessage(form) {
    const group = findGroup(form.dataset.groupId);
    const content = new FormData(form).get('content').trim();
    if (!content) return;
    if (getUser().source === 'firebase') {
      await window.FirebaseClient.sendGroupMessage(group.id, { author: getUser().name, authorId: getUser().id, content });
    } else {
      group.messages.push({ id: createId('message'), author: getUser().name, authorId: getUser().id, content, createdAt: new Date().toISOString() });
      updateGroup(group);
    }
    await showDiscussion(group);
  }

  function openCreateForProduct(product) { showCreateGroup(product); }

  function bindEvents() {
    document.addEventListener('click', (event) => {
      const authButton = event.target.closest('[data-group-auth], #accountBtn');
      if (authButton) { showAuth(); return; }
      if (event.target.closest('[data-group-close]') || event.target === modal()) { closeModal(); return; }
      if (event.target.closest('#createGroupBtn, [data-create-group]')) { showCreateGroup(); return; }
      if (event.target.closest('[data-join-group]')) { showJoinGroup(); return; }
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
      if (discussion) showDiscussion(findGroup(discussion.dataset.discussion)).catch(firebaseError);
    });
    document.addEventListener('submit', (event) => {
      if (event.target.id === 'createGroupForm') { event.preventDefault(); createGroup(event.target).catch(firebaseError); }
      if (event.target.id === 'joinGroupForm') { event.preventDefault(); joinGroup(event.target).catch(firebaseError); }
      if (event.target.id === 'contributionForm') { event.preventDefault(); declareContribution(event.target).catch(firebaseError); }
      if (event.target.id === 'messageForm') { event.preventDefault(); sendMessage(event.target).catch(firebaseError); }
    });
    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-firebase-google]')) {
        if (!window.FirebaseClient) return showToast('Firebase est en cours de chargement.');
        window.FirebaseClient.signInWithGoogle().catch(firebaseError);
      }
    });
    document.addEventListener('submit', (event) => {
      if (event.target.id === 'firebaseEmailForm') {
        event.preventDefault();
        if (!window.FirebaseClient) return showToast('Firebase est en cours de chargement.');
        const data = new FormData(event.target);
        window.FirebaseClient.signInWithEmail(data.get('email'), data.get('password'), data.has('createAccount')).catch(firebaseError);
      }
    });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && modal()?.classList.contains('active')) closeModal(); });
  }

  function init() {
    bindEvents();
    window.addEventListener('firebase-auth-state', (event) => applyFirebaseUser(event.detail));
    window.addEventListener('firebase-auth-error', (event) => firebaseError(event.detail));
    render();
  }
  return { init, openCreateForProduct, showAuth, render };
})();

window.GroupUI = GroupUI;
document.addEventListener('DOMContentLoaded', () => GroupUI.init());
