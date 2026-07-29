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
  onSnapshot,
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
    confirmedTotal: 0,
    frequency: group.frequency || 'monthly',
    startDate: group.startDate || null,
    maxMembers: Math.max(2, Number(group.maxMembers) || 10),
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
    inviteCode: group.inviteCode,
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
    frequency: group.frequency || 'monthly',
    startDate: group.startDate || null,
    maxMembers: Math.max(2, Number(group.maxMembers) || 10),
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
  const directMembershipIds = new Set();
  const remember = (groupId, data = {}) => {
    if (!groupId || (data.status && data.status !== 'accepted')) return;
    memberships.set(groupId, { ...(memberships.get(groupId) || {}), ...data, groupId });
  };

  // Primary path: each account owns a tiny private registry of its groups.
  // This avoids collection-group indexes and survives login/reload reliably.
  const directSnapshot = await getDocs(collection(db, 'users', userId, 'groupMemberships'));
  directSnapshot.docs.forEach((item) => {
    directMembershipIds.add(item.id);
    remember(item.id, item.data());
  });

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
      if (!directMembershipIds.has(item.id)) {
        await Promise.all([
          setDoc(doc(db, 'groups', item.id, 'members', userId), { ...summary, name: auth.currentUser?.displayName || auth.currentUser?.email || 'Membre Luciole', updatedAt: serverTimestamp() }, { merge: true }),
          setDoc(doc(db, 'users', userId, 'groupMemberships', item.id), { ...summary, updatedAt: serverTimestamp() }, { merge: true })
        ]).catch((error) => console.warn('Could not repair an owner membership:', error));
      }
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
      const [contributions, members] = await Promise.all([
        getDocs(query(collection(groupRef, 'contributions'), where('memberId', '==', userId))),
        getDocs(collection(groupRef, 'members'))
      ]);
      const loadedGroup = {
        id: groupSnapshot.id,
        ...groupSnapshot.data(),
        contributions: contributions.docs.map((item) => ({ id: item.id, ...item.data() })),
        // The group keeps this display value.  Do not load every member here:
        // a member must never need access to the complete membership list just
        // to open their own dashboard.
        memberCount: members.size || Number(groupSnapshot.data().memberCount) || 1,
        messages: []
      };
      // Backfill the reliable private registry for legacy memberships.
      if (!directMembershipIds.has(groupId)) {
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
      }
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
    inviteCode: normalizedCode,
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

function subscribeMemberGroups(userId, onGroups, onError = console.error) {
  let active = true;
  let requestVersion = 0;
  const memberSubscriptions = new Map();
  const contributionSubscriptions = new Map();
  const refresh = async () => {
    const version = ++requestVersion;
    try {
      const groups = await getMemberGroups(userId);
      if (!active || version !== requestVersion) return;
      const activeIds = new Set(groups.map((group) => group.id));
      memberSubscriptions.forEach((unsubscribe, groupId) => {
        if (!activeIds.has(groupId)) {
          unsubscribe();
          memberSubscriptions.delete(groupId);
        }
      });
      contributionSubscriptions.forEach((unsubscribe, groupId) => {
        if (!activeIds.has(groupId)) {
          unsubscribe();
          contributionSubscriptions.delete(groupId);
        }
      });
      groups.forEach((group) => {
        if (!memberSubscriptions.has(group.id)) {
          const stop = onSnapshot(collection(db, 'groups', group.id, 'members'), refresh, onError);
          memberSubscriptions.set(group.id, stop);
        }
        if (!contributionSubscriptions.has(group.id)) {
          const stop = onSnapshot(query(collection(db, 'groups', group.id, 'contributions'), where('memberId', '==', userId)), refresh, onError);
          contributionSubscriptions.set(group.id, stop);
        }
      });
      onGroups(groups);
    } catch (error) {
      if (active) onError(error);
    }
  };
  const unsubscribe = onSnapshot(collection(db, 'users', userId, 'groupMemberships'), refresh, onError);
  return () => {
    active = false;
    unsubscribe();
    memberSubscriptions.forEach((stop) => stop());
    memberSubscriptions.clear();
    contributionSubscriptions.forEach((stop) => stop());
    contributionSubscriptions.clear();
  };
}

