// Luciole India Hair - catalogue visuel
const CATALOG_VERSION = '2026-07-28-catalogue-v4';

const CARE_BY_TEXTURE = {
  lisse: "Lavez délicatement avec un shampooing doux, hydratez les longueurs et protégez les cheveux avant toute source de chaleur.",
  ondulé: "Démêlez des pointes vers les racines, hydratez légèrement et utilisez un peigne à dents larges pour préserver le mouvement.",
  bouclé: "Humidifiez avant de démêler, appliquez un soin hydratant et ne brossez pas les boucles à sec afin de conserver leur définition."
};

function catalogueProduct({ id, name, texture, color, lengths, photo, description, badge = 'nouveau', category = 'Perruques lace frontal' }) {
  const isLaceStyle = /lace/i.test(category) || /^Lace/i.test(name);
  const normalizedLengths = lengths.map((length) => Number(length));
  const pricedLengths = normalizedLengths.map((length) => ({
    length: `${length} pouces`,
    price: estimateCameroonPrice(length, texture, isLaceStyle)
  }));
  const referencePrice = Math.min(...pricedLengths.map((variant) => variant.price));
  const density = texture === 'bouclé' ? '180% à 200%' : texture === 'ondulé' ? '180%' : '150% à 180%';
  const capDetail = isLaceStyle ? 'Lace HD 13x4 (ou 5x5 selon stock)' : 'Bonnet machine sans lace, effet naturel';
  const weight = `${estimateWeightRange(normalizedLengths[0], normalizedLengths[normalizedLengths.length - 1], texture)} g`;
  const hairGrade = 'Cheveux humains Remy grade 10A';
  return {
    id,
    name,
    type: 'perruque',
    texture,
    color,
    category,
    lengths: pricedLengths,
    density,
    weight,
    description: `${description} ${hairGrade}. ${capDetail}. Pré-épilée, baby hair personnalisables, pose facile et entretien conseillé par notre équipe.`,
    care: CARE_BY_TEXTURE[texture],
    delivery: 'Livraison 24h à 72h (Douala/Yaoundé), 2 à 5 jours pour les autres villes',
    availability: 'En stock limité selon longueur — prix admin modifiable',
    badge,
    referencePrice,
    images: [photo],
    promo: false,
    promoPrice: null
  };
}

function roundToNearest500(value) {
  return Math.round(value / 500) * 500;
}

function estimateCameroonPrice(length, texture, isLaceStyle) {
  const numericLength = Number(length) || 0;
  const pricePerInch = {
    lisse: 3200,
    ondulé: 3600,
    bouclé: 3900
  };
  const textureBase = {
    lisse: 12000,
    ondulé: 14500,
    bouclé: 16500
  };
  const laceSurcharge = isLaceStyle ? 11000 : 3500;
  const longLengthSurcharge = numericLength >= 26 ? 7000 : numericLength >= 22 ? 4000 : 0;
  const rawPrice = ((pricePerInch[texture] || 3200) * numericLength) + (textureBase[texture] || 12000) + laceSurcharge + longLengthSurcharge;
  return Math.max(28000, roundToNearest500(rawPrice));
}

function estimateWeightRange(minLength, maxLength, texture) {
  const base = texture === 'bouclé' ? 165 : texture === 'ondulé' ? 150 : 135;
  const spread = Math.max(1, Number(maxLength) - Number(minLength));
  return `${base + (spread * 4)}-${base + (spread * 6)}`;
}

