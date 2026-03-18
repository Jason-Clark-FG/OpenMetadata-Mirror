#  Copyright 2025 Collate
#  Licensed under the Collate Community License, Version 1.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#  https://github.com/open-metadata/OpenMetadata/blob/main/ingestion/LICENSE
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.

"""
Iceberg GCS File System.
"""
from __future__ import annotations

import json

from pyiceberg.io import GCS_PROJECT_ID, GCS_TOKEN

from metadata.generated.schema.security.credentials.gcpCredentials import (
    GcpADC,
    GCPCredentials,
    GcpCredentialsPath,
)
from metadata.generated.schema.security.credentials.gcpValues import (
    GcpCredentialsValues,
)
from metadata.ingestion.source.database.iceberg.fs.base import (
    FileSystemConfig,
    IcebergFileSystemBase,
)
from metadata.utils.credentials import build_google_credentials_dict


class GcsFileSystem(IcebergFileSystemBase):
    """Responsible for returning a PyIceberg GCS FileSystem compatible configuration."""

    @classmethod
    def get_fs_params(cls, fs_config: FileSystemConfig) -> dict:
        """Returns the parameters expected by PyIceberg for Google Cloud Storage.

        For more information, check the [PyIceberg documentation](https://py.iceberg.apache.org/configuration/#google-cloud-storage).
        """
        if not isinstance(fs_config, GCPCredentials):
            raise RuntimeError(
                "FileSystem Configuration is not an instance of 'GCPCredentials'."
            )

        params = {}

        if isinstance(fs_config.gcpConfig, GcpCredentialsValues):
            credentials_dict = build_google_credentials_dict(
                fs_config.gcpConfig, single_project=True
            )
            params[GCS_TOKEN] = json.dumps(credentials_dict)

            project_id = fs_config.gcpConfig.projectId
            if project_id:
                params[GCS_PROJECT_ID] = (
                    project_id.root
                    if isinstance(project_id.root, str)
                    else project_id.root[0]
                )

        elif isinstance(fs_config.gcpConfig, GcpCredentialsPath):
            params[GCS_TOKEN] = str(fs_config.gcpConfig.path)

            project_id = fs_config.gcpConfig.projectId
            if project_id:
                params[GCS_PROJECT_ID] = (
                    project_id.root
                    if isinstance(project_id.root, str)
                    else project_id.root[0]
                )

        elif isinstance(fs_config.gcpConfig, GcpADC):
            project_id = fs_config.gcpConfig.projectId
            if project_id:
                params[GCS_PROJECT_ID] = (
                    project_id.root
                    if isinstance(project_id.root, str)
                    else project_id.root[0]
                )

        return params
