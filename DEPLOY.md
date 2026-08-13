# Deploying

Two routes. **Route A gets you live in 60 seconds with no Git.** Use it to check
the site works, then set up Route B for ongoing deploys.

---

## Route A — drag and drop (fastest, no Git)

Use the separate `art-future-club-DIST.zip`. That is the **already-built** site.

1. Unzip it. You get a folder called `dist`.
2. Go to https://app.netlify.com/drop
3. Drag the **`dist` folder** onto the page.

Live immediately. If this works and your Git deploy does not, the problem is
your Netlify build settings, not the code.

> Drag the `dist` folder itself — not its contents, and not the outer zip.

---

## Route B — GitHub + Netlify (proper setup, auto-deploys)

### Step 1 — verify you have the right project

Before anything else, in this folder run:

```bash
npm install
npm run dev
```

Open the local URL. **Check the browser tab title.**

| Tab says | Meaning |
|---|---|
| `Art Future Club — Global Artist Community` | ✅ Correct project |
| `Base44 APP` | ❌ You are in the OLD folder. Stop. |

A white page on Netlify is almost always this: the old Base44 export got pushed
instead of this one. The old export cannot be built by Netlify — its
`index.html` points at `/src/main.jsx`, which browsers cannot execute.

### Step 2 — push to GitHub

Run these from **this folder** (the one containing `package.json`):

```bash
git init
git add .
git commit -m "Phase 1: decouple from Base44, provider data layer"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

Do **not** run the `echo "# ..." >> README.md` line GitHub suggests — this
project already has a README, and `git add README.md` would push only that file.

**Before pushing, check `git status`:** you should see many files staged and
**no `node_modules`**. If `node_modules` appears, stop — `.gitignore` is not
being read.

### Step 3 — confirm the repo layout

Open your repo on github.com. You must see `package.json`, `netlify.toml`,
`src`, `public` and `docs` **immediately at the top level**.

If instead you see a single folder you have to click into, the repo is nested
one level too deep. Either re-push from the correct folder, or set **Base
directory** in Netlify (Step 4).

### Step 4 — connect Netlify

**Add new site → Import an existing project → GitHub →** pick the repo.

Netlify reads `netlify.toml`, so leave the settings alone. They should read:

| Setting | Value |
|---|---|
| Base directory | *(empty — unless your repo is nested, then the folder name)* |
| Build command | `npm run build` |
| Publish directory | `dist` |

⚠️ If you manually typed anything into these fields during setup, that override
beats `netlify.toml`. Clear them.

Deploy.

### Step 5 — read the deploy log

**Deploys →** click the newest one. The log **must** contain:

```
$ npm run build
✓ built in 20s
```

If the log does not show a build running, Netlify is serving your source files
as static assets. That produces a white page. Fix the publish directory.

---

## Troubleshooting a white page

Open the live site, press **F12 → Console**, and refresh.

| What you see | Cause | Fix |
|---|---|---|
| Tab title is `Base44 APP` | Old project pushed | Push this project instead |
| `Failed to load module /src/main.jsx` | No build ran; source served raw | Publish directory must be `dist` |
| 404s on `/assets/*.js` | Wrong publish directory | Set to `dist`, clear cache, redeploy |
| Blank, no console errors, works locally | Stale deploy cache | Deploys → Trigger deploy → **Clear cache and deploy site** |
| Homepage works, refreshing a deep link 404s | SPA fallback missing | `public/_redirects` must be committed |

**Fastest way to tell if it is a code problem or a config problem:** do Route A.
If the drag-and-drop build works, your code is fine and it is purely Netlify
settings.

---

## After it is live

Every push to `main` rebuilds and redeploys automatically.

Your loop:

```bash
npm run verify:all     # 34 contract tests + 46 route renders + build
git add .
git commit -m "what changed"
git push
```

Rename the site under **Site configuration → Change site name** before sending
the link to a client.