const PRODUCTS = [
  catalogueProduct({ id: 1, name: 'Lace Afro Volume Bordeaux', texture: 'bouclé', color: 'bordeaux', lengths: [12, 14, 16, 18], photo: 'images/catalogue/modele-1.jpg', description: 'Modèle afro très volumineux, avec des boucles serrées et une couleur bordeaux profonde. Un choix affirmé pour un look riche en volume.' }),
  catalogueProduct({ id: 2, name: 'Lace Lisse Ultra Longue Noire', texture: 'lisse', color: 'noir naturel', lengths: [22, 24, 26, 28, 30], photo: 'images/catalogue/modele-2.jpg', description: 'Modèle lisse très long à raie centrale, au tombé droit et élégant. Idéal pour une finition sobre, nette et sophistiquée.' }),
  catalogueProduct({ id: 3, name: 'Bob Lisse Bandeau Noir', texture: 'lisse', color: 'noir naturel', lengths: [8, 10, 12], photo: 'images/catalogue/modele-3.jpg', description: 'Coupe bob courte et lisse, portée ici avec un bandeau. Une option pratique et moderne pour un style quotidien.' , category: 'Cheveux courts'}),
  catalogueProduct({ id: 4, name: 'Lace Lisse Extra Longue Noire', texture: 'lisse', color: 'noir naturel', lengths: [24, 26, 28, 30], photo: 'images/catalogue/modele-4.jpg', description: 'Lace lisse extra longue à raie centrale. La longueur et la brillance visuelle créent une allure très glamour.' }),
  catalogueProduct({ id: 5, name: 'Bob Lisse Raie Centrale', texture: 'lisse', color: 'noir naturel', lengths: [10, 12, 14], photo: 'images/catalogue/modele-5.jpg', description: 'Bob droit à raie centrale, avec une ligne de coupe nette au niveau des épaules. Adapté à un look chic et facile à porter.', category: 'Cheveux courts' }),
  catalogueProduct({ id: 6, name: 'Lace Lisse Bordeaux', texture: 'lisse', color: 'bordeaux', lengths: [16, 18, 20], photo: 'images/catalogue/modele-6.jpg', description: 'Modèle lisse bordeaux, de longueur moyenne, avec une raie centrale. Sa teinte chaleureuse met en valeur les looks colorés.' }),
  catalogueProduct({ id: 7, name: 'Lace Deep Wave Noire', texture: 'bouclé', color: 'noir naturel', lengths: [20, 22, 24, 26, 28], photo: 'images/catalogue/modele-7.jpg', description: 'Longue lace à ondulations profondes et régulières. Le relief des vagues apporte un volume structuré et une finition glamour.' }),
  catalogueProduct({ id: 8, name: 'Lace Boucles Définies Noire', texture: 'bouclé', color: 'noir naturel', lengths: [20, 22, 24, 26], photo: 'images/catalogue/modele-8.jpg', description: 'Lace longue à petites boucles très définies. Un modèle généreux pour une silhouette pleine de mouvement.' }),
  catalogueProduct({ id: 9, name: 'Bob Bouclé Volume', texture: 'bouclé', color: 'brun ou noir', lengths: [10, 12, 14], photo: 'images/catalogue/modele-9.jpg', description: 'Bob bouclé disponible dans un rendu brun ou noir selon le modèle. Les boucles souples donnent du volume sans longueur excessive.', category: 'Cheveux courts' }),
  catalogueProduct({ id: 10, name: 'Lace Boucles Miel', texture: 'bouclé', color: 'brun miel', lengths: [18, 20, 22, 24], photo: 'images/catalogue/modele-10.jpg', description: 'Boucles longues en brun miel lumineux. Ce modèle associe une texture dense à une couleur chaude et visible.' }),
  catalogueProduct({ id: 11, name: 'Lace Ondulée Auburn', texture: 'ondulé', color: 'auburn', lengths: [18, 20, 22, 24], photo: 'images/catalogue/modele-11.jpg', description: 'Lace ondulée auburn avec de larges vagues souples. Une option élégante pour celles qui aiment les nuances cuivrées.' }),
  catalogueProduct({ id: 12, name: 'Lace Bouclée Bordeaux', texture: 'bouclé', color: 'bordeaux', lengths: [18, 20, 22, 24], photo: 'images/catalogue/modele-12.jpg', description: 'Lace bordeaux aux boucles marquées et à la masse généreuse. Convient à un look coloré et très volumineux.' }),
  catalogueProduct({ id: 13, name: 'Bob Ondulé Chocolat', texture: 'ondulé', color: 'brun chocolat', lengths: [8, 10, 12], photo: 'images/catalogue/modele-13.jpg', description: 'Bob court brun chocolat, coiffé avec de douces ondulations et une raie de côté. Finition raffinée pour une coupe courte.', category: 'Cheveux courts' }),
  catalogueProduct({ id: 14, name: 'Bob Lisse Noir Naturel', texture: 'lisse', color: 'noir naturel', lengths: [10, 12, 14], photo: 'images/catalogue/modele-14.jpg', description: 'Bob lisse noir à raie centrale, avec une coupe droite et épurée. Un classique polyvalent pour le bureau comme les sorties.', category: 'Cheveux courts' }),
  catalogueProduct({ id: 15, name: 'Lace Glamour Boucles Noires', texture: 'ondulé', color: 'noir naturel', lengths: [18, 20, 22, 24], photo: 'images/catalogue/modele-15.jpg', description: 'Longues boucles souples et brillantes pour un rendu glamour. Le volume est concentré sur les longueurs et les pointes.' }),
  catalogueProduct({ id: 16, name: 'Lace Ondulée Chocolat', texture: 'ondulé', color: 'brun chocolat', lengths: [20, 22, 24, 26], photo: 'images/catalogue/modele-16.jpg', description: 'Lace longue brun chocolat, avec des ondulations naturelles et une raie latérale. Elle apporte du mouvement tout en restant élégante.' }),
  catalogueProduct({ id: 17, name: 'Lace Body Wave Chocolat', texture: 'ondulé', color: 'brun chocolat', lengths: [18, 20, 22, 24], photo: 'images/catalogue/modele-17.jpg', description: 'Modèle body wave brun chocolat aux vagues larges et rebondies. Parfait si vous recherchez un volume chic et maîtrisé.' }),
  catalogueProduct({ id: 18, name: 'Coupe Courte Twist Bordeaux', texture: 'bouclé', color: 'bordeaux', lengths: [6, 8, 10], photo: 'images/catalogue/modele-18.jpg', description: 'Style court bordeaux à effet twist serré. Une coupe expressive, légère et facile à mettre en valeur.', category: 'Cheveux courts' }),
  catalogueProduct({ id: 19, name: 'Body Wave Chocolat Longue', texture: 'ondulé', color: 'brun chocolat', lengths: [24, 26, 28, 30], photo: 'images/catalogue/modele-19-recadre.webp', description: 'Très longue body wave couleur chocolat, avec une frange latérale et des boucles souples sur les longueurs. Une silhouette ultra féminine.' }),
  catalogueProduct({ id: 20, name: 'Lace Side Bang Body Wave', texture: 'ondulé', color: 'noir naturel', lengths: [20, 22, 24, 26], photo: 'images/catalogue/modele-21.jpg', description: 'Lace noire body wave avec frange latérale et mèches souples autour du visage. Le modèle combine élégance et mouvement.' }),
  catalogueProduct({ id: 21, name: 'Lace Kinky Curly Naturelle', texture: 'bouclé', color: 'noir naturel', lengths: [20, 22, 24, 26, 28], photo: 'images/catalogue/modele-23.jpg', description: 'Texture kinky curly longue, dense et naturelle. Les petites boucles donnent beaucoup de volume tout en gardant un effet authentique.' }),
  catalogueProduct({ id: 22, name: 'Lace Lisse Bordeaux Longue', texture: 'lisse', color: 'bordeaux', lengths: [18, 20, 22, 24], photo: 'images/catalogue/modele-25.jpg', description: 'Lace bordeaux lisse à longueur généreuse et raie centrale. Le rendu est droit, fluide et coloré.' }),
  catalogueProduct({ id: 23, name: 'Bob Lisse Bandeau Carré', texture: 'lisse', color: 'noir naturel', lengths: [8, 10, 12], photo: 'images/catalogue/modele-28.jpg', description: 'Bob carré noir à porter avec bandeau. Une coupe courte structurée, idéale pour un style minimaliste et pratique.', category: 'Cheveux courts' }),
  catalogueProduct({ id: 24, name: 'Bob Bouclé à Frange', texture: 'bouclé', color: 'noir naturel', lengths: [10, 12, 14], photo: 'images/catalogue/modele-29.jpg', description: 'Bob bouclé avec frange pleine. Les boucles compactes encadrent le visage et offrent un volume équilibré.', category: 'Cheveux courts' }),
  catalogueProduct({ id: 25, name: 'Lace Lisse Miel Très Longue', texture: 'lisse', color: 'miel doré', lengths: [24, 26, 28, 30], photo: 'images/catalogue/modele-30.jpg', description: 'Lace lisse très longue en teinte miel doré. Un modèle lumineux pour une transformation remarquée.' }),
  catalogueProduct({ id: 26, name: 'Bob Court Souple Noir', texture: 'ondulé', color: 'noir naturel', lengths: [8, 10, 12], photo: 'images/catalogue/modele-31.jpg', description: 'Bob court noir avec une souplesse légère et une raie latérale. Une coupe facile à styliser au quotidien.', category: 'Cheveux courts' }),
  catalogueProduct({ id: 27, name: 'Lace Afro Kinky Bouclée', texture: 'bouclé', color: 'noir naturel', lengths: [18, 20, 22, 24], photo: 'images/catalogue/modele-32.jpg', description: 'Lace afro kinky aux boucles serrées et au volume riche. Le modèle met à l’honneur une texture naturellement expressive.' }),
  catalogueProduct({ id: 28, name: 'Bob Glamour Boucles Chocolat', texture: 'ondulé', color: 'brun chocolat', lengths: [8, 10, 12], photo: 'images/catalogue/modele-33.jpg', description: 'Bob brun chocolat, travaillé en boucles glamour et en raie de côté. Une coupe courte élégante pour les occasions comme le quotidien.', category: 'Cheveux courts' }),
  catalogueProduct({ id: 29, name: 'Lace Body Wave Noire', texture: 'ondulé', color: 'noir naturel', lengths: [18, 20, 22], photo: 'images/catalogue/modele-36.jpg', description: 'Lace noire body wave avec de larges vagues régulières. Le modèle est présenté de face et de dos afin de montrer son mouvement.' }),
  catalogueProduct({ id: 30, name: 'Lace Afro Volume Chocolat', texture: 'bouclé', color: 'brun chocolat', lengths: [16, 18, 20, 22, 24], photo: 'images/catalogue/modele-38.jpg', description: 'Lace afro chocolat au volume maximal. Sa texture dense crée un rendu spectaculaire pour les amatrices de looks très fournis.' }),
  catalogueProduct({ id: 31, name: 'Lace Lisse Chocolat Naturelle', texture: 'lisse', color: 'brun chocolat', lengths: [18, 20, 22, 24, 26], photo: 'images/catalogue/modele-22-floute.webp', description: 'Lace lisse brun chocolat, présentée de face et de dos pour montrer le tombé droit des longueurs.' }),
  catalogueProduct({ id: 32, name: 'Lace Lisse à Frange', texture: 'lisse', color: 'brun foncé', lengths: [16, 18, 20, 22], photo: 'images/catalogue/modele-24-floute.webp', description: 'Modèle lisse à frange droite, avec une raie centrale. Une coupe graphique pour un style élégant et affirmé.' }),
  catalogueProduct({ id: 33, name: 'Lace Kinky Curly Noire Longue', texture: 'bouclé', color: 'noir naturel', lengths: [20, 22, 24, 26, 28], photo: 'images/catalogue/modele-26-floute.webp', description: 'Lace noire à texture kinky curly dense. Les boucles fines et serrées donnent une silhouette longue et volumineuse.' }),
  catalogueProduct({ id: 34, name: 'Bob Lisse Gris Argent', texture: 'lisse', color: 'gris argent', lengths: [8, 10, 12], photo: 'images/catalogue/modele-27-floute.webp', description: 'Bob lisse gris argent, coupé au niveau du menton. Une couleur originale pour une coupe courte moderne.', category: 'Cheveux courts' }),
  catalogueProduct({ id: 35, name: 'Collection Laces Bouclées Colorées', texture: 'bouclé', color: 'noir, brun et miel', lengths: [18, 20, 22, 24], photo: 'images/catalogue/modele-34-floute.webp', description: 'Sélection de laces bouclées disponibles dans plusieurs teintes visibles sur la photo : noir, brun et miel. Indiquez votre couleur préférée lors de la demande.' }),
  catalogueProduct({ id: 36, name: 'Lace Kinky Curly Noire', texture: 'bouclé', color: 'noir naturel', lengths: [20, 22, 24, 26], photo: 'images/catalogue/modele-35-floute.webp', description: 'Longue lace noire kinky curly, avec des boucles souples et une finition latérale naturelle.' }),
  catalogueProduct({ id: 37, name: 'Lace Body Wave Glamour Noire', texture: 'ondulé', color: 'noir naturel', lengths: [16, 18, 20, 22], photo: 'images/catalogue/modele-37-recadre.webp', description: 'Lace noire body wave aux boucles larges et polies. Sa longueur moyenne est idéale pour un look glamour structuré.' })
];