function subscribePublicGroups(onGroups, onError = console.error) {
  const publicQuery = query(
    collection(db, 'groups'),
    where('privacy', 'in', ['public', 'discoverable']),
    where('status', '==', 'funding')
  );
  const memberSubscriptions = new Map();
  let groups = [];
  const emit = () => onGroups(groups.map((group) => ({ ...group })));
  const stopGroups = onSnapshot(publicQuery, (snapshot) => {
    groups = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
      contributions: [],
      messages: []
    }));
    groups.sort((a, b) => {
      const aDate = a.createdAt?.toMillis?.() || 0;
      const bDate = b.createdAt?.toMillis?.() || 0;
      return bDate - aDate;
    });
    const activeIds = new Set(groups.map((group) => group.id));
    memberSubscriptions.forEach((unsubscribe, groupId) => {
      if (!activeIds.has(groupId)) {
        unsubscribe();
        memberSubscriptions.delete(groupId);
      }
    });
    groups.forEach((group) => {
      if (memberSubscriptions.has(group.id)) return;
      const unsubscribe = onSnapshot(collection(db, 'groups', group.id, 'members'), (members) => {
        const found = groups.find((item) => item.id === group.id);
        if (found) found.memberCount = members.size;
        emit();
      }, onError);
      memberSubscriptions.set(group.id, unsubscribe);
    });
    emit();
  }, onError);
  return () => {
    stopGroups();
    memberSubscriptions.forEach((unsubscribe) => unsubscribe());
    memberSubscriptions.clear();
  };
}

async function joinPublicGroup(groupId, user) {
  const groupRef = doc(db, 'groups', groupId);
  const groupSnapshot = await getDoc(groupRef);
  if (!groupSnapshot.exists()) throw new Error('Ce groupe public n\'existe plus.');
  const group = groupSnapshot.data();
  if (!['public', 'discoverable'].includes(group.privacy) || group.status !== 'funding') {
    throw new Error('Ce groupe n\'accepte plus de nouvelles membres.');
  }
  const memberRef = doc(groupRef, 'members', user.id);
  const userMembershipRef = doc(db, 'users', user.id, 'groupMemberships', groupId);
  const existingMember = await getDoc(memberRef);
  if (existingMember.exists()) return { id: groupId, ...group, alreadyMember: true };
  const summary = {
    userId: user.id,
    groupId,
    groupName: group.name,
    creatorId: group.creatorId,
    productId: group.productId || null,
    productName: group.productName || 'Greffe sélectionnée',
    variant: group.variant || '',
    targetAmount: Number(group.targetAmount) || 0,
    beneficiary: group.beneficiary || '',
    privacy: group.privacy,
    memberCount: Number(group.memberCount) || 1,
    frequency: group.frequency || 'monthly',
    startDate: group.startDate || null,
    maxMembers: Number(group.maxMembers) || 10,
    role: 'member',
    status: 'accepted'
  };
  const batch = writeBatch(db);
  batch.set(memberRef, { ...summary, name: user.name, joinedAt: serverTimestamp() });
  batch.set(userMembershipRef, { ...summary, joinedAt: serverTimestamp() });
  await batch.commit();
  addDoc(collection(groupRef, 'messages'), {
    system: true,
    content: `${user.name} a rejoint le groupe public.`,
    createdAt: serverTimestamp()
  }).catch(console.warn);
  return { id: groupId, ...group, alreadyMember: false };
}

