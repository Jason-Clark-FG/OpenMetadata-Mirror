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
Iceberg BigLake Catalog
"""
from pyiceberg.catalog import Catalog, load_rest

from metadata.generated.schema.entity.services.connections.database.iceberg.bigLakeCatalogConnection import (
    BigLakeCatalogConnection,
)
from metadata.generated.schema.entity.services.connections.database.iceberg.icebergCatalog import (
    IcebergCatalog,
)
from metadata.ingestion.source.database.iceberg.catalog.base import IcebergCatalogBase
from metadata.utils.credentials import set_google_credentials

BIGLAKE_REST_URI = "https://biglake.googleapis.com"


class IcebergBigLakeCatalog(IcebergCatalogBase):
    """Responsible for building a PyIceberg BigLake Catalog backed by GCS."""

    @classmethod
    def get_catalog(cls, catalog: IcebergCatalog) -> Catalog:
        """Returns a BigLake Catalog for the given connection and file storage.

        BigLake Metastore exposes an Iceberg REST catalog API.
        For more information, check the
            [Google Cloud documentation](https://cloud.google.com/bigquery/docs/iceberg-tables).
        """
        if not isinstance(catalog.connection, BigLakeCatalogConnection):
            raise RuntimeError(
                "'connection' is not an instance of 'BigLakeCatalogConnection'"
            )

        set_google_credentials(catalog.connection.gcpConfig)

        parameters = {
            "warehouse": catalog.warehouseLocation,
            "uri": BIGLAKE_REST_URI,
        }

        if catalog.connection.gcpConfig:
            parameters = {
                **parameters,
                **cls.get_fs_parameters(catalog.connection.gcpConfig),
            }

        return load_rest(catalog.name, parameters)
