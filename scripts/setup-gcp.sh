#!/usr/bin/env bash
# The one-time Google Cloud setup from docs/deploy.md, for Cloud Shell:
#   bash setup-gcp.sh [PROJECT_ID]
# Safe to run again: it skips whatever already exists, and asks for the
# database URL and the password only while their secrets are missing.
set -euo pipefail

REGION=europe-north1
GITHUB_REPO=alexandersb98/food-opti-planner

say() { printf '\n== %s\n' "$*"; }
quietly() { "$@" >/dev/null 2>&1; }

PROJECT_ID="${1:-}"
if [ -z "$PROJECT_ID" ]; then
  read -rp 'Project id (lowercase letters, digits, dashes; e.g. meal-planner-xyz): ' PROJECT_ID
fi

say "Project $PROJECT_ID"
if ! quietly gcloud projects describe "$PROJECT_ID"; then
  gcloud projects create "$PROJECT_ID" --name="Meal planner"
fi
gcloud config set project "$PROJECT_ID" >/dev/null 2>&1

say "Billing"
if [ "$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingEnabled)')" != True ]; then
  mapfile -t accounts < <(gcloud billing accounts list --filter=open=true --format='value(name)')
  if [ "${#accounts[@]}" -ne 1 ]; then
    echo "Found ${#accounts[@]} billing accounts, so I cannot pick one."
    echo "In the console, link a billing account to $PROJECT_ID"
    echo "(Billing > Link a billing account), then run this script again."
    exit 1
  fi
  gcloud billing projects link "$PROJECT_ID" --billing-account="${accounts[0]#billingAccounts/}"
fi

say "Services (takes a minute)"
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com iam.googleapis.com iamcredentials.googleapis.com \
  sts.googleapis.com

say "Image repository"
if ! quietly gcloud artifacts repositories describe meal-planner --location="$REGION"; then
  gcloud artifacts repositories create meal-planner \
    --repository-format=docker --location="$REGION"
fi
policy="$(mktemp)"
cat > "$policy" <<'EOF'
[
  {"name": "keep-newest", "action": {"type": "Keep"},
   "mostRecentVersions": {"keepCount": 2}},
  {"name": "delete-older", "action": {"type": "Delete"},
   "condition": {"tagState": "any"}}
]
EOF
gcloud artifacts repositories set-cleanup-policies meal-planner \
  --location="$REGION" --policy="$policy" --no-dry-run >/dev/null
rm -f "$policy"

say "Secrets"
if ! quietly gcloud secrets describe database-url; then
  read -rsp 'Neon connection string (paste it; it is not shown): ' url; echo
  url="${url#"${url%%[![:space:]]*}"}"   # trim spaces a paste may add
  url="${url%"${url##*[![:space:]]}"}"
  case "$url" in
    postgresql://*) url="postgresql+psycopg://${url#postgresql://}" ;;
    postgres://*) url="postgresql+psycopg://${url#postgres://}" ;;
  esac
  case "$url" in
    postgresql+psycopg://*) ;;
    *) echo "That does not start with postgresql://; copy it from Neon's Connect dialog."; exit 1 ;;
  esac
  printf '%s' "$url" | gcloud secrets create database-url --data-file=-
fi
if ! quietly gcloud secrets describe session-key; then
  python3 -c 'import secrets; print(secrets.token_urlsafe(32), end="")' \
    | gcloud secrets create session-key --data-file=-
fi
if ! quietly gcloud secrets describe password-hash; then
  read -rsp 'Login password for the app (not shown): ' password; echo
  read -rsp 'The same password again: ' again; echo
  if [ -z "$password" ] || [ "$password" != "$again" ]; then
    echo "The password is empty or the two differ. Run the script again."
    exit 1
  fi
  venv="$(mktemp -d)"
  python3 -m venv "$venv"
  "$venv/bin/pip" install --quiet argon2-cffi
  hash="$(printf '%s' "$password" | "$venv/bin/python" -c \
    'import sys; from argon2 import PasswordHasher; print(PasswordHasher().hash(sys.stdin.read()), end="")')"
  rm -rf "$venv"
  printf '%s' "$hash" | gcloud secrets create password-hash --data-file=-
fi

say "Service accounts"
RUN_SA="meal-planner-run@$PROJECT_ID.iam.gserviceaccount.com"
DEPLOY_SA="meal-planner-deploy@$PROJECT_ID.iam.gserviceaccount.com"
created=no
if ! quietly gcloud iam service-accounts describe "$RUN_SA"; then
  gcloud iam service-accounts create meal-planner-run --display-name="Meal planner app"
  created=yes
fi
if ! quietly gcloud iam service-accounts describe "$DEPLOY_SA"; then
  gcloud iam service-accounts create meal-planner-deploy --display-name="Meal planner deploys from GitHub"
  created=yes
fi
if [ "$created" = yes ]; then
  sleep 15  # new service accounts take a moment before roles can name them
fi
for secret in database-url session-key password-hash; do
  gcloud secrets add-iam-policy-binding "$secret" \
    --member="serviceAccount:$RUN_SA" --role=roles/secretmanager.secretAccessor >/dev/null
done
gcloud artifacts repositories add-iam-policy-binding meal-planner --location="$REGION" \
  --member="serviceAccount:$DEPLOY_SA" --role=roles/artifactregistry.writer >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT_ID" --condition=None \
  --member="serviceAccount:$DEPLOY_SA" --role=roles/run.admin >/dev/null
gcloud iam service-accounts add-iam-policy-binding "$RUN_SA" \
  --member="serviceAccount:$DEPLOY_SA" --role=roles/iam.serviceAccountUser >/dev/null

say "GitHub sign-in (Workload Identity Federation)"
if ! quietly gcloud iam workload-identity-pools describe github --location=global; then
  gcloud iam workload-identity-pools create github \
    --location=global --display-name="GitHub Actions"
fi
if ! quietly gcloud iam workload-identity-pools providers describe github \
    --location=global --workload-identity-pool=github; then
  gcloud iam workload-identity-pools providers create-oidc github \
    --location=global --workload-identity-pool=github --display-name="GitHub" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition="assertion.repository == '$GITHUB_REPO' && assertion.ref == 'refs/heads/main'"
fi
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$GITHUB_REPO" \
  >/dev/null

say "Done. Add these two repository variables on GitHub:"
echo "  GCP_PROJECT_ID      $PROJECT_ID"
echo "  GCP_PROJECT_NUMBER  $PROJECT_NUMBER"
echo "at https://github.com/$GITHUB_REPO/settings/variables/actions"
