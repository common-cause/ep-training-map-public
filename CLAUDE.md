# ep-training-map-public

Public, ungated, coalition-facing version of the EP Training Map: a US map of
upcoming Election Protection volunteer trainings by state, with registration
links and **nothing from the staff block**. Served by GitHub Pages at
`https://common-cause.github.io/ep-training-map-public/` and embedded in an
unlisted page on protectthevote.net (WordPress; run by its site admin). Rob and
Izzy agreed to it on 2026-09-24.

This project is **hosting only**. It has no code, no Python, no venv and no `.env`.

## Ownership split (keep it)

| ep-training-map (the producer) owns | this project owns |
|---|---|
| `publish_public.py`: the build step (step 3 of its nightly) | the repo and its Pages settings |
| the public field allowlist and the venue→city rule | the WordPress embed snippet and the site admin's runbook (`docs/`) |
| `PUBLIC_DENY` / `assert_public_safe`, plus tests | the README and the relationship with protectthevote.net |
| the push token (in **its** `.env`) | |

The allowlist is one security boundary. **Never add field filtering, templates
or data here.** A change to what the public map shows goes to ep-training-map
(use the mailroom).

## The two branches

- **`main`**: a normal project branch holding CLAUDE.md, README and `docs/`. It
  only changes by hand.
- **`gh-pages`**: an orphan branch. ep-training-map's nightly **force-pushes it as
  a single commit** (it skips the push when the public hash is unchanged), and
  GitHub Pages serves it. Nothing in this project writes to it, nobody edits it
  by hand, and the local clone never checks it out.

The history rewrite is deliberate: when a training is pulled, it must not stay
in public git history. So don't "fix" the force-push, don't add a branch
protection rule to `gh-pages` that blocks force-pushes, and don't treat the
missing history as data loss. A GitHub Actions deploy workflow would compete
with the branch source, so there isn't one (the cc-embed template's workflow
was removed at scaffold). Pages source: **Deploy from a branch → `gh-pages` / root**.

Meta tooling reads only `main`. `sync_projects.py` never pulls project repos and
checks staleness with `git log HEAD`, so a clone that stays on `main` sees none
of the `gh-pages` churn.

## Data flow

```
23:00 ET  ep-training-map nightly (existing dispatch task, nightly-publish)
  1  publish_trainings.py -> BQ ep_dashboards.training_map_payload
  2  verify_serving.py    -> read back what the staff map serves
  3  publish_public.py    -> newest payload row -> allowlist + venue->city
                             -> assert_public_safe -> build site
                             -> force-push one orphan commit to gh-pages
GitHub Pages (gh-pages) -> <iframe> in a WordPress Custom HTML block
```

The public map is built from the BigQuery row the staff map is serving, so it
is always a subset of it and is covered by ep-training-map's checks (staleness,
zero states, coverage shrink). A push failure exits with its own code, meaning
"public is stale", and never affects the staff map.

## Public by construction

This is a **public repo**, which is unusual in this fleet. It is written on the
assumption that anything on the map will spread beyond coalition partners.
Public fields: trainings and their registration links, with in-person venues
reduced to **city only** ("In person" when the city is ambiguous). Never
public: host or owner contacts, attendee or signup counts, and Zoom, quiz or
recording links. The header reads: "For coalition information sharing only. If
you're a volunteer and want to sign up, go to protectthevote.net".

Brand: the EP coalition's (`ep-tools-home/docs/ep-coalition-style-guide.md`).
Custom subdomain: none for now (Rob).

## Scheduling / Civis / Dispatch

This project has none of its own: no Civis jobs, no `.claude/dispatch.yaml`, no
Task Scheduler entries. Its only scheduled activity is step 3 of
ep-training-map's nightly. Izzy's pending request for a 12-hour refresh is an
upstream change (bq-research → ep-airtable-utilities → ep-dashboards →
ep-training-map, plus a fire-time grant from Rob), and the public build
follows it automatically.

## Key Files

- `README.md`: what this is, for anyone landing on the public repo
- `docs/wordpress_embed.md`: the iframe snippet and the site admin's runbook
- `.claude/settings.json`: fleet-managed (`--reseed-settings`), don't hand-edit

## PII / Data Handling

Row-level PII (names, emails, phones, street addresses, gift amounts) **never gets
committed to git** — repos here are org-visible via shared corpora and export pipelines.
Any directory that will receive raw dumps or query results gets gitignored BEFORE the
first file lands (allowlist known-clean file types; never enumerate known-bad files).
Committed derivatives must be masked or aggregated; fabricate example rows in docs.
Row-level people-data lives in access-controlled systems (BigQuery, ROI, Action Network,
shared Sheets) — point at it, don't copy it. Full policy: knowledge library entry
`pii-handling-policy` (`kl_get`).

## Agent Automation & Dispatch

Two different mechanisms. Picking the wrong one wastes the build:

- **Deterministic pipeline → Civis.** Plain Python/dbt ETL, no judgment; tracked in
  this project's `civis/SCHEDULED_SCRIPTS.md`.
- **Judgment pass → local scheduled agent, via a dispatch contract.** Anything whose
  correctness depends on a rubric, world knowledge, or a call a human would otherwise
  make. Subscription Claude Code **cannot be invoked from Civis at all** — no API-key
  path there uses the subscription — so "a Civis job that exercises judgment" is
  unbuildable, not merely discouraged. Don't start building one.

Agent-dispatchable work is governed by the **Dispatch Treaty** (ratified 2026-08-20,
in force since 2026-08-25; law: meta-project `docs/dispatch_treaty.md`). The
rob-assistant "tower" spawns headless agents at named task types that a project
declares in a committed contract. Live fleet status — who has declared what, and what
is actually granted — is the meta-project's generated `dispatch/roster.yaml`; don't
trust a count written in prose anywhere, including here.

**To make a task type in this project dispatchable:**

1. Write `.claude/dispatch.yaml` from the meta-project's `templates/dispatch.yaml`
   (one file, all of this project's task types). **Absence of that file means
   hands-off** — eligibility is declared, never inferred, and no stub is wanted for
   an interactive-only project.
2. Package the procedure itself as the runbook the contract points at — a skill at
   `.claude/skills/<name>/SKILL.md`, or a doc under `docs/`.
3. Confirm **git can see the contract.** A blanket `.claude/*` gitignore swallows it
   silently; add `!.claude/dispatch.yaml`. A contract git can't see does not exist.
4. Validate from the meta-project: `python sync_projects.py --check`, then
   `--dispatch-roster`.
5. **Stop there.** Tiers are dated grants that live only in the meta catalog
   (`projects_index.yaml`), and **only Rob grants one** — an agent proposes, never
   self-authorizes. An ungranted contract is the correct resting state: the roster
   computes `dispatchable: false` and nothing fires.

Do not register a Windows Task Scheduler job for an agent pass either — scheduled
fires go through the tower, or they earn no track record. Background and the
scheduler mechanics: knowledge library entries `dispatch-treaty-and-the-tower` and
`local-scheduled-claude-agents-task-scheduler-the-pattern-for-recurring-agentic-p`
(`kl_get`).
