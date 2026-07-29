import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('le catalogue public est abonné à la collection products en temps réel', () => {
  const firebase = read('js/firebase-client.js');
  const app = read('js/app.js');
  assert.match(firebase, /onSnapshot\(productsQuery/);
  assert.match(firebase, /collection\(db, 'products'\)/);
  assert.match(app, /subscribePublishedProducts/);
  assert.match(app, /reconcileCartWithCatalog/);
  assert.doesNotMatch(app, /fetchPriceOverrides/);
});

test('les prix et variantes admin sont enregistrés dans le document produit Firestore', () => {
  const admin = read('js/admin.js');
  assert.match(admin, /setDoc\(doc\(db, 'products'/);
  assert.match(admin, /lengths: product\.lengths\.map/);
  assert.match(admin, /onSnapshot\(collection\(db, 'products'\)/);
  assert.match(read('admin/index.html'), /Se connecter avec Google/);
  assert.doesNotMatch(read('admin/index.html'), /luciole2024/);
});

test('les groupes sont absents de l’accueil et disposent d’une page principale', () => {
  const home = read('index.html');
  const groups = read('groupes.html');
  assert.doesNotMatch(home, /<section class="groups" id="groupes">/);
  assert.match(home, /href="groupes\.html"/);
  assert.match(groups, /data-group-tab="public"/);
  assert.match(groups, /data-group-tab="private"/);
  assert.match(groups, /Payez votre greffe doucement, ensemble/);
});

test('les règles protègent les produits et les groupes privés', () => {
  const rules = read('firestore.rules');
  assert.match(rules, /match \/products\/\{productId\}/);
  assert.match(rules, /allow create, update, delete: if isGeneralAdmin\(\)/);
  assert.match(rules, /request\.resource\.data\.inviteCode is string/);
  assert.match(rules, /resource\.data\.privacy in \['public', 'discoverable'\]/);
});

test('les cotisations utilisent les comptes officiels et une preuve privée supprimable', () => {
  const groups = read('js/groups-ui.js');
  const firebase = read('js/firebase-client.js');
  const admin = read('js/admin.js');
  const rules = read('firestore.rules');
  assert.match(groups, /\+237657946480/);
  assert.match(groups, /Assom Nang Galine/);
  assert.match(groups, /\+237654884788/);
  assert.match(groups, /Tchapga Gaetan/);
  assert.match(groups, /name="proof" type="file"/);
  assert.match(groups, /compressPaymentProof/);
  assert.match(firebase, /doc\(db, 'paymentProofs'/);
  assert.match(admin, /runTransaction/);
  assert.match(admin, /paymentReferences/);
  assert.match(admin, /purgeGroupProofs/);
  assert.match(rules, /match \/paymentProofs\/\{proofId\}/);
  assert.match(rules, /data\.status == 'funding'/);
  assert.match(rules, /allow read, update, delete: if isGeneralAdmin\(\)/);
});
