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

The Airflow API connector extracts metadata from Airflow using its **REST API**, with no direct database access required. This makes it ideal for managed Airflow environments like **GCP Cloud Composer** where the backend database is not accessible.

### Supported Versions

| Airflow Version | API Version |
|---|---|
| 2.x | v1 (`/api/v1`) |
| 3.x | v2 (`/api/v2`) |

For **self-hosted Airflow**, ensure the REST API auth backend is set in `airflow.cfg`:
```ini
[api]
auth_backends = airflow.api.auth.backend.basic_auth
```


### Lineage

This connector extracts metadata only. Lineage is handled via **OpenLineage** — configure Airflow to send OpenLineage events to OpenMetadata's `POST /api/v1/openlineage/lineage` endpoint.

## Connection Details

$$section
### Host And Port $(id="hostPort")

URL to the Airflow REST API. E.g., `http://localhost:8080` or `https://<composer-id>-dot-<region>.composer.googleusercontent.com` for GCP Cloud Composer.
$$

$$section
### Token $(id="token")

Bearer token for API authentication. This is the recommended authentication method.

- **Airflow 3.x**: Obtain a JWT from the `/auth/token` endpoint.
- **GCP Cloud Composer**: Use a GCP access token via `gcloud auth print-access-token`.
- **AWS MWAA**: Use a web login token via `aws mwaa create-cli-token --name <env-name>`.
$$

$$section
### Username $(id="username")

Username for Basic authentication to the Airflow API. Use this for Airflow 2.x deployments with the default auth backend.
$$

$$section
### Password $(id="password")

Password for Basic authentication to the Airflow API.
$$

$$section
### API Version $(id="apiVersion")

The Airflow REST API version to use:

- **auto** (default): Auto-detect by probing `/api/v2/version` then `/api/v1/version`.
- **v1**: Force Airflow 2.x API.
- **v2**: Force Airflow 3.x API.
$$

$$section
### Number Of Status $(id="numberOfStatus")

Number of past DAG runs to fetch for pipeline status history. Default: `10`.
$$

$$section
### Verify SSL $(id="verifySSL")

Whether to verify SSL certificates when connecting to the Airflow API. Default: `true`. Set to `false` for self-signed certificates.
$$
