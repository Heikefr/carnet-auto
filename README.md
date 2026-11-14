# Carnet auto

Application de suivi de voiture (pleins, entretien, coût réel au km), installable sur iPhone et utilisable hors connexion.

**Version 1.1** — https://heikefr.github.io/carnet-auto/

- Aucune donnée personnelle dans ce dépôt : les données restent sur le téléphone.
- Sauvegarde / restauration : Réglages › Sauvegarde (fichier `.json`).
- Export Excel / Google Sheets : Réglages › Export (fichiers `.csv`).

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Structure de la page (les écrans, le dock, les icônes) |
| `style.css` | Apparence : couleurs clair / sombre, mise en page, animations |
| `app.js` | Comportement : données, calculs, affichage, formulaires, sauvegarde |
| `sw.js` | Fonctionnement hors connexion |
| `manifest.webmanifest`, `icon-*.png` | Installation sur l'écran d'accueil |

Chaque fichier commence par un sommaire et est commenté section par section.

## Publier une nouvelle version

1. Modifier les fichiers, puis changer `VERSION` et ajouter une entrée à `CHANGELOG` dans `app.js`.
2. Changer le nom du cache (`CACHE`) dans `sw.js` : c'est ce qui déclenche la mise à jour sur le téléphone.
3. Sur l'iPhone, fermer puis rouvrir l'appli deux fois. Les données sont conservées.

Numérotation : `1.0.x` pour une correction, `1.x` pour une nouveauté.
