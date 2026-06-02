# GitHub Actions secrets

The Events API CI/CD workflow reads deployment credentials from GitHub Actions repository secrets. These values are not committed to the repository and are only exposed to the workflow at runtime.

The workflow file is `.github/workflows/events-api-ci-cd.yml`.

## Required secrets

| Secret name | Used for |
| --- | --- |
| `HARBOR_USERNAME` | Logging in to the Harbor container registry. |
| `HARBOR_PASSWORD` | Logging in to the Harbor container registry. |
| `KUBE_CONFIG_DATA` | Base64-encoded kubeconfig used by the deploy job. |
| `EVENTS_API_DB_PASSWORD` | PostgreSQL password shared by the in-cluster database and API connection string. |
| `EVENTS_API_JWT_SIGNING_KEY` | JWT signing key stored in the `events-api-secrets` Kubernetes secret. |
| `EVENTS_API_ADMIN_PASSWORD` | Seed/admin password stored in the `events-api-secrets` Kubernetes secret. |

## Create `EVENTS_API_DB_PASSWORD` in GitHub

1. Open the GitHub repository in a browser.
2. Go to **Settings**.
3. In the left sidebar, open **Secrets and variables**.
4. Select **Actions**.
5. Click **New repository secret**.
6. Set **Name** to `EVENTS_API_DB_PASSWORD`.
7. Set **Secret** to the production PostgreSQL password.
8. Click **Add secret**.

Use only the password value. Do not paste a full PostgreSQL connection string into this secret.

The workflow stores this value in Kubernetes as `events-api-secrets/db-password`. Both the PostgreSQL container and the API pod read that same key, so the database password and the password inside `ConnectionStrings__EventsCatalog` stay in sync.

The API builds this Npgsql connection string in `deploy/k8s/deployment.yaml`:

```text
Host=events-postgres;Port=5432;Database=events;Username=events_api;Password=$(EVENTS_API_DB_PASSWORD);Pooling=true
```

Do not use a SQLite-style value or a full connection string as the GitHub secret value, such as:

```text
Data Source=/data/events.db
Host=postgres.example.internal;Port=5432;Database=events;Username=events_api;Password=...
```

The backend uses Npgsql in production, and Npgsql will fail during startup if `ConnectionStrings__EventsCatalog` contains `Data Source=...`.

## Create the secret with GitHub CLI

If the GitHub CLI is installed and authenticated, you can create or update the same secret from the repository root:

```powershell
gh secret set EVENTS_API_DB_PASSWORD
```

Paste the database password when prompted. Do not include quotes around the value.

To provide the value from a secure local environment variable instead:

```powershell
$env:EVENTS_API_DB_PASSWORD | gh secret set EVENTS_API_DB_PASSWORD --body-file -
```

## What the workflow does with this secret

On a push to `main`, the deploy job:

1. Checks that `EVENTS_API_DB_PASSWORD` is present.
2. Fails fast if the Kubernetes deployment manifest contains `Data Source=` or tries to use a full `db-connection-string` secret.
3. Creates or updates the Kubernetes secret `events-api-secrets` in the `events-api` namespace.
4. Writes the GitHub secret value into Kubernetes as the `db-password` key.
5. Deploys PostgreSQL 18 inside the cluster using `deploy/k8s/postgres.yaml` and `deploy/k8s/persistent-volume-claim.yaml`.
6. Applies the API deployment where `ConnectionStrings__EventsCatalog` is built from the in-cluster `events-postgres` service and `events-api-secrets/db-password`.

That means changing the GitHub secret is enough for the next successful deployment to refresh both the PostgreSQL password environment variable and the API connection string password.

The PostgreSQL pod runs as the image's `postgres` user instead of root. This avoids the official entrypoint trying to `chown` the mounted PVC path, which can fail on NFS-backed storage with `Operation not permitted`.

## Verify after deployment

After the workflow deploys, verify the rollout and confirm the pod starts without Npgsql connection-string errors:

```powershell
kubectl rollout status deployment/events-api --namespace events-api
kubectl rollout status deployment/events-postgres --namespace events-api
kubectl logs deployment/events-api --namespace events-api --tail=100
```

Never print the full Kubernetes secret value in logs or paste it into issue comments, PR descriptions, or chat.