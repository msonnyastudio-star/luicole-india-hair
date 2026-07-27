# Luciole India Hair – Boutique E-commerce

Site e-commerce professionnel, moderne et responsive pour la vente de greffes capillaires, mèches, extensions et perruques au Cameroun.

## Fonctionnalités

- Catalogue complet de produits (greffes indiennes, brésiliennes, péruviennes, malaisiennes, vietnamiennes, perruques, closures, frontals, mèches colorées…)
- Filtres par type, texture, couleur, longueur et prix
- Recherche de produits
- Panier fonctionnel (stocké dans le navigateur)
- Commande complète via WhatsApp avec message prérempli (produit, longueur, quantité, prix, total, référence)
- Bouton WhatsApp flottant + bouton Facebook flottant
- Lien vers la page Facebook officielle
- Section promotions, livraison nationale, à propos, témoignages, FAQ
- Interface d’administration (mot de passe : `luciole2024`)
- Design luxueux (noir, doré, blanc, beige, rose poudré)
- Entièrement responsive (mobile, tablette, desktop)
- Optimisé SEO pour les mots-clés camerounais

## Structure

```
luciole-india-hair/
├── index.html          # Page principale
├── css/styles.css      # Styles
├── js/
│   ├── products.js     # Données produits
│   └── app.js          # Logique applicative
├── db/migrations/       # Schéma PostgreSQL des groupes et paiements
├── tests/               # Tests Node des règles métier
└── .env.example         # Variables à renseigner côté serveur
├── images/             # Images générées
├── admin/
│   └── index.html      # Interface d’administration
└── README.md
```

## WhatsApp

Numéro : **+237 654 470 561**

Tous les boutons de commande et de contact redirigent vers WhatsApp avec un message prérempli.

## Achats avec un groupe de confiance

La page propose désormais un espace responsive pour créer un groupe privé ou découvrable, déclarer une cotisation et échanger dans une discussion réservée aux membres. Le prix du produit est figé dans le groupe au moment de sa création.

Firebase Authentication est configuré pour Google et e-mail/mot de passe. Les groupes, messages texte et déclarations sont enregistrés dans Cloud Firestore afin de rester dans l’offre Firebase gratuite. Les coordonnées Orange Money, les preuves photo, les confirmations de paiement et les URLs de fichiers privés ne sont pas inclus dans cette version gratuite.

### Mise en production

1. Copier `.env.example` vers l’environnement du serveur et renseigner les secrets hors du dépôt.
2. Exécuter [001_contribution_groups.sql](db/migrations/001_contribution_groups.sql) sur PostgreSQL.
3. Activer Google et E-mail/mot de passe dans Firebase Authentication, puis ajouter `luciole-serves.online` et `www.luciole-serves.online` dans les domaines autorisés.
4. Créer une seule base Cloud Firestore en mode Production puis déployer [firestore.rules](firestore.rules) avec Firebase CLI.
5. Ne pas activer Phone Auth, Cloud Storage ni Cloud Functions si vous souhaitez rester sur le plan gratuit Spark.

Pour déployer les règles sans changer l’hébergement Netlify :

```bash
npx firebase-tools deploy --only firestore:rules --project luciole-india-hair-2911c
```

### Vérifier une cotisation manuellement

1. Le membre accepté effectue d’abord le transfert dans Orange Money après avoir vérifié le nom du compte affiché par l’application serveur.
2. Il déclare ensuite son montant, son numéro expéditeur, sa référence et l’heure approximative.
3. La déclaration reste à l’état `declared` et n’augmente pas le total.
4. Un administrateur général ou un gestionnaire de paiement appelle la validation serveur. La transaction refuse une auto-validation, une référence déjà confirmée et tout dépassement du montant restant.

### Tester la messagerie

Dans l’interface locale, connectez-vous via l’un des trois parcours de démonstration, créez un groupe puis ouvrez « Discussion ». En production, l’API doit appliquer le statut `accepted` avant toute lecture, écriture ou URL de fichier privé.

### Tests

Exécuter :

```bash
node --test tests/group-domain.test.mjs
```

Les tests couvrent notamment le nom de marque, les totaux confirmés, les doublons de référence, les rôles de paiement, l’accès aux messages/fichiers privés et l’unicité de commande.

## Administration

1. Accéder à `/admin/`
2. Mot de passe : `luciole2024`
3. Ajouter, modifier ou supprimer des produits
4. Les modifications sont sauvegardées dans le localStorage du navigateur

## Déploiement

Hébergez simplement le dossier sur n’importe quel hébergeur statique (Netlify, Vercel, GitHub Pages, cPanel, etc.).

Pour la production :
- Activez le HTTPS (certificat SSL)
- Remplacez les images par des photos professionnelles réelles si besoin
- Personnalisez les produits dans `js/products.js` ou via l’admin

## Contact

- WhatsApp : +237 654 470 561
- E-mail livraison : livraison@luciole-serves.online
- E-mail support : support@luciole-serves.online
- Facebook : https://www.facebook.com/share/1E95womsYN/?mibextid=wwXIfr
- TikTok : https://www.tiktok.com/@luciole_india_hair