const CATEGORIES = [
  { id: 'lace', name: 'Perruques lace', desc: 'Modèles à raie et finition lace', image: 'images/catalogue/modele-2.jpg' },
  { id: 'lisse', name: 'Cheveux lisses', desc: 'Tombé droit et finition nette', image: 'images/catalogue/modele-4.jpg' },
  { id: 'ondulé', name: 'Cheveux ondulés', desc: 'Body wave et vagues souples', image: 'images/catalogue/modele-17.jpg' },
  { id: 'bouclé', name: 'Cheveux bouclés', desc: 'Boucles définies et volume', image: 'images/catalogue/modele-8.jpg' },
  { id: 'court', name: 'Coupes courtes', desc: 'Bobs, franges et styles courts', image: 'images/catalogue/modele-14.jpg' },
  { id: 'long', name: 'Grandes longueurs', desc: 'Modèles 20 pouces et plus', image: 'images/catalogue/modele-25.jpg' }
];

const TESTIMONIALS = [
  { name: 'Aïcha', city: 'Douala', rating: 5, text: 'Très beau choix de modèles et une équipe disponible pour conseiller la longueur.' },
  { name: 'Marie', city: 'Yaoundé', rating: 5, text: 'La commande sur WhatsApp est simple et le suivi est rassurant.' },
  { name: 'Fatou', city: 'Bafoussam', rating: 5, text: 'J’ai trouvé un modèle bouclé qui correspondait exactement à mon style.' }
];

