# Deploying to Cloud Run

Once the steps below are done, every push to `main` that passes CI is
deployed to Google Cloud Run, and the CI run checks the new version with
`/api/health`. Until then the **Deploy to Cloud Run** job is skipped.

You do these steps once, in your own Google and Neon accounts. Most of
them are commands to paste into **Cloud Shell** (the `>_` button at the
top of the [Google Cloud console](https://console.cloud.google.com)),
which already has `gcloud` installed and signed in.

The names below (`meal-planner`, `meal-planner-deploy`, `github`, ...)
are the ones the workflow in `.github/workflows/ci.yml` expects. Keep
them.

## The short way (works from a phone)

`scripts/setup-gcp.sh` does steps 1 and 4–7 below in one go and asks
only for a project id, the Neon connection string and the login
password. Running it again skips whatever already exists.

1. **Neon** (step 3): create the database and copy its connection
   string. The script changes its start to `postgresql+psycopg://`.
2. **Billing**: in the [console](https://console.cloud.google.com/billing),
   make sure you have a billing account (a payment card). If you have
   exactly one, the script links it to the new project.
3. **Cloud Shell**: open <https://shell.cloud.google.com/?show=terminal>
   (on a phone, turn on "Desktop site" in the browser menu) and paste:

   ```
   curl -fsSLO https://raw.githubusercontent.com/alexandersb98/food-opti-planner/main/scripts/setup-gcp.sh && bash setup-gcp.sh
   ```

   Answer its questions. Pasted values and the password are not shown.
   At the end it prints two values.
4. **Budget alert** (step 2), in the console.
5. **GitHub variables** (step 8): add the two printed values.
6. **First deploy** (step 9): **Run workflow**.

The sections below are what the script does, for reference or for doing
it by hand.

## What it costs

Nothing, as long as use stays within the free tiers:

| Service | Free each month | This app |
|---|---|---|
| Cloud Run | 180 000 vCPU-seconds, 2 million requests | a 30 s plan uses 30 vCPU-seconds |
| Artifact Registry | 0.5 GB storage | 2 images of about 125 MB |
| Secret Manager | 6 secret versions | 3 |
| Neon (free plan) | 0.5 GB storage, 100 compute hours | one small database |

Google needs a payment card on file even for the free tiers. The budget
alert in step 2 emails you if anything starts costing money. It only
warns; it does not stop anything.

After an idle period the first request takes a few seconds, while Cloud
Run starts the container and Neon wakes the database.

## 1. Google Cloud project

Pick a project id. It must be unique across all of Google Cloud, for
example `meal-planner-` and a few letters of your own. In Cloud Shell:

```
PROJECT_ID=meal-planner-xyz     # your choice
REGION=europe-north1
gcloud projects create "$PROJECT_ID"
gcloud config set project "$PROJECT_ID"
```

Link a billing account (this is where the payment card is). In the
console: **Billing** → **Link a billing account**, or:

```
gcloud billing accounts list
gcloud billing projects link "$PROJECT_ID" --billing-account=XXXXXX-XXXXXX-XXXXXX
```

Turn on the services the app and the deploy use:

```
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com iam.googleapis.com iamcredentials.googleapis.com \
  sts.googleapis.com
```

Cloud Shell forgets `PROJECT_ID` and `REGION` when it restarts. Set
them again if a later step complains they are empty.

## 2. Budget alert

In the console: **Billing** → **Budgets & alerts** → **Create budget**.

- Name: `Meal planner`
- Projects: only your new project
- Amount: 1 USD, or about the same in your billing account's currency
  (for example 10 SEK)
- Alert thresholds: 50 % and 100 % of actual spend
- Email alerts to billing admins and users: on

## 3. Neon database

1. Sign up at [neon.tech](https://neon.tech) (the free plan).
2. Create a project named `meal-planner` in an EU region, for example
   **AWS Europe Central 1 (Frankfurt)**.
3. On the project dashboard, press **Connect**. Turn **Connection
   pooling** off and copy the connection string. It looks like
   `postgresql://neondb_owner:...@ep-....eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require`.
4. Change the beginning from `postgresql://` to
   `postgresql+psycopg://`. The app needs this prefix to use the
   database driver it has installed. Keep the rest, including
   `?sslmode=require...`.

The app creates its tables itself when it starts. Neon's free plan can
restore the database to any point in the last 6 hours, which is the
only backup for now.

## 4. Image repository

```
gcloud artifacts repositories create meal-planner \
  --repository-format=docker --location="$REGION"

cat > cleanup.json <<'EOF'
[
  {"name": "keep-newest", "action": {"type": "Keep"},
   "mostRecentVersions": {"keepCount": 2}},
  {"name": "delete-older", "action": {"type": "Delete"},
   "condition": {"tagState": "any"}}
]
EOF
gcloud artifacts repositories set-cleanup-policies meal-planner \
  --location="$REGION" --policy=cleanup.json --no-dry-run
```

The policy keeps the 2 newest images and deletes the rest, to stay
under the free 0.5 GB. Google applies it about once a day.

## 5. Secrets

The app reads three secrets: the database URL, the key that signs the
session cookie, and the hash of the login password.

Database URL (from step 3, with `postgresql+psycopg://`). `read -rs`
keeps it out of the shell history and off the screen:

```
read -rsp 'Database URL: ' VALUE; echo
printf '%s' "$VALUE" | gcloud secrets create database-url --data-file=-
```

Session key, a random one:

```
python3 -c 'import secrets; print(secrets.token_urlsafe(32), end="")' \
  | gcloud secrets create session-key --data-file=-
```

Password hash. Make it on your own computer, in the repository, as in
the README (`python3 -m server.hash_password` asks for the password
twice and prints the hash). Copy the printed line, then in Cloud Shell:

```
read -rsp 'Password hash: ' VALUE; echo
printf '%s' "$VALUE" | gcloud secrets create password-hash --data-file=-
```

## 6. Service accounts

Two accounts: `meal-planner-run` is what the app runs as and can only
read the three secrets; `meal-planner-deploy` is what GitHub signs in
as and can push images and deploy.

```
gcloud iam service-accounts create meal-planner-run --display-name="Meal planner app"
gcloud iam service-accounts create meal-planner-deploy --display-name="Meal planner deploys from GitHub"
RUN_SA="meal-planner-run@$PROJECT_ID.iam.gserviceaccount.com"
DEPLOY_SA="meal-planner-deploy@$PROJECT_ID.iam.gserviceaccount.com"

for secret in database-url session-key password-hash; do
  gcloud secrets add-iam-policy-binding "$secret" \
    --member="serviceAccount:$RUN_SA" --role=roles/secretmanager.secretAccessor
done

gcloud artifacts repositories add-iam-policy-binding meal-planner --location="$REGION" \
  --member="serviceAccount:$DEPLOY_SA" --role=roles/artifactregistry.writer
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$DEPLOY_SA" --role=roles/run.admin
gcloud iam service-accounts add-iam-policy-binding "$RUN_SA" \
  --member="serviceAccount:$DEPLOY_SA" --role=roles/iam.serviceAccountUser
```

`roles/run.admin` is needed because each deploy makes the service
public (anyone can reach the login page). The app's own password
protects everything else.

## 7. Let GitHub sign in (Workload Identity Federation)

GitHub gets a short-lived token for each run instead of a stored key.
Only runs on `main` of this repository are accepted, so a pull request
or another branch cannot deploy.

```
gcloud iam workload-identity-pools create github \
  --location=global --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc github \
  --location=global --workload-identity-pool=github --display-name="GitHub" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository == 'alexandersb98/food-opti-planner' && assertion.ref == 'refs/heads/main'"

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/alexandersb98/food-opti-planner"

echo "GCP_PROJECT_ID=$PROJECT_ID  GCP_PROJECT_NUMBER=$PROJECT_NUMBER"
```

If the repository is renamed or moved, change the repository name in
the last two commands (`gcloud iam workload-identity-pools providers
update-oidc` with the same flags, and a new binding).

## 8. GitHub repository variables

On GitHub, in the repository: **Settings** → **Secrets and variables**
→ **Actions** → **Variables** → **New repository variable**. Add the
two values the last command printed:

| Name | Value |
|---|---|
| `GCP_PROJECT_ID` | the project id |
| `GCP_PROJECT_NUMBER` | the project number |

These are not secrets; nothing secret is stored in GitHub.

## 9. First deploy

On GitHub: **Actions** → **CI** → **Run workflow** (branch `main`). The
run tests everything, then deploys. When it is green, open the
**Deploy to Cloud Run** job: its summary shows the app's address
(`https://meal-planner-....europe-north1.run.app`). Open it and log in
with your password.

If the deploy fails:

- **Authentication errors** in the first step: check the two variables
  and steps 6–7.
- **The deploy step fails** and the log mentions the container did not
  start: open **Cloud Run** → `meal-planner` → **Logs** in the console.
  A wrong database URL or password hash shows there.
- **The health check fails**: the app started but cannot reach the
  database. Check the database URL secret, and that the Neon project
  is not paused or deleted.

## Later changes

To change a secret, add a new version of it, then **Run workflow**
again so a new version of the app reads it. For example, a new
password (hash made as in step 5):

```
read -rsp 'Password hash: ' VALUE; echo
printf '%s' "$VALUE" | gcloud secrets versions add password-hash --data-file=-
```

The same works for `session-key` (logs out every session) and
`database-url`. The free tier counts 6 active secret versions; disable
an old one with
`gcloud secrets versions disable VERSION --secret=NAME`.

To stop deploying, delete the `GCP_PROJECT_ID` repository variable; the
deploy job is skipped again. To take the app offline:
`gcloud run services delete meal-planner --region=europe-north1`.
