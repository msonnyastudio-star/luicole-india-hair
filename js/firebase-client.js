import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
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
    'auth/unauthorized-domain': `Ce domaine (${origin}) n’est pas encore autorisé dans Firebase. Ajoutez-le dans Authentication → Settings → Authorized domains.`,
    'auth/operation-not-allowed': 'La connexion Google n’est pas activée dans Firebase Authentication. Activez Google dans Sign-in method.',
    'auth/popup-blocked': 'La fenêtre Google a été bloquée par le navigateur. Autorisez les pop-ups puis réessayez.',
    'auth/popup-closed-by-user': 'La fenêtre de connexion a été fermée avant la fin.',
    'auth/network-request-failed': 'La connexion réseau a échoué. Vérifiez votre connexion puis réessayez.',
    'auth/account-exists-with-different-credential': 'Un compte existe déjà avec cette adresse. Connectez-vous d’abord avec son moyen de connexion habituel.'
  };
  return new Error(messages[error?.code] || 'La connexion Google a échoué. Réessayez ou utilisez votre e-mail.');
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
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  try {
    // Firebase recommends redirect on mobile because pop-ups are often blocked there.
    if (isMobile) return await signInWithRedirect(auth, googleProvider);
    return await signInWithPopup(auth, googleProvider);
  } catch (error) {
    throw friendlyAuthError(error);
  }
}

async function signInWithEmail(email, password, createAccount = false, displayName = '') {
  const credential = createAccount
    ? await createUserWithEmailAndPassword(auth, email, password)
    : await signInWithEmailAndPassword(auth, email, password);
  if (createAccount && displayName) await updateProfile(credential.user, { displayName });
  return credential;
}

onAuthStateChanged(auth, async (user) => {
  try {
    if (user) {
      const userRef = doc(db, 'users', user.uid);
      const existingUser = await getDoc(userRef);
      const profile = {
        displayName: user.displayName || user.email || 'Membre Luciole',
        email: user.email || null,
        updatedAt: serverTimestamp()
      };
      if (!existingUser.exists()) profile.role = 'customer';
      await setDoc(userRef, profile, { merge: true });
    }
  } catch (error) {
    // Auth must still open the private interface even if Firestore is temporarily unavailable.
    console.warn('Firebase profile synchronization failed:', error);
  } finally {
    notifyAuthState(user);
  }
});

// Complete a Google sign-in that was started with the mobile redirect flow.
getRedirectResult(auth).catch((error) => {
  if (error?.code) window.dispatchEvent(new CustomEvent('firebase-auth-error', { detail: friendlyAuthError(error) }));
});

async function createContributionGroup(group, user) {
  const groupRef = doc(db, 'groups', group.id);
  await setDoc(groupRef, {
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
    memberCount: 1,
    status: 'funding',
    createdAt: serverTimestamp()
  });
  await setDoc(doc(groupRef, 'members', user.id), {
    userId: user.id,
    name: user.name,
    role: 'group_admin',
    status: 'accepted',
    createdAt: serverTimestamp()
  });
  await addDoc(collection(groupRef, 'messages'), {
    system: true,
    content: 'Le groupe a été créé. Les cotisations confirmées uniquement feront progresser l’objectif.',
    createdAt: serverTimestamp()
  });
}

async function getMemberGroups(userId) {
  const membershipSnapshot = await getDocs(query(
    collectionGroup(db, 'members'),
    where('userId', '==', userId),
    where('status', '==', 'accepted')
  ));
  const groups = await Promise.all(membershipSnapshot.docs.map(async (membership) => {
    const groupRef = membership.ref.parent.parent;
    const groupSnapshot = await getDoc(groupRef);
    if (!groupSnapshot.exists()) return null;
    const contributions = await getDocs(collection(groupRef, 'contributions'));
    return {
      id: groupSnapshot.id,
      ...groupSnapshot.data(),
      contributions: contributions.docs.map((item) => ({ id: item.id, ...item.data() })),
      messages: []
    };
  }));
  return groups.filter(Boolean);
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

window.FirebaseClient = {
  firebaseApp,
  auth,
  db,
  signInWithGoogle,
  signInWithEmail,
  signOut,
  createContributionGroup,
  getMemberGroups,
  declareContribution,
  getGroupMessages,
  sendGroupMessage
};
window.dispatchEvent(new Event('firebase-ready'));