const FAQ = [
  { q: 'Comment commander un modèle ?', a: 'Ouvrez le modèle qui vous plaît, choisissez la taille souhaitée puis contactez-nous sur WhatsApp. Nous confirmons la disponibilité, le prix et la livraison avant toute validation.' },
  { q: 'Comment sont fixés les prix affichés ?', a: 'Les prix affichés sont basés sur les tendances du marché camerounais selon la texture, la longueur et la finition (lace ou sans lace). L’administration peut les ajuster à tout moment selon le stock réel.' },
  { q: 'Comment choisir la longueur ?', a: 'Les longueurs sont indiquées en pouces. Un bob est généralement compris entre 8 et 14 pouces ; les modèles longs commencent souvent à 18 pouces. Contactez-nous pour un conseil adapté à votre look.' },
  { q: 'Puis-je demander une autre couleur ou une autre taille ?', a: 'Oui. Envoyez-nous le nom ou la référence du modèle par WhatsApp et indiquez la couleur et la taille souhaitées. Nous vous confirmerons les possibilités.' },
  { q: 'Livrez-vous au Cameroun ?', a: 'Oui, la disponibilité et le délai de livraison sont confirmés sur WhatsApp selon votre ville.' }
];

const FAQ_EN = [
  { q: 'How do I order a style?', a: 'Open the style you like, choose the desired length and contact us on WhatsApp. We confirm availability, price and delivery before validation.' },
  { q: 'How are displayed prices set?', a: 'Displayed prices are based on Cameroon market trends by texture, length and finish (lace or non-lace). The admin can update them anytime according to actual stock.' },
  { q: 'How do I choose a length?', a: 'Lengths are shown in inches. Bobs are commonly 8–14 inches, while long styles commonly begin at 18 inches.' },
  { q: 'Can I request another colour or size?', a: 'Yes. Send us the product name or reference on WhatsApp and tell us the colour and size you need.' },
  { q: 'Do you deliver in Cameroon?', a: 'Yes. Availability and delivery time are confirmed on WhatsApp according to your city.' }
];

// Explicit exports for the ES-module Firebase/admin scripts. The catalogue in
// this file is only the first-install/fallback seed; Firestore is the live
// source once the administrator has published the products.
window.LUCIOLE_SEED_PRODUCTS = PRODUCTS;
window.LUCIOLE_CATALOG_VERSION = CATALOG_VERSION;
