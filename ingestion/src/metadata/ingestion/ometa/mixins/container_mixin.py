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
Mixin class containing Container specific methods

To be used by OpenMetadata class
"""
import base64
import traceback
from typing import Optional

from metadata.generated.schema.entity.data.container import Container
from metadata.generated.schema.entity.data.table import TableData
from metadata.ingestion.ometa.client import REST
from metadata.utils.logger import ometa_logger

logger = ometa_logger()


class OMetaContainerMixin:
    """
    OpenMetadata API methods related to Containers.

    To be inherited by OpenMetadata
    """

    client: REST

    def ingest_container_sample_data(
        self, container: Container, sample_data: TableData
    ) -> Optional[TableData]:
        """
        PUT sample data for a container

        :param container: Container Entity to update
        :param sample_data: Data to add
        """
        resp = None
        try:
            if sample_data and sample_data.rows:

                for row in sample_data.rows:
                    if not row:
                        continue
                    for col_idx, value in enumerate(row):
                        if isinstance(value, bytes):
                            try:
                                row[
                                    col_idx
                                ] = f"[base64]{base64.b64encode(value).decode('ascii', errors='ignore')}"
                            except Exception as _:
                                row[col_idx] = f"[binary]{value}"

            try:
                data = sample_data.model_dump_json()
            except Exception as _:
                logger.debug(traceback.format_exc())
                logger.warning(
                    f"Error serializing sample data for {container.fullyQualifiedName.root}"
                    " please check if the data is valid"
                )
                return None

            resp = self.client.put(
                f"{self.get_suffix(Container)}/{container.id.root}/sampleData",
                data=data,
            )
        except Exception as exc:
            logger.debug(traceback.format_exc())
            logger.warning(
                f"Error trying to PUT sample data for {container.fullyQualifiedName.root}: {exc}"
            )

        if resp:
            try:
                return TableData(**resp["sampleData"])
            except UnicodeError as err:
                logger.debug(traceback.format_exc())
                logger.warning(
                    f"Cannot parse response from {container.fullyQualifiedName.root} due to {err}"
                )

        return None
