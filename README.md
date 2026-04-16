# Le Sac des Destins

Application web de table de jeu de rôle en temps réel pour le système **Le Sac des Destins**.

- Tirages synchronisés pour tous les joueurs
- Firebase Firestore (temps réel, gratuit, sans pause)
- GitHub Pages (hébergement statique, gratuit)
- Zéro inscription, zéro serveur, zéro build step

---

## Déploiement en 5 étapes

### 1. Créer un projet Firebase

1. Allez sur [console.firebase.google.com](https://console.firebase.google.com)
2. Cliquez **Ajouter un projet** → donnez un nom → désactivez Analytics (optionnel)
3. Dans le projet, allez dans **Build → Firestore Database**
4. Cliquez **Créer une base de données** → choisissez un emplacement → démarrez en **mode production**
5. Dans **Build → Authentication** → **Commencer** → activez **Anonyme** (le seul fournisseur nécessaire)

### 2. Récupérer vos clés Firebase

1. Dans la console Firebase, cliquez l'icône ⚙ **Paramètres du projet** → **Général**
2. Faites défiler jusqu'à **Vos applications** → cliquez l'icône `</>` (Web)
3. Enregistrez l'application (nom au choix) — vous obtenez un bloc `firebaseConfig`

### 3. Configurer le fichier de clés

Copiez `firebase-config.example.js` en `firebase-config.js` :

```bash
cp firebase-config.example.js firebase-config.js
```

Remplissez avec vos vraies valeurs :

```js
export const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "mon-projet.firebaseapp.com",
  projectId: "mon-projet",
  storageBucket: "mon-projet.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc..."
};
```

> `firebase-config.js` est dans `.gitignore` — vos clés ne seront jamais poussées sur GitHub.

### 4. Configurer les règles Firestore

Dans la console Firebase → **Firestore → Règles**, remplacez le contenu par :

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /rooms/{roomId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Cliquez **Publier**.

### 5. Déployer sur GitHub Pages

1. Poussez le dépôt sur GitHub (sans `firebase-config.js`)
2. Dans les **Settings** du dépôt → **Pages** → Source : **Deploy from a branch** → branche `main` → dossier `/` (root)
3. Attendez 1–2 minutes → votre site est disponible sur `https://<votre-pseudo>.github.io/<nom-du-repo>/`

---

## Architecture des fichiers

```
/
├── index.html              # Page d'accueil / lobby
├── room.html               # Page de session (vue principale)
├── firebase-config.js      # IGNORÉ PAR GIT — clés Firebase réelles
├── firebase-config.example.js  # Versionné — structure sans les clés
├── css/
│   ├── base.css            # Variables, reset, composants partagés
│   ├── lobby.css           # Styles page d'accueil
│   └── room.css            # Styles page de session
├── js/
│   ├── firebase.js         # Initialisation Firebase + auth anonyme
│   ├── bag.js              # Logique du sac (tirage, calculs, états)
│   ├── room.js             # Opérations Firestore (CRUD, transactions)
│   ├── ui-room.js          # Rendu DOM de la page session
│   ├── main-room.js        # Orchestration de la page session
│   └── lobby.js            # Logique page d'accueil
└── assets/
    └── favicon.svg
```

## Fonctionnalités

### Pour tous
- Tirage de jetons synchronisé en temps réel (transaction atomique Firestore)
- Calcul automatique : Succès Critique / Succès / Échec / Échec Critique / Échec Automatique
- Indicateur de tension du sac (probabilité jetons rouges × avancement)
- Indicateur visuel des 5 jetons rouges (tirés / restants)
- Historique des 20 derniers tirages
- État de santé des personnages (PC avec barre de vie colorée)
- Moral de groupe (5 paliers avec effets mécaniques)
- Réputations par faction
- Scène en cours (affichée à tous)
- Référence rapide (tables de résolution, difficultés, modificateurs)
- Présence des connectés en temps réel

### Pour le MJ uniquement
- Sac MJ séparé (invisible aux joueurs)
- Réinitialisation du sac joueurs (avec justification narrative obligatoire)
- Injection de jetons MJ → sac joueurs (max 3 par scène)
- Contrôle du moral de groupe
- Édition de la scène courante
- Gestion des factions

## Stack

| Technologie | Usage | Coût |
|------------|-------|------|
| HTML/CSS/JS vanilla | Frontend | Gratuit |
| Firebase Firestore | Temps réel | Gratuit (tier Spark) |
| Firebase Auth | Auth anonyme | Gratuit |
| GitHub Pages | Hébergement | Gratuit |

Aucun framework, aucun bundler, aucun serveur — juste des fichiers statiques.
