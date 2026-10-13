# Inventaire — Rentrée scolaire (CDC Mékinac)

Outil pour compter le matériel scolaire, pensé pour le cellulaire.
Il fonctionne **sans connexion internet** : les données restent sur l'appareil.

## Fonctions

- Boutons **+1 / +5 / +10** sur chaque article. L'interrupteur **Ajouter / Retirer** les change en −1 / −5 / −10.
- Toucher le **nombre** d'un article permet d'entrer la quantité exacte.
- Toucher le **nom** d'un article permet de le modifier ou de le supprimer.
- Chaque article a un **n° de la feuille**, un nom, une catégorie, une quantité, un **prix de vente**, une **quantité visée** (facultative) et une note.
- **Liste de la feuille** : les 106 articles de la feuille papier (6 catégories, en bandes grises comme sur la feuille) sont chargés automatiquement au premier lancement, avec une quantité de 0. Le menu permet de les rajouter plus tard sans créer de doublons. La liste est dans `liste-depart.js`.
- Dans l'appli et dans le PDF, les articles suivent l'ordre de la feuille (catégorie, puis numéro). Chercher un numéro (ex. `57`) trouve l'article correspondant.
- **Recherche** (les accents ne comptent pas), **catégories**, filtres (en stock, en rupture, sous la quantité visée, sans prix) et tri.
- Un bouton **Annuler** apparaît après chaque changement.
- **PDF** : liste propre, groupée par catégorie, prête à imprimer ou à envoyer (menu ☰).
- **Exporter / Importer** : sauvegarde complète en `.json`, ou fichier `.csv` pour Excel.

## Ouvrir l'outil sur un cellulaire

Le dossier `inventaire/` est un site statique, sans serveur ni compte.

1. Le publier, par exemple avec GitHub Pages (Settings → Pages → branche `main`, dossier `/root`).
   L'adresse sera `https://<compte>.github.io/<dépôt>/inventaire/`.
2. Ouvrir l'adresse une première fois avec une connexion internet.
3. L'ajouter à l'écran d'accueil :
   - iPhone (Safari) : bouton Partager → « Sur l'écran d'accueil »
   - Android (Chrome) : menu ⋮ → « Ajouter à l'écran d'accueil » ou « Installer l'application »
4. Ensuite, l'outil s'ouvre et fonctionne même sans connexion.

> **Important (iPhone)** : l'icône de l'écran d'accueil et Safari ont chacun leur propre mémoire.
> Choisis une seule façon d'ouvrir l'outil. Pour passer de l'une à l'autre, utilise Exporter puis Importer.

## Sauvegardes

Les données sont gardées dans le navigateur de l'appareil (`localStorage`).
Elles peuvent être perdues si on efface les données du navigateur ou si on change de téléphone.
**Exporte une sauvegarde régulièrement** (menu ☰ → Exporter une sauvegarde) et garde le fichier en lieu sûr.
Le menu indique la date de la dernière sauvegarde.

## Format des fichiers (pour la future version web)

Sauvegarde `.json` :

```json
{
  "format": "cdc-mekinac-inventaire",
  "version": 1,
  "exportedAt": "2026-10-13T16:42:13.995Z",
  "inventory": {
    "name": "Inventaire — Rentrée scolaire",
    "organization": "CDC Mékinac",
    "items": [
      {
        "id": "c4f6c9fc-…",
        "ref": "33",
        "name": "Cahier Canada 32 pages",
        "category": "Cahiers",
        "quantity": 140,
        "price": 0.5,
        "target": 200,
        "note": "4 couleurs",
        "createdAt": "…",
        "updatedAt": "…"
      }
    ]
  }
}
```

`ref` est le numéro de la feuille (texte, peut être vide). `price` et `target` valent `null` quand ils ne sont pas remplis.

Fichier `.csv` (séparateur `;`, virgule décimale) avec ces colonnes :
`N°;Article;Catégorie;Quantité;Prix de vente;Quantité visée;Note`.
Seule la colonne `Article` est obligatoire à l'import.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `index.html` | Page et styles |
| `app.js` | Logique : stockage, liste, filtres, PDF, import/export |
| `liste-depart.js` | Les 106 articles de la feuille (liste de départ) |
| `sw.js` | Cache hors connexion (changer `CACHE_VERSION` à chaque mise à jour) |
| `manifest.webmanifest`, `icons/` | Installation sur l'écran d'accueil |
| `vendor/` | jsPDF 2.5.2 et jsPDF-AutoTable 3.8.4 (licence MIT), inclus pour fonctionner sans connexion |
