---
title: lookerConnection
slug: /main-concepts/metadata-standard/schemas/entity/services/connections/dashboard/lookerconnection
---

# LookerConnection

*Looker Connection Config*

## Properties

- **`type`**: Service Type. Refer to *#/definitions/lookerType*. Default: `Looker`.
- **`clientId`** *(string)*: User's Client ID. This user should have privileges to read all the metadata in Looker.
- **`clientSecret`** *(string)*: User's Client Secret.
- **`hostPort`** *(string)*: URL to the Looker instance.
- **`gitCredentials`**: Credentials to extract the .lkml files from a repository. This is required to get all the lineage and definitions.
- **`supportsMetadataExtraction`**: Refer to *../connectionBasicType.json#/definitions/supportsMetadataExtraction*.
## Definitions

- **`lookerType`** *(string)*: Looker service type. Must be one of: `['Looker']`. Default: `Looker`.
- **`noGitCredentials`** *(object)*: Do not set any credentials. Note that credentials are required to extract .lkml views and their lineage. Cannot contain additional properties.


Documentation file automatically generated at 2023-07-07 05:50:35.981927.
