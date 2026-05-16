# @nexus/dashboard — Nexus Editorial Frontend

Application React TypeScript (Vite) pour la review et la validation hebdomadaire des 3 posts produits par le pipeline Nexus Editorial. Sera déployée sur Lovable.dev le 19 mai.

## Stack

- React 18 + TypeScript + Vite 5
- React Router v6 (routing client-side)
- Tailwind CSS 3 (palette Eclipse dark Synvex)
- Supabase JS v2 (lecture `weekly_reports` + écriture `human_validated` / `editorial_performance`)
- Auth : Supabase email magic link
- Tests : Vitest + Testing Library (jsdom)
- Aucune lib state manager (useState/useReducer suffisent)
- Aucune lib UI externe (composants atomiques custom)

## Quick start (dev local)

```bash
# Depuis la racine du monorepo :
cp packages/dashboard/.env.example packages/dashboard/.env.local
# Éditer .env.local avec VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.

pnpm install
pnpm --filter @nexus/dashboard dev
# → http://localhost:5173
```

## Build production

```bash
pnpm --filter @nexus/dashboard build
# → packages/dashboard/dist/
```

## Tests

```bash
pnpm --filter @nexus/dashboard test
# 5 tests Vitest avec mock du client Supabase + clipboard.
```

## Variables d'environnement

| Variable | Source | Usage |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase Dashboard → API Settings | URL du projet (`https://jugcyqtweavrltmxdogg.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Supabase Dashboard → API Settings | Clé anon publique (RLS appliquée côté serveur) |

⚠️ Ne **jamais** coller `SUPABASE_SERVICE_ROLE_KEY` ici — il ne doit jamais arriver dans un bundle public.

## Procédure d'import dans Lovable (19 mai)

1. **Ouvrir le projet Lovable** : https://lovable.dev/projects/ba060899-2d48-4f8b-b3c9-f3aa29dc156e

2. **Coller le prompt suivant** dans le chat Lovable :

   ```
   Importe le code source React TypeScript suivant dans ce projet. Stack attendue : React 18 + TypeScript + Vite + Tailwind + Supabase JS + React Router v6. Aucune lib UI externe (pas de shadcn ni d'autre). Aucun state manager. Pas de SSR.

   Ne génère pas de boilerplate supplémentaire. Garde la palette Eclipse dark définie dans tailwind.config.ts. Garde les composants atomiques custom (Button, Badge, Card, Tag, Toast) sans les remplacer par shadcn.

   [Coller ensuite, dans ce même message, le contenu de TOUS les fichiers de packages/dashboard/ — voir la commande ci-dessous pour les générer]
   ```

3. **Générer le payload de fichiers** côté local :

   ```bash
   cd packages/dashboard
   find src public . -maxdepth 3 -type f \
     \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' -o -name '*.json' -o -name '*.html' -o -name '*.js' -o -name '*.svg' -o -name '*.md' \) \
     -not -path './node_modules/*' -not -path './dist/*' \
     | while read f; do
       echo "=== FILE: $f ==="
       cat "$f"
       echo ""
     done > /tmp/nexus-dashboard-payload.txt
   ```

   Coller le contenu de `/tmp/nexus-dashboard-payload.txt` dans Lovable.

4. **Configurer les env vars Lovable** : Settings → Environment Variables :
   - `VITE_SUPABASE_URL=https://jugcyqtweavrltmxdogg.supabase.co`
   - `VITE_SUPABASE_ANON_KEY=<copier depuis Supabase Dashboard>`

5. **Configurer l'URL Site dans Supabase Auth** :
   - Supabase Dashboard → Authentication → URL Configuration
   - Site URL : `https://<votre-app>.lovable.app`
   - Redirect URLs : ajouter `https://<votre-app>.lovable.app/*`

6. **Tester** :
   - Aller sur l'URL Lovable de prod.
   - Se connecter avec son email Synvex.
   - Vérifier l'arrivée d'une semaine W20 dans la liste (si le pipeline a tourné côté Edge Functions).

## Architecture

```
src/
├── main.tsx                 Entry React (StrictMode)
├── App.tsx                  Router + protection auth
├── index.css                Tailwind imports + globals
│
├── lib/
│   ├── supabase.ts          Client Supabase singleton
│   ├── database.types.ts    Types DB (mirror packages/shared/src/db/types.ts)
│   ├── types.ts             Types métier (Angle, Winner, etc.) + labels FR
│   └── format.ts            Helpers formatage (dates, copy clipboard)
│
├── hooks/
│   ├── useAuth.ts           Session Supabase + signInWithMagicLink + signOut
│   ├── useWeeklyReport.ts   Fetch un report par week_id
│   └── useWeeklyReports.ts  Fetch liste (10 dernières semaines)
│
├── components/
│   ├── ui/                  Atomiques : Button, Badge, Card, Tag, Toast
│   ├── layout/              AppShell, Sidebar, Header
│   └── posts/               PostCard, PostDetail, HookVariants, VisualBox,
│                            TimingBadge, ValidationToggle, PerformanceForm
│
├── pages/
│   ├── HomePage.tsx         / — liste des 10 dernières semaines
│   ├── WeekPage.tsx         /week/:weekId — 3 PostCards
│   ├── PostPage.tsx         /week/:weekId/post/:position — détail
│   └── LoginPage.tsx        /login — magic link
│
└── test/
    ├── setup.ts             Stubs env + clipboard
    ├── fixtures.ts          Factories makeWinner/makeReport/etc.
    └── dashboard.test.tsx   5 tests Vitest (mock Supabase)
```

## Design system

Palette `tailwind.config.ts` (Eclipse dark, Henner Nexus style) :

| Token | Hex | Usage |
|---|---|---|
| `bg-primary` | `#0a0a0f` | Background principal |
| `bg-secondary` | `#161620` | Cards, sidebar |
| `bg-tertiary` | `#1f1f2b` | Buttons secondary, input fields |
| `border` | `#2a2a35` | Bordures cards |
| `ink-primary` | `#e5e5e5` | Texte principal |
| `ink-secondary` | `#8a8a95` | Texte secondaire, labels |
| `ink-muted` | `#5a5a65` | Disabled, hint |
| `accent-violet` | `#8b5cf6` | Signature Synvex, CTAs primaires |
| `accent-success` | `#10b981` | Validé, OK |
| `accent-warning` | `#f59e0b` | Override post-processor |
| `accent-danger` | `#ef4444` | Flag critique, erreur |

Typo : Inter (system stack en fallback). Pas de webfont chargée.

## Sécurité

- RLS Supabase active sur toutes les tables. La clé anon ne peut lire/écrire que ce qui est autorisé pour `authenticated`.
- Pas de service_role exposé côté front.
- Pas d'appel direct aux Edge Functions depuis le dashboard. Les Edge Functions sont appelées uniquement par n8n cloud (côté serveur).
- Pas de "lancement manuel d'un agent" dans l'UI — c'est volontaire.
