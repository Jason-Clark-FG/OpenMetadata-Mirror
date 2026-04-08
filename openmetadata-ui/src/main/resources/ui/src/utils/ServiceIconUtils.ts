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

const SERVICE_ICON_LOADERS: Record<string, () => Promise<{ default: string }>> =
  {
    // Database services
    mysql: () => import('../assets/img/service-icon-sql.png'),
    sqlite: () => import('../assets/img/service-icon-sqlite.png'),
    mssql: () => import('../assets/img/service-icon-mssql.png'),
    redshift: () => import('../assets/img/service-icon-redshift.png'),
    bigquery: () => import('../assets/img/service-icon-query.png'),
    bigtable: () => import('../assets/img/service-icon-bigtable.png'),
    hive: () => import('../assets/img/service-icon-hive.png'),
    impala: () => import('../assets/img/service-icon-impala.png'),
    postgres: () => import('../assets/img/service-icon-post.png'),
    oracle: () => import('../assets/img/service-icon-oracle.png'),
    snowflake: () => import('../assets/img/service-icon-snowflakes.png'),
    athena: () => import('../assets/img/service-icon-athena.png'),
    presto: () => import('../assets/img/service-icon-presto.png'),
    trino: () => import('../assets/img/service-icon-trino.png'),
    glue: () => import('../assets/img/service-icon-glue.png'),
    mariadb: () => import('../assets/img/service-icon-mariadb.png'),
    vertica: () => import('../assets/img/service-icon-vertica.png'),
    azuresql: () => import('../assets/img/service-icon-azuresql.png'),
    clickhouse: () => import('../assets/img/service-icon-clickhouse.png'),
    databrick: () => import('../assets/img/service-icon-databrick.png'),
    unitycatalog: () => import('../assets/img/service-icon-unitycatalog.svg'),
    ibmdb2: () => import('../assets/img/service-icon-ibmdb2.png'),
    doris: () => import('../assets/img/service-icon-doris.png'),
    starrocks: () => import('../assets/img/service-icon-starrocks.png'),
    druid: () => import('../assets/img/service-icon-druid.png'),
    dynamodb: () => import('../assets/img/service-icon-dynamodb.png'),
    singlestore: () => import('../assets/img/service-icon-singlestore.png'),
    salesforce: () => import('../assets/img/service-icon-salesforce.png'),
    saphana: () => import('../assets/img/service-icon-sap-hana.png'),
    saperp: () => import('../assets/img/service-icon-sap-erp.png'),
    deltalake: () => import('../assets/img/service-icon-delta-lake.png'),
    pinot: () => import('../assets/img/service-icon-pinot.png'),
    datalake: () => import('../assets/img/service-icon-datalake.png'),
    exasol: () => import('../assets/img/service-icon-exasol.png'),
    mongodb: () => import('../assets/img/service-icon-mongodb.png'),
    cassandra: () => import('../assets/img/service-icon-cassandra.png'),
    couchbase: () => import('../assets/img/service-icon-couchbase.svg'),
    greenplum: () => import('../assets/img/service-icon-greenplum.png'),
    teradata: () => import('../assets/svg/teradata.svg'),
    cockroach: () => import('../assets/img/service-icon-cockroach.png'),
    timescale: () => import('../assets/img/service-icon-timescale.png'),
    burstiq: () => import('../assets/img/service-icon-burstiq.png'),
    sas: () => import('../assets/img/service-icon-sas.svg'),

    // Messaging services
    kafka: () => import('../assets/img/service-icon-kafka.png'),
    pubsub: () => import('../assets/svg/service-icon-pubsub.svg'),
    redpanda: () => import('../assets/img/service-icon-redpanda.png'),
    kinesis: () => import('../assets/img/service-icon-kinesis.png'),

    // Dashboard services
    superset: () => import('../assets/img/service-icon-superset.png'),
    looker: () => import('../assets/img/service-icon-looker.png'),
    tableau: () => import('../assets/img/service-icon-tableau.png'),
    redash: () => import('../assets/img/service-icon-redash.png'),
    metabase: () => import('../assets/img/service-icon-metabase.png'),
    powerbi: () => import('../assets/img/service-icon-power-bi.png'),
    sigma: () => import('../assets/img/service-icon-sigma.png'),
    mode: () => import('../assets/img/service-icon-mode.png'),
    domo: () => import('../assets/img/service-icon-domo.png'),
    quicksight: () => import('../assets/img/service-icon-quicksight.png'),
    qliksense: () => import('../assets/img/service-icon-qlik-sense.png'),
    lightdash: () => import('../assets/img/service-icon-lightdash.png'),
    microstrategy: () => import('../assets/img/service-icon-microstrategy.svg'),
    grafana: () => import('../assets/img/service-icon-grafana.png'),
    hex: () => import('../assets/svg/service-icon-hex.svg'),

    // Pipeline services
    airflow: () => import('../assets/img/service-icon-airflow.png'),
    airbyte: () => import('../assets/img/Airbyte.png'),
    dagster: () => import('../assets/img/service-icon-dagster.png'),
    dbt: () => import('../assets/img/service-icon-dbt.png'),
    fivetran: () => import('../assets/img/service-icon-fivetran.png'),
    nifi: () => import('../assets/img/service-icon-nifi.png'),
    spark: () => import('../assets/img/service-icon-spark.png'),
    spline: () => import('../assets/img/service-icon-spline.png'),
    flink: () => import('../assets/img/service-icon-flink.png'),
    openlineage: () => import('../assets/img/service-icon-openlineage.svg'),

    // ML Model services
    mlflow: () => import('../assets/svg/service-icon-mlflow.svg'),
    scikit: () => import('../assets/img/service-icon-scikit.png'),
    sagemaker: () => import('../assets/img/service-icon-sagemaker.png'),

    // Storage services
    amazons3: () => import('../assets/img/service-icon-amazon-s3.svg'),
    gcs: () => import('../assets/img/service-icon-gcs.png'),

    // Search services
    elasticsearch: () => import('../assets/svg/elasticsearch.svg'),
    opensearch: () => import('../assets/svg/open-search.svg'),

    // Metadata services
    amundsen: () => import('../assets/img/service-icon-amundsen.png'),
    atlas: () => import('../assets/img/service-icon-atlas.svg'),
    alationsink: () => import('../assets/img/service-icon-alation-sink.png'),

    // Drive services
    googledrive: () => import('../assets/svg/service-icon-google-drive.svg'),
    sftp: () => import('../assets/svg/service-icon-sftp.svg'),

    // Default icons
    defaultservice: () => import('../assets/svg/default-service-icon.svg'),
    databasedefault: () => import('../assets/svg/ic-custom-database.svg'),
    topicdefault: () => import('../assets/svg/topic.svg'),
    dashboarddefault: () => import('../assets/svg/dashboard.svg'),
    pipelinedefault: () => import('../assets/svg/pipeline.svg'),
    mlmodeldefault: () => import('../assets/svg/ic-custom-model.svg'),
    storagedefault: () => import('../assets/svg/ic-custom-storage.svg'),
    drivedefault: () => import('../assets/svg/ic-drive-service.svg'),
    customdrivedefault: () => import('../assets/svg/ic-custom-drive.svg'),
    searchdefault: () => import('../assets/svg/ic-custom-search.svg'),
    securitydefault: () => import('../assets/svg/security-safe.svg'),
    restservice: () => import('../assets/svg/ic-service-rest-api.svg'),
    logo: () => import('../assets/svg/logo-monogram.svg'),
    synapse: () => import('../assets/img/service-icon-synapse.png'),
  };

const iconCache = new Map<string, string>();

export const getServiceIcon = async (iconKey: string): Promise<string> => {
  const normalizedKey = iconKey.toLowerCase().replace(/[_-]/g, '');

  if (iconCache.has(normalizedKey)) {
    return iconCache.get(normalizedKey) as unknown as string;
  }

  const loader = SERVICE_ICON_LOADERS[normalizedKey];

  if (!loader) {
    const defaultIcon = await SERVICE_ICON_LOADERS.defaultservice();

    return defaultIcon.default;
  }

  const icon = await loader();
  iconCache.set(normalizedKey, icon.default);

  return icon.default;
};

export const getServiceIconSync = (iconKey: string): string | null => {
  const normalizedKey = iconKey.toLowerCase().replace(/[_-]/g, '');

  return iconCache.get(normalizedKey) ?? null;
};

export const preloadServiceIcons = async (
  iconKeys: string[]
): Promise<void> => {
  await Promise.all(iconKeys.map((key) => getServiceIcon(key)));
};
