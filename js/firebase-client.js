import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  addDoc,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
  where
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

// Firebase Web configuration. It is designed to be public; server credentials are never stored here.
const firebaseConfig = {
  apiKey: 'AIzaSyA_yhUg0V4KANKljVZ3OFtxSQdUHTQDktw',
  authDomain: 'luciole-india-hair-2911c.firebaseapp.com',
  projectId: 'luciole-india-hair-2911c',
  storageBucket: 'luciole-india-hair-2911c.firebasestorage.app',
  messagingSenderId: '894131951013',
  appId: '1:894131951013:web:915011f532c5e57292844c'
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

function friendlyAuthError(error) {
  const origin = window.location.hostname;
  const messages = {
    'auth/unauthorized-domain': `Ce site (${origin}) n’est pas encore autorisé dans Firebase. Dans la console Firebase, ouvrez Authentication → Settings → Authorized domains puis ajoutez ce domaine.`,
    'auth/operation-not-allowed': 'La connexion Google n’est pas activée. Dans la console Firebase, ouvrez Authentication → Sign-in method → Google puis activez-la.',
    'auth/popup-blocked': 'La fenêtre Google a été bloquée par le navigateur. Autorisez les pop-ups pour ce site puis réessayez.',
    'auth/popup-closed-by-user': 'La fenêtre de connexion a été fermée avant la fin.',
    'auth/cancelled-popup-request': null,
    'auth/network-request-failed': 'La connexion réseau a échoué. Vérifiez votre connexion internet puis réessayez.',
    'auth/account-exists-with-different-credential': 'Un compte existe déjà avec cette adresse e-mail. Connectez-vous avec le moyen habituel (e-mail ou Google).',
    'auth/invalid-email': 'Cette adresse e-mail n’est pas valide.',
    'auth/user-not-found': 'Aucun compte n’est associé à cette adresse e-mail.',
    'auth/wrong-password': 'Mot de passe incorrect.',
    'auth/invalid-credential': 'E-mail ou mot de passe incorrect.',
    'auth/email-already-in-use': 'Un compte existe déjà avec cette adresse e-mail. Connectez-vous plutôt.',
    'auth/weak-password': 'Le mot de passe doit contenir au moins 6 caractères.',
    'auth/too-many-requests': 'Trop de tentatives. Patientez quelques minutes puis réessayez.',
    'auth/missing-email': 'Saisissez votre adresse e-mail.'
  };
  if (error?.code && Object.prototype.hasOwnProperty.call(messages, error.code) && messages[error.code] === null) {
    // Silent/expected error (e.g. user cancelled a duplicate popup): no message needed.
    const silent = new Error('');
    silent.silent = true;
    return silent;
  }
  return new Error(messages[error?.code] || 'La connexion a échoué. Réessayez ou contactez le support.');
}

function notifyAuthState(user) {
  window.dispatchEvent(new CustomEvent('firebase-auth-state', {
    detail: user ? {
      id: user.uid,
      name: user.displayName || user.email || user.phoneNumber || 'Membre Luciole',
      email: user.email || null,
      phone: user.phoneNumber || null,
      avatarUrl: user.photoURL || null,
      status: 'accepted',
      source: 'firebase'
    } : null
  }));
}

async function signInWithGoogle() {
  try {
    return await signInWithPopup(auth, googleProvider);
  } catch (error) {
    // If the popup is explicitly blocked by the browser, fall back to redirect.
    if (error?.code === 'auth/popup-blocked') {
      try {
        return await signInWithRedirect(auth, googleProvider);
      } catch (redirectError) {
        throw friendlyAuthError(redirectError);
      }
    }
    throw friendlyAuthError(error);
  }
}

async function resetPassword(email) {
  if (!email) throw friendlyAuthError({ code: 'auth/missing-email' });
  await sendPasswordResetEmail(auth, email);
}

async function signInWithEmail(email, password, createAccount = false, displayName = '') {
  try {
    const credential = createAccount
      ? await createUserWithEmailAndPassword(auth, email, password)
      : await signInWithEmailAndPassword(auth, email, password);
    if (createAccount && displayName) await updateProfile(credential.user, { displayName });
    return credential;
  } catch (error) {
    throw friendlyAuthError(error);
  }
}

onAuthStateChanged(auth, async (user) => {
  let isNewUser = false;
  try {
    if (user) {
      const userRef = doc(db, 'users', user.uid);
      const existingUser = await getDoc(userRef);
      const profile = {
        displayName: user.displayName || user.email || 'Membre Luciole',
        email: user.email || null,
        updatedAt: serverTimestamp()
      };
      if (!existingUser.exists()) {
        profile.role = 'customer';
        isNewUser = true;
      }
      await setDoc(userRef, profile, { merge: true });
    }
  } catch (error) {
    // Auth must still open the private interface even if Firestore is temporarily unavailable.
    console.warn('Firebase profile synchronization failed:', error);
  } finally {
    notifyAuthState(user);
    if (isNewUser && user) {
      window.dispatchEvent(new CustomEvent('firebase-new-user', {
        detail: { name: user.displayName || user.email || 'Membre Luciole' }
      }));
    }
  }
});

// Complete a Google sign-in that was started with the mobile redirect flow.
getRedirectResult(auth).catch((error) => {
  if (error?.code) window.dispatchEvent(new CustomEvent('firebase-auth-error', { detail: friendlyAuthError(error) }));
});

async function createContributionGroup(group, user) {
  const groupRef = doc(db, 'groups', group.id);
  const userMembershipRef = doc(db, 'users', user.id, 'groupMemberships', group.id);
  const batch = writeBatch(db);
  batch.set(groupRef, {
    name: group.name,
    beneficiary: group.beneficiary,
    privacy: group.privacy,
    presentationMessage: group.message || null,
    creatorId: user.id,
    productId: group.productId,
    productName: group.productName,
    variant: group.variant,
    targetAmount: group.targetAmount,
    priceSnapshot: group.priceSnapshot,
    inviteCode: group.inviteCode,
    memberCount: 1,
    status: 'funding',
    createdAt: serverTimestamp()
  });
  batch.set(doc(groupRef, 'members', user.id), {
    userId: user.id,
    name: user.name,
    groupId: group.id,
    groupName: group.name,
    creatorId: user.id,
    productId: group.productId,
    productName: group.productName,
    variant: group.variant,
    targetAmount: group.targetAmount,
    beneficiary: group.beneficiary,
    privacy: group.privacy,
    memberCount: 1,
    role: 'group_admin',
    status: 'accepted',
    createdAt: serverTimestamp()
  });
  batch.set(userMembershipRef, {
    userId: user.id,
    groupId: group.id,
    groupName: group.name,
    creatorId: user.id,
    productId: group.productId,
    productName: group.productName,
    variant: group.variant,
    targetAmount: group.targetAmount,
    beneficiary: group.beneficiary,
    privacy: group.privacy,
    memberCount: 1,
    role: 'group_admin',
    status: 'accepted',
    createdAt: serverTimestamp()
  });
  batch.set(doc(db, 'groupInvites', group.inviteCode), {
    inviteCode: group.inviteCode,
    groupId: group.id,
    groupName: group.name,
    creatorId: user.id,
    productId: group.productId || null,
    productName: group.productName || 'Greffe sélectionnée',
    variant: group.variant || '',
    targetAmount: group.targetAmount || 0,
    beneficiary: group.beneficiary || '',
    privacy: group.privacy || 'private',
    createdAt: serverTimestamp()
  });
  await batch.commit();
  try {
    await addDoc(collection(groupRef, 'messages'), {
      system: true,
      content: 'Le groupe a été créé. Les cotisations confirmées uniquement feront progresser l\'objectif.',
      createdAt: serverTimestamp()
    });
  } catch (_) {
    // System message is non-critical — the group is already created.
  }
}

async function getMemberGroups(userId) {
  const memberships = new Map();
  const remember = (groupId, data = {}) => {
    if (!groupId || (data.status && data.status !== 'accepted')) return;
    memberships.set(groupId, { ...(memberships.get(groupId) || {}), ...data, groupId });
  };

  // Primary path: each account owns a tiny private registry of its groups.
  // This avoids collection-group indexes and survives login/reload reliably.
  const directSnapshot = await getDocs(collection(db, 'users', userId, 'groupMemberships'));
  directSnapshot.docs.forEach((item) => remember(item.id, item.data()));

  // Recovery path for groups created before the private registry existed.
  // The security rules only permit this query for the authenticated creator.
  try {
    const ownedSnapshot = await getDocs(query(collection(db, 'groups'), where('creatorId', '==', userId)));
    await Promise.all(ownedSnapshot.docs.map(async (item) => {
      const data = item.data() || {};
      const summary = {
        userId,
        groupId: item.id,
        groupName: data.name || 'Groupe privé Luciole',
        creatorId: userId,
        productId: data.productId || null,
        productName: data.productName || 'Greffe sélectionnée',
        variant: data.variant || 'Longueur à confirmer',
        targetAmount: Number(data.targetAmount) || 1,
        beneficiary: data.beneficiary || 'Bénéficiaire à confirmer',
        privacy: data.privacy || 'private',
        memberCount: Number(data.memberCount) || 1,
        role: 'group_admin',
        status: 'accepted'
      };
      remember(item.id, summary);
      // Repair both membership locations for an older creator account.
      await Promise.all([
        setDoc(doc(db, 'groups', item.id, 'members', userId), { ...summary, name: auth.currentUser?.displayName || auth.currentUser?.email || 'Membre Luciole', updatedAt: serverTimestamp() }, { merge: true }),
        setDoc(doc(db, 'users', userId, 'groupMemberships', item.id), { ...summary, updatedAt: serverTimestamp() }, { merge: true })
      ]).catch((error) => console.warn('Could not repair an owner membership:', error));
    }));
  } catch (error) {
    console.warn('Could not recover groups owned by this account:', error);
  }

  // Legacy recovery for members who joined before the private registry was
  // added. Failure here no longer prevents the primary list from loading.
  try {
    const legacySnapshot = await getDocs(query(collectionGroup(db, 'members'), where('userId', '==', userId)));
    legacySnapshot.docs.forEach((item) => remember(item.ref.parent.parent.id, item.data()));
  } catch (error) {
    console.warn('Legacy membership lookup unavailable:', error);
  }

  const groups = await Promise.all(Array.from(memberships.entries()).map(async ([groupId, membershipData]) => {
    const groupRef = doc(db, 'groups', groupId);
    const fallbackGroup = {
      id: groupId,
      name: membershipData.groupName || 'Groupe privé Luciole',
      beneficiary: membershipData.beneficiary || 'Bénéficiaire à confirmer',
      privacy: membershipData.privacy || 'private',
      creatorId: membershipData.creatorId || membershipData.userId || userId,
      productId: membershipData.productId || null,
      productName: membershipData.productName || 'Greffe sélectionnée',
      variant: membershipData.variant || 'Longueur à confirmer',
      targetAmount: Number(membershipData.targetAmount) > 0 ? Number(membershipData.targetAmount) : 1,
      memberCount: Number(membershipData.memberCount) > 0 ? Number(membershipData.memberCount) : 1,
      contributions: [],
      messages: []
    };
    try {
      const groupSnapshot = await getDoc(groupRef);
      if (!groupSnapshot.exists()) return fallbackGroup;
      const contributions = await getDocs(collection(groupRef, 'contributions'));
      const loadedGroup = {
        id: groupSnapshot.id,
        ...groupSnapshot.data(),
        contributions: contributions.docs.map((item) => ({ id: item.id, ...item.data() })),
        // The group keeps this display value.  Do not load every member here:
        // a member must never need access to the complete membership list just
        // to open their own dashboard.
        memberCount: Number(groupSnapshot.data().memberCount) || 1,
        messages: []
      };
      // Backfill the reliable private registry for legacy memberships.
      setDoc(doc(db, 'users', userId, 'groupMemberships', groupId), {
        userId,
        groupId,
        groupName: loadedGroup.name || fallbackGroup.name,
        creatorId: loadedGroup.creatorId || fallbackGroup.creatorId,
        productId: loadedGroup.productId || null,
        productName: loadedGroup.productName || fallbackGroup.productName,
        variant: loadedGroup.variant || fallbackGroup.variant,
        targetAmount: Number(loadedGroup.targetAmount) || fallbackGroup.targetAmount,
        beneficiary: loadedGroup.beneficiary || fallbackGroup.beneficiary,
        privacy: loadedGroup.privacy || fallbackGroup.privacy,
        memberCount: Number(loadedGroup.memberCount) || fallbackGroup.memberCount,
        role: membershipData.role || 'member',
        status: 'accepted',
        updatedAt: serverTimestamp()
      }, { merge: true }).catch((error) => console.warn('Could not backfill membership registry:', error));
      return loadedGroup;
    } catch (error) {
      console.warn('Using membership fallback for unreadable group:', error);
      return fallbackGroup;
    }
  }));
  return groups.filter(Boolean);
}

async function joinContributionGroup(inviteCode, user) {
  const normalizedCode = String(inviteCode || '').trim().toUpperCase();
  const inviteSnapshot = await getDoc(doc(db, 'groupInvites', normalizedCode));
  if (!inviteSnapshot.exists()) {
    const error = new Error('Code d’invitation introuvable.');
    error.code = 'not-found';
    throw error;
  }
  const invite = inviteSnapshot.data();

  // Build group summary from invite doc — no group read needed at this stage.
  // The invite now contains the full metadata stored at group creation time.
  const groupSummary = {
    groupId: invite.groupId,
    groupName: invite.groupName || 'Groupe privé Luciole',
    creatorId: invite.creatorId || null,
    productId: invite.productId || null,
    productName: invite.productName || 'Greffe sélectionnée',
    variant: invite.variant || 'Longueur à confirmer',
    targetAmount: Number(invite.targetAmount) > 0 ? Number(invite.targetAmount) : 1,
    beneficiary: invite.beneficiary || 'Bénéficiaire à confirmer',
    privacy: invite.privacy || 'private',
    memberCount: 1
  };

  const memberRef = doc(db, 'groups', invite.groupId, 'members', user.id);
  const userMembershipRef = doc(db, 'users', user.id, 'groupMemberships', invite.groupId);
  const existingMember = await getDoc(memberRef);

  if (existingMember.exists()) {
    // Older joins may have the group member document but not the private
    // account registry. Repair it even when the code was already accepted.
    await setDoc(userMembershipRef, {
      userId: user.id,
      ...groupSummary,
      role: existingMember.data().role || 'member',
      status: 'accepted',
      updatedAt: serverTimestamp()
    }, { merge: true });
    return { ...groupSummary, alreadyMember: true };
  }

  // STEP 1 — Write member doc FIRST so the user becomes an accepted member.
  // All subsequent operations (group read, message write) depend on this status.
  const joinBatch = writeBatch(db);
  joinBatch.set(memberRef, {
    userId: user.id,
    name: user.name,
    ...groupSummary,
    role: 'member',
    status: 'accepted',
    joinedAt: serverTimestamp()
  });
  joinBatch.set(userMembershipRef, {
    userId: user.id,
    ...groupSummary,
    role: 'member',
    status: 'accepted',
    joinedAt: serverTimestamp()
  });
  await joinBatch.commit();

  // STEP 2 — Now that the member doc exists, try to read the full group doc to
  // get the latest targetAmount and memberCount. The security rule
  // isAcceptedMember() will now pass because we just wrote status:'accepted'.
  try {
    const groupSnapshot = await getDoc(doc(db, 'groups', invite.groupId));
    if (groupSnapshot.exists()) {
      const data = groupSnapshot.data();
      groupSummary.groupName = data.name || groupSummary.groupName;
      groupSummary.productName = data.productName || groupSummary.productName;
      groupSummary.variant = data.variant || groupSummary.variant;
      groupSummary.targetAmount = Number(data.targetAmount) > 0 ? Number(data.targetAmount) : groupSummary.targetAmount;
      groupSummary.beneficiary = data.beneficiary || groupSummary.beneficiary;
      groupSummary.privacy = data.privacy || groupSummary.privacy;
      groupSummary.memberCount = (Number(data.memberCount) || 1) + 1;
      // Update the account registry with accurate data from the group.
      setDoc(userMembershipRef, { userId: user.id, ...groupSummary, updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
    }
  } catch (groupReadError) {
    console.warn('Could not refresh group data after join (will use invite data):', groupReadError);
  }

  // STEP 3 — Write join message (user is now an accepted member so the rule passes).
  addDoc(collection(db, 'groups', invite.groupId, 'messages'), {
    system: true,
    content: `${user.name} a rejoint le groupe.`,
    createdAt: serverTimestamp()
  }).catch((msgError) => console.warn('Could not write join message:', msgError));

  return { ...groupSummary, alreadyMember: false };
}

async function declareContribution(groupId, contribution) {
  await addDoc(collection(db, 'groups', groupId, 'contributions'), {
    ...contribution,
    status: 'declared',
    createdAt: serverTimestamp()
  });
}

async function getGroupMessages(groupId) {
  const snapshot = await getDocs(query(collection(db, 'groups', groupId, 'messages'), orderBy('createdAt', 'asc')));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

async function sendGroupMessage(groupId, message) {
  await addDoc(collection(db, 'groups', groupId, 'messages'), {
    ...message,
    system: false,
    createdAt: serverTimestamp()
  });
}


/* ===== Catalog price overrides (Firestore) ===== */
const CATALOG_PRICES_REF = doc(db, 'catalog_prices', 'overrides');

async function fetchPriceOverrides() {
  try {
    const snap = await getDoc(CATALOG_PRICES_REF);
    return snap.exists() ? (snap.data().prices || {}) : {};
  } catch (e) {
    console.warn('[Luciole] Prix hors-ligne, utilisation du cache local :', e.message);
    return {};
  }
}

async function savePriceOverride(productId, price) {
  await setDoc(CATALOG_PRICES_REF, { prices: { [String(productId)]: Number(price) } }, { merge: true });
}

async function deleteAllPriceOverrides(prices) {
  await setDoc(CATALOG_PRICES_REF, { prices }, { merge: false });
}

window.FirebaseClient = {
  firebaseApp,
  auth,
  db,
  signInWithGoogle,
  signInWithEmail,
  fetchPriceOverrides,
  savePriceOverride,
  deleteAllPriceOverrides,
  resetPassword,
  signOut,
  createContributionGroup,
  joinContributionGroup,
  getMemberGroups,
  declareContribution,
  getGroupMessages,
  sendGroupMessage
};
window.dispatchEvent(new Event('firebase-ready'));
