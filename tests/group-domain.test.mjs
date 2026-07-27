import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import GroupDomain from '../js/group-domain.js';

test('le nom officiel est utilisé dans les fichiers publics', () => {
  const files = ['index.html', 'js/app.js', 'js/products.js', 'admin/index.html', 'README.md'];
  for (const file of files) {
    const content = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.equal(/luciole[ _-]?indian[ _-]?hair/i.test(content), false, file);
  }
  assert.match(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /Luciole India Hair/);
});

test('seuls les paiements confirmés comptent', () => {
  const contributions = [{ status: 'declared', amount: 10000 }, { status: 'confirmed', amount: 25000 }];
  assert.equal(GroupDomain.sumConfirmed(contributions), 25000);
});

test('une confirmation enregistre le paiement et une référence ne peut pas être réutilisée', () => {
  const existing = [{ id: 'one', status: 'confirmed', amount: 20000, reference: 'OM-1' }];
  const actor = { id: 'admin', role: 'general_admin' };
  const confirmed = GroupDomain.confirmContribution({
    contributions: existing,
    contribution: { id: 'two', userId: 'member', status: 'declared', amount: 10000, reference: 'OM-2' },
    targetAmount: 40000,
    actor
  });
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(confirmed.verifiedBy, 'admin');
  assert.throws(() => GroupDomain.confirmContribution({
    contributions: existing,
    contribution: { id: 'three', userId: 'member', status: 'declared', amount: 10000, reference: 'OM-1' },
    targetAmount: 40000,
    actor
  }));
});

test('un administrateur de groupe ne peut pas confirmer et le plafond est respecté', () => {
  const draft = { id: 'one', userId: 'member', status: 'declared', amount: 30000, reference: 'OM-3' };
  assert.throws(() => GroupDomain.confirmContribution({
    contributions: [], contribution: draft, targetAmount: 30000, actor: { id: 'owner', role: 'group_admin' }
  }));
  assert.throws(() => GroupDomain.assertContributionAmount(30001, 30000));
});

test('les messages et fichiers privés restent réservés aux membres acceptés', () => {
  assert.equal(GroupDomain.canReadMessages({ status: 'pending' }), false);
  assert.equal(GroupDomain.isPrivateFileAccessAllowed({ status: 'removed' }), false);
  assert.equal(GroupDomain.canSendMessage({ status: 'accepted' }), true);
  assert.equal(GroupDomain.canEditMessage({ authorId: 'a', createdAt: new Date().toISOString() }, 'a'), true);
  assert.equal(GroupDomain.canEditMessage({ authorId: 'a', createdAt: new Date().toISOString() }, 'b'), false);
});

test('une seule commande est créée quand l’objectif est atteint', () => {
  const group = { id: 'group-1', productId: 1, variantId: '16', beneficiaryId: 'member', targetAmount: 20000 };
  const contributions = [{ status: 'confirmed', amount: 20000 }];
  assert.equal(GroupDomain.createOrderWhenFunded({ group, contributions, stockAvailable: true }).status, 'awaiting_address');
  assert.throws(() => GroupDomain.createOrderWhenFunded({ group, contributions, stockAvailable: true, existingOrder: { id: 'order-1' } }));
});
