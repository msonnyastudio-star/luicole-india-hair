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
  batch.set(doc(db, 'groupInvites', group.inviteCode), {
    inviteCode: group.inviteCode,
    groupId: group.id,
    groupName: group.name,
    creatorId: user.id,
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
  // Single where clause avoids composite index requirement; filter status client-side.
  const membershipSnapshot = await getDocs(query(
    collectionGroup(db, 'members'),
    where('userId', '==', userId)
  ));
  const acceptedDocs = membershipSnapshot.docs.filter((d) => {
    const status = d.data().status;
    return !status || status === 'accepted';
  });
  const groups = await Promise.all(acceptedDocs.map(async (membership) => {
    const membershipData = membership.data() || {};
    const groupRef = membership.ref.parent.parent;
    const fallbackGroup = {
      id: groupRef.id,
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
      return {
        id: groupSnapshot.id,
        ...groupSnapshot.data(),
        contributions: contributions.docs.map((item) => ({ id: item.id, ...item.data() })),
        // The group keeps this display value.  Do not load every member here:
        // a member must never need access to the complete membership list just
        // to open their own dashboard.
        memberCount: Number(groupSnapshot.data().memberCount) || 1,
        messages: []
      };
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
  let groupSummary = {};
  try {
    const groupSnapshot = await getDoc(doc(db, 'groups', invite.groupId));
    if (groupSnapshot.exists()) {
      const data = groupSnapshot.data();
      groupSummary = {
        groupName: data.name || invite.groupName || 'Groupe privé Luciole',
        creatorId: data.creatorId || invite.creatorId || null,
        productId: data.productId || null,
        productName: data.productName || 'Greffe sélectionnée',
        variant: data.variant || 'Longueur à confirmer',
        targetAmount: Number(data.targetAmount) > 0 ? Number(data.targetAmount) : 1,
        beneficiary: data.beneficiary || 'Bénéficiaire à confirmer',
        privacy: data.privacy || 'private',
        memberCount: Number(data.memberCount) > 0 ? Number(data.memberCount) : 1
      };
    }
  } catch (error) {
    console.warn('Unable to read group summary while joining:', error);
  }
  const memberRef = doc(db, 'groups', invite.groupId, 'members', user.id);
  const existingMember = await getDoc(memberRef);
  if (!existingMember.exists()) {
    await setDoc(memberRef, {
      userId: user.id,
      name: user.name,
      groupId: invite.groupId,
      groupName: invite.groupName || groupSummary.groupName || 'Groupe privé Luciole',
      ...groupSummary,
      role: 'member',
      status: 'accepted',
      joinedAt: serverTimestamp()
    });
    await addDoc(collection(db, 'groups', invite.groupId, 'messages'), {
      system: true,
      content: `${user.name} a rejoint le groupe.`,
      createdAt: serverTimestamp()
    });
  }
  return { ...invite, ...groupSummary, alreadyMember: existingMember.exists() };
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
