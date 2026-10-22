# GUI Slice 2 — Deploy to Cloud Run Implementation Plan

**Goal:** Every push to `main` that passes CI is deployed to Cloud Run
and checked with `/api/health`, with a guide for the owner's one-time
setup in their own Google and Neon accounts.

**Architecture:** A `deploy` job at the end of the existing CI workflow
signs in to Google with Workload Identity Federation, builds the image,
pushes it to Artifact Registry, deploys it with `gcloud run deploy`
(the stack spec's settings table) and calls `/api/health` on the
service. The three secrets reach the container as environment variables
from Secret Manager. `docs/deploy.md` lists the one-time steps as
commands to paste into Cloud Shell.

**Tech Stack:** as slice 1, plus GitHub Actions
(`google-github-actions/auth`, `setup-gcloud`), `gcloud`, and
`actionlint` in CI.

**Specs:** "Deployment" and "Hosting" in
[`2026-10-22-gui-tech-stack-design.md`](../specs/2026-10-22-gui-tech-stack-design.md)
(the "stack spec") and slice 2 in
[`2026-10-22-gui-slices.md`](2026-10-22-gui-slices.md).

**Status:** Built and committed task by task on branch
`claude/slice-2-deploy`. As in slices 0 and 1, each task names its
files and how it was checked; the code is in the commits.

## Global Constraints

- `meal_planner/` is not changed.
- Claude writes the workflow and the guide but does not connect to any
  live environment (Google Cloud, Neon).
- No long-lived Google keys are stored in GitHub.
- Cloud Run: min/max instances 0/1, 1 vCPU, 2 GiB, request timeout
  360 s, request-based billing, region `europe-north1`. Neon in an EU
  region.
- Secret Manager holds the database URL, the session signing key and
  the password hash. Budget alert at $1.
- Pull requests run the checks only, never the deploy.

## Interpretations made in this plan

1. **The deploy job is skipped until the owner has set it up**, instead
   of failing. It runs only on `main` and only when the repository
   variable `GCP_PROJECT_ID` is set. This differs from the
   slice list, which expected a failing job and so held the merge until
   the owner was ready. With the skip, the slice can merge at any time
   and `main` stays green; deploys start with the first push (or re-run)
   after the setup.
2. **Two repository variables, no secrets in GitHub:** `GCP_PROJECT_ID`
   and `GCP_PROJECT_NUMBER`. All other names are fixed by the guide
   (repository `meal-planner`, service `meal-planner`, service accounts
   `meal-planner-deploy` and `meal-planner-run`, identity pool and
   provider `github`), so the workflow builds them from these two.
3. **Two service accounts.** `meal-planner-deploy` is what GitHub signs
   in as; it can push images and deploy. `meal-planner-run` is what the
   container runs as; it can only read the three secrets.
   `meal-planner-deploy` gets `roles/run.admin`, because making the
   service public (`--allow-unauthenticated`) sets its IAM policy, which
   `roles/run.developer` cannot. The app's own login protects it.
4. **Only `main` of this repository can sign in to Google.** The
   identity provider's condition checks both the repository and the
   ref, so a pull request or another branch cannot deploy even if the
   workflow is changed.
5. **The health check calls the service URL** after `gcloud run deploy`
   returns. The command returns only once the new revision is ready and
   takes all traffic, so the URL reaches the new revision. Migrations
   run at startup (slice 0), so a failed migration already fails the
   deploy; the health call then also proves the database answers. It
   retries for about a minute, for Neon waking from idle.
6. **The image is built again in the deploy job** and tagged with the
   commit sha. The `container` job stays as the pull-request check.
7. **Cleanup policy keeps the 2 newest images.** The server's wheels
   are about 77 MB compressed and the Python base about 45 MB, so one
   image is roughly 125 MB and two fit well under the free 0.5 GB. The
   policy runs about once a day, so a busy day can briefly hold more.
8. **The workflow can also be started by hand** ("Run workflow",
   `workflow_dispatch`). On `main` it tests and deploys without a new
   commit: the first deploy after the setup, and a redeploy after a
   secret changes, since a new revision is what reads the new value.
9. **Deploys run one at a time** (a `concurrency` group that waits
   rather than cancels), so two quick merges deploy in order.
10. **The engine checks a pooled connection before using it**
   (`pool_pre_ping`). Neon suspends an idle database after 5 minutes
   and drops its connections, while a Cloud Run instance can live
   longer than that, so without the check the first request after a
   pause would fail. This is the slice's one server change.
11. **The database URL must start with `postgresql+psycopg://`.** Neon
    shows `postgresql://`, which SQLAlchemy reads as the `psycopg2`
    driver that is not installed. The guide says to change the prefix;
    the server does not rewrite URLs.
12. **The guide uses Cloud Shell**, which has `gcloud` and Python
    already. The password hash is made on the owner's computer with
    `python -m server.hash_password`, as in the README, and pasted into
    Cloud Shell with `read -rs` (not echoed, not in the shell history),
    so Cloud Shell needs no clone of the repository. The budget alert is
    made in the console, where the currency of the billing account is
    shown.

## Tasks

### Task 1: Survive Neon dropping idle connections

**Files:** `server/db.py`, `tests/server/test_health.py`.

**Interfaces produced:** none new; `make_engine(url)` now returns an
engine with `pool_pre_ping=True`.

**Tests:** on Postgres, health still answers 200 after every other
connection to the database has been ended with
`pg_terminate_backend` (what Neon's suspend does). Skipped on SQLite.

**Check:** the test fails on Postgres without `pool_pre_ping` and
passes with it; the whole server suite passes on SQLite and Postgres.

### Task 2: Deploy job and workflow lint

**Files:** `.github/workflows/ci.yml`.

**Interfaces produced:**
- Job `workflow-lint`: runs `actionlint` (pinned version) on every pull
  request and push.
- Trigger `workflow_dispatch` on the CI workflow.
- Job `deploy`: needs `python`, `web` and `workflow-lint`; runs on
  `main` (push or "Run workflow") when `vars.GCP_PROJECT_ID` is set; `id-token: write`;
  builds and pushes
  `europe-north1-docker.pkg.dev/$PROJECT/meal-planner/meal-planner:$SHA`;
  deploys service `meal-planner` with the settings table, runtime
  service account `meal-planner-run` and secrets `database-url`,
  `session-key`, `password-hash` (each `:latest`) as `DATABASE_URL`,
  `SESSION_KEY`, `PASSWORD_HASH`; checks `/api/health`; writes the
  service URL to the job summary.

**Tests:** `actionlint` (with `shellcheck`) passes locally and in CI.

**Check:** `actionlint` passes, and reports a misspelled job in
`needs` and an unquoted variable in a `run` script (so `shellcheck`
runs). Every `gcloud run deploy` flag is in the installed `gcloud`'s
help (SDK 570). On the pull request the deploy job is skipped and every
other job is green.

### Task 3: Owner's setup guide and docs

**Files:** `docs/deploy.md`, `README.md`, this plan.

`docs/deploy.md`, in order: what it costs and what needs a payment
card; the Google project and APIs; the $1 budget alert; the Neon
database and how to change its URL's prefix; Artifact Registry with the
cleanup policy; the three secrets; the two service accounts and their
roles; Workload Identity Federation limited to `main` of this
repository; the two GitHub repository variables; the first deploy and
how to find the URL; later changes (new password, new key, new
database URL) and how to stop deploys.

**Check:** every resource name in the guide matches the workflow; each
`gcloud` command's flags checked against the installed `gcloud`'s help
(SDK 570). Nothing was run against a real project.
