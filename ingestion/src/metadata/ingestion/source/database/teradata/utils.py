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
Teradata SQLAlchemy Helper Methods
"""

from sqlalchemy.engine import reflection

from metadata.ingestion.source.database.teradata.queries import (
    TERADATA_ALL_COLUMN_COMMENTS,
    TERADATA_TABLE_COMMENTS,
)
from metadata.utils.logger import ingestion_logger
from metadata.utils.sqlalchemy_utils import (
    get_column_comment_wrapper,
    get_table_comment_wrapper,
)

logger = ingestion_logger()

_original_get_columns = None


@reflection.cache
def get_table_comment(
    self, connection, table_name, schema=None, **kw
):  # pylint: disable=unused-argument
    return get_table_comment_wrapper(
        self,
        connection,
        table_name=table_name,
        schema=schema,
        query=TERADATA_TABLE_COMMENTS,
    )


def get_columns(self, connection, table_name, schema=None, **kw):
    columns = _original_get_columns(self, connection, table_name, schema, **kw)
    try:
        for col in columns:
            col["comment"] = get_column_comment_wrapper(
                self,
                connection,
                query=TERADATA_ALL_COLUMN_COMMENTS,
                table_name=table_name,
                column_name=col["name"],
                schema=schema,
            )
    except Exception as exc:  # pylint: disable=broad-except
        logger.warning(
            f"Failed to fetch column comments for {schema}.{table_name}: {exc}"
        )
    return columns
