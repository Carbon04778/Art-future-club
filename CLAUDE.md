# Working rules

Three standing rules, set by the project owner. They apply to every task in
this repo unless the owner says otherwise in the moment.

## 1. Never push to GitHub without asking

Ask for approval first, every time. Committing locally is fine and does not
need approval; **publishing** does — `git push`, opening or updating a pull
request, changing a remote, or anything else that makes the work public or
triggers a deploy.

Approval is per push. "Yes" on one push is not consent for the next one.

If there is no remote configured (this v12 copy has none), say so rather than
silently doing nothing.

## 2. After changing a file, prove it still runs

A change is not done when the edit saves. Run it and confirm nothing broke:

```
npm run lint          # fast, catches most breakage
npm run verify:all    # the full suite — every verify script, then a build
npm run build         # build alone when the whole suite is too slow
```

`verify:all` is the real gate: 23 verify scripts plus `vite build`. For a
change touching one area, run that area's script (`npm run verify:seo`,
`verify:adminpanel`, `verify:moderation`, …) and then `verify:all` before
calling the work finished.

**When it matters, run the actual app** — `npm run dev` — and confirm the
changed screen behaves, not just that the tests pass. A passing suite is not
the same as a working page.

Report what was run and what it said. If something fails, say so with the
output; never describe a change as working on the strength of the edit alone.

## 3. Preview and confirm — never guess

Look at the real thing before acting on it, and before reporting on it.

- Read a file before editing or overwriting it.
- Check the live state before saying what it is: query the database, run the
  script, open the page. Do not infer it from the code.
- Dry-run first where a dry run exists. `scripts/import-galleries.mjs`
  without `--commit` reports and writes nothing; use it before every import.
- Do not invent a value that has to be correct. A missing email, id or
  function body gets asked for or looked up, never guessed. Writing a guessed
  SQL function body over a working one, or a guessed `claim_email` that lets
  the wrong person take over a listing, is the kind of damage this rule exists
  to prevent.
- Quote real output. Do not paraphrase a result that was never seen.

If something cannot be verified from here, say exactly that and say what is
needed — do not fill the gap with a plausible answer.
