# Airflow API

In this section, we provide guides and references to use the Airflow API connector.

## Requirements

The Airflow API connector extracts metadata from Airflow using its **REST API**, with no direct database access required. This makes it ideal for managed Airflow environments like **GCP Cloud Composer** where the backend database is not accessible.

### Supported Versions

| Airflow Version | API Version |
|---|---|
| 2.x | v1 (`/api/v1`) |
| 3.x | v2 (`/api/v2`) |

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
