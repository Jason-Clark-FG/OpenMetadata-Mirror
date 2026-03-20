# Airflow API

In this section, we provide guides and references to use the Airflow API connector.

## Why AirflowApi Instead of the Airflow Connector?

OpenMetadata provides two connectors for Apache Airflow:

| | **Airflow** | **AirflowApi** |
|---|---|---|
| Access method | Direct database connection (MySQL, Postgres, SQLite) | REST API over HTTP |
| Requires DB credentials | Yes | No |
| Works with managed Airflow (GCP Composer, MWAA) | Hard to configure | Yes — designed for this |
| Works with private/remote Airflow | Only if DB is exposed | Yes, via HTTPS |
| Airflow version support | 2.x, 3.x | 2.x (v1 API), 3.x (v2 API) |
| Lineage from inlets/outlets | Yes (serialized DAG) | No |

**Use the AirflowApi connector when:**
- You are running **GCP Cloud Composer**, **AWS MWAA**, or any other managed Airflow service where you cannot access the metadata database directly.
- You want to ingest pipeline metadata without exposing database credentials.
- You are running Airflow 3.x and prefer the stable, versioned REST API over ORM-level DB access.

**Use the Airflow connector when:**
- You run a self-hosted Airflow instance and have direct access to its backing database.
- You need inlets/outlets lineage (task-level table lineage), which requires reading serialized DAG JSON from the database.

## Requirements

- Apache Airflow 2.x or 3.x with the REST API enabled.
- Network access from the OpenMetadata ingestion process to the Airflow webserver endpoint.
- A valid Bearer token or username/password for the Airflow API.

### Enabling the REST API

For **self-hosted Airflow**, ensure the REST API auth backend is set in `airflow.cfg`:

```ini
[api]
auth_backends = airflow.api.auth.backend.basic_auth
```

For **GCP Cloud Composer**, the REST API is enabled by default and authenticated using a Google Cloud access token — see the GCP Cloud Composer section below.

---

## Connection Details

$$section
### Host and Port $(id="hostPort")

Full URL to the Airflow webserver. This must include the scheme (`https://` or `http://`).

**Examples:**
- Self-hosted: `http://localhost:8080`
- GCP Cloud Composer: `https://XXXX-dot-REGION.composer.googleusercontent.com`
- AWS MWAA: `https://XXXX.us-east-1.airflow.amazonaws.com`

Do not include a trailing slash or any path suffix.
$$

$$section
### Username $(id="username")

Username for HTTP Basic authentication against the Airflow API.

Used only when **Token** is not provided. Requires the Airflow API to be configured with `basic_auth` as the authentication backend.
$$

$$section
### Password $(id="password")

Password for HTTP Basic authentication. Used together with **Username**.
$$

$$section
### Token $(id="token")

Bearer token for API authentication. When provided, this takes priority over Username/Password.

**GCP Cloud Composer:** provide the Google Cloud identity token obtained with:
```bash
gcloud auth print-access-token
```

**Self-hosted Airflow with JWT:** provide the JWT token configured in your Airflow installation.

> Note: Tokens are short-lived. For production, use a service account and refresh tokens programmatically.
$$

$$section
### API Version $(id="apiVersion")

Airflow REST API version to use:

- **auto** (default): OpenMetadata automatically detects the version by probing `/api/v2/version` then `/api/v1/version`.
- **v1**: Explicitly targets Airflow 2.x REST API.
- **v2**: Explicitly targets Airflow 3.x REST API. Recommended for GCP Cloud Composer with Airflow 3.

When set to `v2`, OpenMetadata will use `timetable_summary` for schedule intervals (Airflow 3 renamed `schedule_interval`).
$$

$$section
### Number Of Status $(id="numberOfStatus")

Number of past DAG run statuses to read every time the ingestion runs.

Default is **10**. Increase this value if you need a longer run history in OpenMetadata.
$$

$$section
### Verify SSL $(id="verifySSL")

Whether to verify SSL certificates when connecting to the Airflow API.

- **true** (default): SSL certificates are validated. Recommended for production.
- **false**: SSL verification is skipped. Use only for development or self-signed certificates.
$$

$$section
### Pipeline Filter Pattern $(id="pipelineFilterPattern")

Regex patterns to include or exclude specific DAGs from ingestion.

**Example — include only DAGs prefixed with `etl_`:**
```json
{ "includes": ["^etl_.*"] }
```

**Example — exclude DAGs with `test` in the name:**
```json
{ "excludes": [".*test.*"] }
```
$$

---

## GCP Cloud Composer

GCP Cloud Composer exposes the Airflow webserver and authenticates requests using a Google Cloud **access token**.

### Get Your Webserver URL

1. Go to **GCP Console → Cloud Composer → your environment → Environment details**.
2. Copy the **Airflow webserver** URL. It looks like:
   ```
   https://XXXX-dot-REGION.composer.googleusercontent.com
   ```

### Get an Access Token

```bash
# For your personal gcloud account:
gcloud auth print-access-token

# For a service account key file:
gcloud auth activate-service-account --key-file=key.json
gcloud auth print-access-token
```

### Verify Connectivity

```bash
HOST="https://XXXX-dot-REGION.composer.googleusercontent.com"
TOKEN=$(gcloud auth print-access-token)

# Test API version endpoint
curl -H "Authorization: Bearer $TOKEN" "$HOST/api/v2/version"

# List DAGs
curl -H "Authorization: Bearer $TOKEN" "$HOST/api/v2/dags?limit=2"
```

### Production: Service Account Token Refresh

Access tokens expire in ~1 hour. For automated ingestion, use the `google-auth` library to refresh tokens:

```python
import google.auth
import google.auth.transport.requests

credentials, project = google.auth.default(
    scopes=["https://www.googleapis.com/auth/cloud-platform"]
)
credentials.refresh(google.auth.transport.requests.Request())
token = credentials.token
```

Grant the service account the following IAM role:
- `roles/composer.worker` — to access the Composer environment and call the Airflow API

---

## Example Ingestion Configuration

```yaml
source:
  type: airflowapi
  serviceName: cloud_composer_prod
  serviceConnection:
    config:
      type: AirflowApi
      hostPort: "https://XXXX-dot-us-east1.composer.googleusercontent.com"
      token: "<access-token-from-gcloud>"
      apiVersion: v2
      numberOfStatus: 10
      verifySSL: true
  sourceConfig:
    config:
      type: PipelineMetadata
      includeTags: true
sink:
  type: metadata-rest
  config: {}
workflowConfig:
  openMetadataServerConfig:
    hostPort: http://localhost:8585/api
    authProvider: openmetadata
    securityConfig:
      jwtToken: "<openmetadata-jwt-token>"
```

---

## Limitations

- **No lineage from inlets/outlets**: The Airflow REST API does not expose the serialized DAG structure (task-level inlets/outlets). Table-level lineage from `OMEntity` annotations is only available through the **Airflow** (database) connector or the **Airflow Lineage Backend**.
- **Token expiry**: Tokens must be refreshed for long-running or scheduled ingestion pipelines.
- **Private IP environments**: If your Cloud Composer environment uses a private IP, the webserver is not reachable from the public internet. You will need a VPN or to run ingestion from within the same VPC.
