# Buse EP — Buses Europlacer

Application iPhone pour reconnaître le numéro (1 à 63) d'une buse Europlacer avec l'appareil photo.
Gratuite : pas d'App Store, pas de compte développeur Apple.

## Le code
- Petit point = départ.
- 7 emplacements tous les 45° en tournant.
- Emplacements 1 à 6 = 1, 2, 4, 8, 16, 32. Numéro = somme des points.
- 7e emplacement = point de contrôle (le nombre de gros points est toujours pair).

## Mise en ligne sur GitHub (une seule fois)
1. Sur github.com : **New repository** → nom `buse-ep` → **Public** → Create.
2. **Add file → Upload files** : glisser tout le contenu du dossier (index.html, app.js, core.js, style.css, sw.js, manifest.webmanifest, dossier icons) → **Commit**.
3. **Settings → Pages** → Source : *Deploy from a branch* → Branch : `main` / `(root)` → **Save**.
4. Attendre 1 à 2 minutes. Adresse : `https://VOTRE-NOM.github.io/buse-ep/`

## Installation sur l'iPhone
1. Ouvrir l'adresse dans **Safari**.
2. Bouton **Partager** → **Sur l'écran d'accueil** → Ajouter.
3. Ouvrir l'icône « Buse EP » → autoriser la caméra.

## Utilisation
- **Scanner** : face ronde bien de face dans le cercle, régler le zoom, appuyer sur **LIRE**.
  **Auto : oui** lit en continu (pratique pour trier beaucoup de buses).
- **Photo** : prendre une photo, puis toucher le centre de la buse.
- **Manuel** : toucher les points vus sur la buse → numéro.
- **Liste** : les 63 codes ; on peut écrire une description pour chaque buse.
- **Réglages** : sens de lecture (normal / inversé), sauvegarde des descriptions.

## Mise à jour
Remplacer les fichiers sur GitHub (Upload files), puis dans `sw.js` changer `buse-ep-v1` en `buse-ep-v2`.
