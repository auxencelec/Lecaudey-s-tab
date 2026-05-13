# Trésor — Budget famille Lecaudey

PWA pour gérer le budget de la famille : argent de poche, vacances, avances, loyer,
billets de train/avion, etc. Multi-utilisateurs (parents + enfants), multi-devises,
installable sur tout téléphone/tablette/desktop.

## Stack

- **Next.js 16** (App Router, React Server Components)
- **Tailwind CSS v4**
- **Supabase** (Postgres + Auth + Row Level Security)
- **Frankfurter API** pour la conversion de devises (gratuit, sans clé)
- **PWA** : manifest + icônes générées dynamiquement (`next/og`)

## Configuration initiale

### 1. Récupérer les clés Supabase

Dans [Supabase](https://app.supabase.com) → ton projet → **Project Settings → API** :
- `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
- `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` (secret) → `SUPABASE_SERVICE_ROLE_KEY`

Crée un fichier `.env.local` à la racine :

```bash
cp .env.example .env.local
# édite .env.local avec tes 3 valeurs
```

### 2. Appliquer le schéma SQL

Dans Supabase → **SQL Editor** → New query → colle le contenu de :

1. `supabase/migrations/0001_init.sql` → Run
2. `supabase/migrations/0002_seed_family.sql` → Run

Cela crée toutes les tables (`families`, `profiles`, `spaces`, `transactions`, `advances`, `allowances`) et les politiques **Row Level Security** qui isolent les données entre enfants.

### 3. Créer les comptes famille

Le script ci-dessous crée :
- 1 famille "Lecaudey"
- 6 comptes Auth (Sébastien, Julie, Auxence, Callixte, Théoxane, Eudoxe)
- 6 profils liés
- 4 espaces privés (1 par enfant, contenant parents + cet enfant)

```bash
node scripts/setup-family.mjs
```

Mot de passe par défaut : `Lecaudey2026!` (configurable via `DEFAULT_PASSWORD=… node scripts/setup-family.mjs`).
**Chaque membre doit changer son mot de passe à la première connexion.**

### 4. Lancer en local

```bash
npm install
npm run dev
```

→ http://localhost:3000

## Déploiement (Vercel)

1. Push le repo sur GitHub.
2. Sur [Vercel](https://vercel.com), **New Project** → importe le repo GitHub.
3. Dans **Settings → Environment Variables**, ajoute les 3 mêmes variables que `.env.local`.
4. Deploy. Vercel te donne une URL `https://xxx.vercel.app`.

## Installer sur les téléphones de la famille

### iPhone / iPad (Safari)
1. Ouvre l'URL Vercel dans Safari.
2. Touche **Partager** (icône carré + flèche).
3. **Sur l'écran d'accueil** → Ajouter.

### Android (Chrome / Edge)
1. Ouvre l'URL.
2. Chrome propose automatiquement **"Installer l'appli"** (sinon menu ⋮ → Installer).

### Desktop (Mac / Windows)
- Chrome / Edge : icône **+ Installer** dans la barre d'adresse.

## Modèle de données

- `families` : 1 ligne (Lecaudey).
- `profiles` : 1 ligne par membre (lié à `auth.users`), avec rôle (`parent` / `child`) et devise préférée.
- `spaces` : conteneurs de transactions.
  - `kind = 'private'` : un seul enfant ↔ parents. Les autres enfants n'y ont **pas accès**.
  - `kind = 'group'` : créé par un parent, membres choisis (ex: "Vacances Corse").
- `space_members` : qui peut voir quel espace.
- `transactions` : `amount` (signé) + `currency` + `category` + `concerns_id` (à qui ça affecte le solde) + `space_id`.
- `advances` : créances ouvertes entre membres (qui doit quoi à qui, restant à rembourser).
- `allowances` : argent de poche récurrent par enfant (montant + fréquence).

**Sécurité** : toutes les tables ont des politiques RLS. Un enfant ne voit que :
- les profils de la famille (noms only)
- son espace privé + les groupes dont il fait partie
- les transactions de ces espaces
- les avances où il est créancier ou débiteur

Les parents voient tout dans leur famille.

## Conversion de devises

Chaque transaction stocke `(amount, currency)` en devise d'origine. À l'affichage, tout est converti dans la **devise préférée** de l'utilisateur connecté (réglage dans Réglages → Devise).

Les taux viennent de [Frankfurter](https://frankfurter.dev), gratuit et sans clé, mis en cache 1h.

## Roadmap (post-MVP)

- [ ] Groupes : UI pour créer/gérer (DB déjà prête côté schema + RLS)
- [ ] Argent de poche automatique : cron Supabase Edge Function
- [ ] Notifications push (Web Push API)
- [ ] Export CSV / PDF mensuel
- [ ] Objectifs d'épargne par enfant
- [ ] Graphiques (répartition catégories)

## Scripts

```bash
npm run dev          # dev server
npm run build        # production build
npm run start        # production server
npm run lint         # eslint
node scripts/setup-family.mjs   # seed la famille
```
