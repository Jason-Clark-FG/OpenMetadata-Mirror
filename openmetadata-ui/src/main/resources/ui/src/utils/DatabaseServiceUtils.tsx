/*
 *  Copyright 2022 Collate.
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *  http://www.apache.org/licenses/LICENSE-2.0
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

import { cloneDeep } from 'lodash';
import { NavigateFunction } from 'react-router-dom';
import { ReactComponent as ExportIcon } from '../assets/svg/ic-export.svg';
import { ReactComponent as ImportIcon } from '../assets/svg/ic-import.svg';
import { ManageButtonItemLabel } from '../components/common/ManageButtonContentItem/ManageButtonContentItem.component';
import { useEntityExportModalProvider } from '../components/Entity/EntityExportModalProvider/EntityExportModalProvider.component';
import { ExportTypes } from '../constants/Export.constants';
import { COMMON_UI_SCHEMA } from '../constants/ServiceUISchema.constant';
import { OperationPermission } from '../context/PermissionProvider/PermissionProvider.interface';
import { EntityType } from '../enums/entity.enum';
import { DatabaseServiceType } from '../generated/entity/services/databaseService';
import { exportDatabaseServiceDetailsInCSV } from '../rest/serviceAPI';
import { getEntityImportPath } from './EntityUtils';
import { t } from './i18next/LocalUtil';

const DATABASE_CONNECTION_SCHEMAS: Record<
  DatabaseServiceType,
  () => Promise<{ default: Record<string, unknown> }>
> = {
  [DatabaseServiceType.Athena]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/athenaConnection.json'
    ),
  [DatabaseServiceType.AzureSQL]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/azureSQLConnection.json'
    ),
  [DatabaseServiceType.BigQuery]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/bigQueryConnection.json'
    ),
  [DatabaseServiceType.BigTable]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/bigTableConnection.json'
    ),
  [DatabaseServiceType.Clickhouse]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/clickhouseConnection.json'
    ),
  [DatabaseServiceType.Cockroach]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/cockroachConnection.json'
    ),
  [DatabaseServiceType.CustomDatabase]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/customDatabaseConnection.json'
    ),
  [DatabaseServiceType.Databricks]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/databricksConnection.json'
    ),
  [DatabaseServiceType.Datalake]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/datalakeConnection.json'
    ),
  [DatabaseServiceType.Db2]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/db2Connection.json'
    ),
  [DatabaseServiceType.DeltaLake]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/deltaLakeConnection.json'
    ),
  [DatabaseServiceType.Doris]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/dorisConnection.json'
    ),
  [DatabaseServiceType.Druid]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/druidConnection.json'
    ),
  [DatabaseServiceType.DynamoDB]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/dynamoDBConnection.json'
    ),
  [DatabaseServiceType.Glue]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/glueConnection.json'
    ),
  [DatabaseServiceType.Hive]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/hiveConnection.json'
    ),
  [DatabaseServiceType.Impala]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/impalaConnection.json'
    ),
  [DatabaseServiceType.MariaDB]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/mariaDBConnection.json'
    ),
  [DatabaseServiceType.Mssql]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/mssqlConnection.json'
    ),
  [DatabaseServiceType.Mysql]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/mysqlConnection.json'
    ),
  [DatabaseServiceType.Oracle]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/oracleConnection.json'
    ),
  [DatabaseServiceType.PinotDB]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/pinotDBConnection.json'
    ),
  [DatabaseServiceType.Postgres]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/postgresConnection.json'
    ),
  [DatabaseServiceType.Presto]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/prestoConnection.json'
    ),
  [DatabaseServiceType.Redshift]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/redshiftConnection.json'
    ),
  [DatabaseServiceType.Salesforce]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/salesforceConnection.json'
    ),
  [DatabaseServiceType.SAPHana]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/sapHanaConnection.json'
    ),
  [DatabaseServiceType.SingleStore]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/singleStoreConnection.json'
    ),
  [DatabaseServiceType.Snowflake]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/snowflakeConnection.json'
    ),
  [DatabaseServiceType.SQLite]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/sqliteConnection.json'
    ),
  [DatabaseServiceType.Synapse]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/synapseConnection.json'
    ),
  [DatabaseServiceType.Teradata]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/teradataConnection.json'
    ),
  [DatabaseServiceType.Trino]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/trinoConnection.json'
    ),
  [DatabaseServiceType.UnityCatalog]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/unityCatalogConnection.json'
    ),
  [DatabaseServiceType.Vertica]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/verticaConnection.json'
    ),
  [DatabaseServiceType.MongoDB]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/mongoDBConnection.json'
    ),
  [DatabaseServiceType.Couchbase]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/couchbaseConnection.json'
    ),
  [DatabaseServiceType.Greenplum]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/greenplumConnection.json'
    ),
  [DatabaseServiceType.DomoDatabase]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/domoDatabaseConnection.json'
    ),
  [DatabaseServiceType.Cassandra]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/cassandraConnection.json'
    ),
  [DatabaseServiceType.Exasol]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/exasolConnection.json'
    ),
  [DatabaseServiceType.SapErp]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/sapErpConnection.json'
    ),
  [DatabaseServiceType.Sas]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/sasConnection.json'
    ),
  [DatabaseServiceType.StarRocks]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/starrocksConnection.json'
    ),
  [DatabaseServiceType.Timescale]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/timescaleConnection.json'
    ),
  [DatabaseServiceType.BurstIQ]: () =>
    import(
      '../jsons/connectionSchemas/connections/database/burstIQConnection.json'
    ),
};

export const getDatabaseConfig = async (type: DatabaseServiceType) => {
  const uiSchema = { ...COMMON_UI_SCHEMA };
  const loaderFn = DATABASE_CONNECTION_SCHEMAS[type];

  if (!loaderFn) {
    return cloneDeep({ schema: {}, uiSchema });
  }

  const schema = (await loaderFn()).default;

  return cloneDeep({ schema, uiSchema });
};

export const ExtraDatabaseServiceDropdownOptions = (
  fqn: string,
  permission: OperationPermission,
  deleted: boolean,
  navigate: NavigateFunction
) => {
  const { showModal } = useEntityExportModalProvider();
  const { ViewAll, EditAll } = permission;

  return [
    ...(EditAll && !deleted
      ? [
          {
            label: (
              <ManageButtonItemLabel
                description={t('message.import-entity-help', {
                  entity: t('label.entity-service', {
                    entity: t('label.database'),
                  }),
                })}
                icon={ImportIcon}
                id="import-button"
                name={t('label.import')}
                onClick={() =>
                  navigate(
                    getEntityImportPath(EntityType.DATABASE_SERVICE, fqn)
                  )
                }
              />
            ),
            key: 'import-button',
          },
        ]
      : []),
    ...(ViewAll && !deleted
      ? [
          {
            label: (
              <ManageButtonItemLabel
                description={t('message.export-entity-help', {
                  entity: t('label.entity-service', {
                    entity: t('label.database'),
                  }),
                })}
                icon={ExportIcon}
                id="export-button"
                name={t('label.export')}
                onClick={() =>
                  showModal({
                    name: fqn,
                    onExport: exportDatabaseServiceDetailsInCSV,
                    exportTypes: [ExportTypes.CSV],
                  })
                }
              />
            ),
            key: 'export-button',
          },
        ]
      : []),
  ];
};
