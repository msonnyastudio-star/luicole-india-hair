/* Shared rules for contribution groups.
 * The browser uses these rules for feedback; the same rules must be enforced
 * transactionally by the API before production use.
 */
const GroupDomain = (() => {
  const ACCEPTED_MEMBER_STATUS = 'accepted';
  const CONFIRMED_PAYMENT_STATUS = 'confirmed';

  function sumConfirmed(contributions = []) {
    return contributions
      .filter((item) => item.status === CONFIRMED_PAYMENT_STATUS)
      .reduce((total, item) => total + Number(item.amount || 0), 0);
  }

  function getRemaining(targetAmount, contributions = []) {
    return Math.max(0, Number(targetAmount) - sumConfirmed(contributions));
  }

  function assertContributionAmount(amount, remainingAmount) {
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      throw new Error('Le montant doit être supérieur à zéro.');
    }
    if (parsedAmount > Number(remainingAmount)) {
      throw new Error('Le montant ne peut pas dépasser le reste à collecter.');
    }
    return parsedAmount;
  }

  function canReadMessages(member) {
    return Boolean(member && member.status === ACCEPTED_MEMBER_STATUS);
  }

  function canSendMessage(member) {
    return canReadMessages(member) && !member.writeRestrictedUntil;
  }

  function canEditMessage(message, userId, now = new Date()) {
    if (!message || message.authorId !== userId || message.deletedAt) return false;
    const fifteenMinutes = 15 * 60 * 1000;
    return new Date(now).getTime() - new Date(message.createdAt).getTime() <= fifteenMinutes;
  }

  function isPrivateFileAccessAllowed(member) {
    return canReadMessages(member);
  }

  function confirmContribution({ contributions = [], contribution, targetAmount, actor }) {
    if (!actor || actor.role !== 'general_admin') {
      throw new Error('Seul un administrateur général peut confirmer un paiement.');
    }
    if (!contribution || contribution.status === CONFIRMED_PAYMENT_STATUS) {
      throw new Error('Cette cotisation est déjà confirmée ou invalide.');
    }
    if (contribution.userId === actor.id) {
      throw new Error('Un administrateur ne peut pas confirmer son propre paiement.');
    }
    const duplicatedReference = contributions.some((item) =>
      item.id !== contribution.id &&
      item.status === CONFIRMED_PAYMENT_STATUS &&
      item.reference === contribution.reference
    );
    if (duplicatedReference) {
      throw new Error('Cette référence Orange Money a déjà été confirmée.');
    }

    assertContributionAmount(contribution.amount, getRemaining(targetAmount, contributions));
    return {
      ...contribution,
      status: CONFIRMED_PAYMENT_STATUS,
      verifiedBy: actor.id,
      verifiedAt: new Date().toISOString()
    };
  }

  function createOrderWhenFunded({ group, contributions = [], stockAvailable, existingOrder }) {
    if (existingOrder) throw new Error('Une commande existe déjà pour ce groupe.');
    if (!stockAvailable) throw new Error('Le produit est indisponible : intervention administrative requise.');
    if (getRemaining(group.targetAmount, contributions) > 0) {
      throw new Error('L’objectif n’est pas encore atteint.');
    }
    return {
      groupId: group.id,
      productId: group.productId,
      variantId: group.variantId,
      beneficiaryId: group.beneficiaryId,
      status: 'awaiting_address'
    };
  }

  return Object.freeze({
    ACCEPTED_MEMBER_STATUS,
    CONFIRMED_PAYMENT_STATUS,
    sumConfirmed,
    getRemaining,
    assertContributionAmount,
    canReadMessages,
    canSendMessage,
    canEditMessage,
    isPrivateFileAccessAllowed,
    confirmContribution,
    createOrderWhenFunded
  });
})();

if (typeof window !== 'undefined') window.GroupDomain = GroupDomain;
if (typeof module !== 'undefined') module.exports = GroupDomain;