async function getGroupDetails(groupId) {
  if (!auth.currentUser) throw new Error('Votre session a expiré.');
  const groupRef = doc(db, 'groups', groupId);
  const [groupSnapshot, membersSnapshot, contributionsSnapshot, messagesSnapshot] = await Promise.all([
    getDoc(groupRef),
    getDocs(collection(groupRef, 'members')),
    getDocs(query(collection(groupRef, 'contributions'), where('memberId', '==', auth.currentUser.uid))),
    getDocs(query(collection(groupRef, 'messages'), orderBy('createdAt', 'asc')))
  ]);
  if (!groupSnapshot.exists()) throw new Error('Groupe introuvable.');
  return {
    id: groupSnapshot.id,
    ...groupSnapshot.data(),
    members: membersSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
    contributions: contributionsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
    messages: messagesSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
  };
}

function subscribeGroupMessages(groupId, onMessages, onError = console.error) {
  return onSnapshot(
    query(collection(db, 'groups', groupId, 'messages'), orderBy('createdAt', 'asc')),
    (snapshot) => onMessages(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    onError
  );
}

async function declareContribution(groupId, contribution, proof) {
  if (!auth.currentUser) throw new Error('Votre session a expiré. Reconnectez-vous.');
  if (!proof?.dataUrl || !proof?.size) throw new Error('Une preuve de paiement est obligatoire.');
  const contributionRef = doc(collection(db, 'groups', groupId, 'contributions'));
  const proofRef = doc(db, 'paymentProofs', contributionRef.id);
  const batch = writeBatch(db);
  batch.set(proofRef, {
    proofId: contributionRef.id,
    contributionId: contributionRef.id,
    groupId,
    uploaderId: auth.currentUser.uid,
    dataUrl: proof.dataUrl,
    contentType: proof.contentType || 'image/jpeg',
    size: Number(proof.size) || 0,
    originalName: proof.originalName || 'preuve-paiement.jpg',
    status: 'private',
    createdAt: serverTimestamp()
  });
  batch.set(contributionRef, {
    ...contribution,
    contributionId: contributionRef.id,
    proofId: contributionRef.id,
    status: 'declared',
    createdAt: serverTimestamp()
  });
  await batch.commit();
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

/* ===== Live catalogue (Firestore is the runtime source of truth) ===== */
function normalizeProduct(snapshot) {
  const raw = snapshot.data() || {};
  const numericId = Number(raw.id ?? snapshot.id);
  return {
    ...raw,
    id: Number.isFinite(numericId) ? numericId : snapshot.id,
    referencePrice: Math.max(0, Number(raw.referencePrice) || 0),
    promoPrice: raw.promoPrice == null ? null : Math.max(0, Number(raw.promoPrice) || 0),
    lengths: Array.isArray(raw.lengths)
      ? raw.lengths.map((variant) => ({
          ...variant,
          length: String(variant.length || ''),
          price: Math.max(0, Number(variant.price) || 0)
        })).filter((variant) => variant.length)
      : [],
    images: Array.isArray(raw.images) ? raw.images.filter(Boolean) : []
  };
}

function subscribePublishedProducts(onProducts, onError = console.error) {
  const productsQuery = query(collection(db, 'products'), where('published', '==', true));
  return onSnapshot(productsQuery, (snapshot) => {
    const products = snapshot.docs
      .map(normalizeProduct)
      .sort((a, b) => Number(a.id) - Number(b.id));
    onProducts(products);
  }, onError);
}

window.FirebaseClient = {
  firebaseApp,
  auth,
  db,
  signInWithGoogle,
  signInWithEmail,
  subscribePublishedProducts,
  resetPassword,
  signOut,
  createContributionGroup,
  joinContributionGroup,
  joinPublicGroup,
  getMemberGroups,
  subscribeMemberGroups,
  subscribePublicGroups,
  getGroupDetails,
  subscribeGroupMessages,
  declareContribution,
  getGroupMessages,
  sendGroupMessage
};
window.dispatchEvent(new Event('firebase-ready'));
