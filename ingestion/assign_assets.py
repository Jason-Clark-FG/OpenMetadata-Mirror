"""
Assign data assets to glossary terms so the Data view is populated.

Maps real sample assets (topics, dashboards, pipelines, ML models,
containers, charts, stored procedures, search indexes) to glossary
terms across all 3 glossaries based on semantic relevance.
"""

import json
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE_URL = "http://localhost:8585/api"
TOKEN = (
    "eyJraWQiOiJHYjM4OWEtOWY3Ni1nZGpzLWE5MmotMDI0MmJrOTQzNTYiLCJhbGciOiJS"
    "UzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJvcGVuLW1ldGFkYXRhLm9yZyIsInN1YiI6"
    "ImFkbWluIiwicm9sZXMiOlsiQWRtaW4iXSwiZW1haWwiOiJhZG1pbkBvcGVuLW1ldGFkYX"
    "RhLm9yZyIsImlzQm90IjpmYWxzZSwidG9rZW5UeXBlIjoiUEVSU09OQUxfQUNDRVNTIiwi"
    "dXNlcm5hbWUiOiJhZG1pbiIsInByZWZlcnJlZF91c2VybmFtZSI6ImFkbWluIiwiaWF0Ij"
    "oxNzc0NDU3NDQ5LCJleHAiOjE3NzUwNjIyNDl9.igOWbOgSIYrH5oKdA97rJeziiZ7aEPr"
    "6aygHCwtMGExrT_Z2MTNkf6Gizb8N4mUnjJh8XQZhLncGZDjFpctL_reaEtweo6wN8qSIj2"
    "0rahx5NEvgntErLq463WLkGetmTemAc8XJbGkLB-RiJWiMjv88js0GqEejpxPFzoEapwC9uE"
    "3dLaqud54P_iF_aT83T78opvmWeB9vlQ_6XP_LEGp765_5x7SFMUBrtBhHrz7pcw8lLMyCV"
    "1fyYrQbVI_yEtjYohiGGmnkVWwmOBsyk-gDmxfIMtMHHrTI4GXYkod8BM0UUmSUuM6PvRal"
    "ewBFZNZaE6ANPfHu-d_Z4XIvFw"
)
HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
}


def api(method, path, body=None, params=None):
    url = f"{BASE_URL}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            if resp.status == 204:
                return {}
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")[:300]
        print(f"    ERROR {e.code}: {method} {path} — {err_body}")
        return None
    except urllib.error.URLError as e:
        print(f"    CONNECTION ERROR: {e.reason}")
        return None


# ═══════════════════════════════════════════════════════════════════════════
# 1. Fetch all assets by type, return {fqn: {id, type}} map
# ═══════════════════════════════════════════════════════════════════════════
def fetch_assets():
    asset_types = [
        ("topic", "/v1/topics"),
        ("dashboard", "/v1/dashboards"),
        ("pipeline", "/v1/pipelines"),
        ("mlmodel", "/v1/mlmodels"),
        ("container", "/v1/containers"),
        ("chart", "/v1/charts"),
        ("storedProcedure", "/v1/storedProcedures"),
        ("searchIndex", "/v1/searchIndexes"),
    ]
    assets = {}
    for entity_type, endpoint in asset_types:
        result = api("GET", endpoint, params={"limit": 100, "fields": "displayName"})
        if result:
            for item in result.get("data", []):
                fqn = item["fullyQualifiedName"]
                assets[fqn] = {
                    "id": item["id"],
                    "type": entity_type,
                    "displayName": item.get("displayName", ""),
                }
    return assets


# ═══════════════════════════════════════════════════════════════════════════
# 2. Fetch glossary term IDs
# ═══════════════════════════════════════════════════════════════════════════
def fetch_term_ids():
    terms = {}
    for glossary_name in ["BusinessMetrics", "DataEngineering", "DataGovernance"]:
        # First get glossary ID
        glossary = api("GET", f"/v1/glossaries/name/{glossary_name}")
        if not glossary:
            print(f"  Glossary not found: {glossary_name}")
            continue
        glossary_id = glossary["id"]
        # Then list terms by glossary ID
        result = api(
            "GET", "/v1/glossaryTerms",
            params={"glossary": glossary_id, "limit": 100},
        )
        if result:
            for t in result.get("data", []):
                terms[t["fullyQualifiedName"]] = t["id"]
    return terms


# ═══════════════════════════════════════════════════════════════════════════
# 3. Define semantic mappings: glossary_term_fqn -> [asset_fqn, ...]
# ═══════════════════════════════════════════════════════════════════════════
# fmt: off
TERM_ASSET_MAP = {
    # ═══════════════════════════════════════════════════════════════════
    # BusinessMetrics glossary
    # ═══════════════════════════════════════════════════════════════════

    # Revenue — sales dashboards, order topics, sales topics
    "BusinessMetrics.Revenue": [
        "sample_superset.31",                     # Sales Dashboard
        "sample_kafka.sales",                     # sales topic
        "sample_kafka.orders",                    # orders topic
        "sample_looker.orders",                   # Orders Dashboard
    ],
    "BusinessMetrics.Revenue.GrossRevenue": [
        "sample_superset.31",                     # Sales Dashboard
        "sample_kafka.sales",                     # sales topic
    ],
    "BusinessMetrics.Revenue.NetRevenue": [
        "sample_superset.31",                     # Sales Dashboard
        "sample_superset.forecast_sales_performance",  # Sales Forecast dashboard
    ],
    "BusinessMetrics.Revenue.ARR": [
        "sample_superset.31",                     # Sales Dashboard
        "mlflow_svc.forecast_sales",              # Sales Forecast Predictions ML model
    ],
    "BusinessMetrics.Revenue.MRR": [
        "sample_kafka.sales",                     # sales topic (real-time revenue)
        "sample_airflow.real_time_metrics",        # Real-time Metrics pipeline
    ],
    "BusinessMetrics.Revenue.ARPU": [
        "sample_looker.customers",                # Customers dashboard
        "sample_dbtcloud.dbt_analytics_customers", # DBT Customer Analytics pipeline
    ],

    # Customer Metrics
    "BusinessMetrics.CustomerMetrics": [
        "sample_looker.customers",                # Customers dashboard
        "sample_kafka.customer_events",           # customer events topic
        "sample_kafka.customer_contacts",         # customer contacts topic
    ],
    "BusinessMetrics.CustomerMetrics.CAC": [
        "sample_dbtcloud.dbt_analytics_customers", # DBT Customer Analytics
        "sample_looker.customers",                # Customers dashboard
    ],
    "BusinessMetrics.CustomerMetrics.CLV": [
        "sample_dbtcloud.dbt_analytics_customers", # DBT Customer Analytics
        "mlflow_svc.customer_segmentation",       # Customer Segmentation ML model
        "sample_looker.customers",                # Customers dashboard
    ],
    "BusinessMetrics.CustomerMetrics.ChurnRate": [
        "sagemaker_svc.customer-churn-predictor", # Customer Churn Predictor ML model
        "sample_kafka.customer_events",           # customer events topic
    ],
    "BusinessMetrics.CustomerMetrics.RetentionRate": [
        "sagemaker_svc.customer-churn-predictor", # Churn predictor (inverse of retention)
        "sample_looker.customers",                # Customers dashboard
    ],
    "BusinessMetrics.CustomerMetrics.NPS": [
        "sample_kafka.customer_events",           # customer events (survey responses)
        "sample_looker.customers",                # Customers dashboard
    ],

    # Financial Metrics
    "BusinessMetrics.FinancialMetrics": [
        "s3_storage_sample.departments.finance",            # finance container
        "s3_storage_sample.departments.finance.expenditures", # expenditures container
    ],
    "BusinessMetrics.FinancialMetrics.GrossMargin": [
        "s3_storage_sample.departments.finance",            # finance data
        "sample_superset.31",                               # Sales Dashboard
    ],
    "BusinessMetrics.FinancialMetrics.NetProfitMargin": [
        "s3_storage_sample.departments.finance.expenditures", # expenditures data
    ],
    "BusinessMetrics.FinancialMetrics.EBITDA": [
        "s3_storage_sample.departments.finance",            # finance data
    ],
    "BusinessMetrics.FinancialMetrics.LTV_CAC_Ratio": [
        "sample_dbtcloud.dbt_analytics_customers",          # Customer analytics pipeline
        "mlflow_svc.customer_segmentation",                 # Segmentation model
    ],
    "BusinessMetrics.FinancialMetrics.BurnRate": [
        "s3_storage_sample.departments.finance.expenditures", # expenditures data
        "s3_storage_sample.transactions",                   # transactions container
    ],

    # Engagement Metrics
    "BusinessMetrics.EngagementMetrics": [
        "sample_kafka.customer_events",                     # customer events topic
        "sample_superset.33",                               # Slack Dashboard (engagement)
    ],
    "BusinessMetrics.EngagementMetrics.DAU": [
        "sample_airflow.real_time_metrics",                 # Real-time Metrics pipeline
        "sample_kafka.customer_events",                     # customer events
    ],
    "BusinessMetrics.EngagementMetrics.MAU": [
        "sample_airflow.real_time_metrics",                 # Real-time Metrics pipeline
        "sample_dbtcloud.dbt_analytics_customers",          # Customer Analytics
    ],
    "BusinessMetrics.EngagementMetrics.DAU_MAU_Ratio": [
        "sample_airflow.real_time_metrics",                 # Real-time Metrics pipeline
    ],
    "BusinessMetrics.EngagementMetrics.ConversionRate": [
        "sample_superset.31",                               # Sales Dashboard
        "sample_kafka.customer_events",                     # customer events
        "sample_looker.orders",                             # Orders Dashboard
    ],

    # ═══════════════════════════════════════════════════════════════════
    # DataEngineering glossary
    # ═══════════════════════════════════════════════════════════════════

    # Data Pipelines
    "DataEngineering.DataPipelines": [
        "sample_airflow.snowflake_etl",                     # Snowflake ETL
        "sample_airflow.hive_etl",                          # Hive ETL
        "sample_airflow.presto_etl",                        # Presto ETL
    ],
    "DataEngineering.DataPipelines.ETL": [
        "sample_airflow.snowflake_etl",                     # Snowflake ETL
        "sample_airflow.hive_etl",                          # Hive ETL
        "sample_airflow.presto_etl",                        # Presto ETL
        "sample_airflow.trino_etl",                         # Trino ETL
        "sample_airflow.dim_address_etl",                   # dim_address ETL
        "sample_airflow.dim_location_etl",                  # dim_location ETL
        "sample_airflow.dim_product_etl",                   # dim_product ETL
        "sample_airflow.dim_user_etl",                      # dim_user ETL
    ],
    "DataEngineering.DataPipelines.ELT": [
        "sample_dbtcloud.dbt_transform_orders",             # DBT Transform Orders
        "sample_dbtcloud.dbt_staging_shopify",              # DBT Staging Shopify
        "sample_dbtcloud.dbt_analytics_customers",          # DBT Customer Analytics
    ],
    "DataEngineering.DataPipelines.CDC": [
        "sample_kafka.shop_updates",                        # shop updates (change events)
        "sample_kafka.product_events",                      # product change events
    ],
    "DataEngineering.DataPipelines.DataIngestion": [
        "sample_airflow.snowflake_etl",                     # Snowflake ETL
        "sample_kafka.customer_contacts",                   # customer contacts topic
        "sample_kafka.address_book",                        # address book topic
    ],
    "DataEngineering.DataPipelines.Orchestration": [
        "sample_airflow.snowflake_etl",                     # Snowflake ETL (Airflow)
        "sample_airflow.hive_etl",                          # Hive ETL (Airflow)
        "sample_airflow.real_time_metrics",                 # Real-time Metrics (Airflow)
        "sample_airflow.ml_feature_pipeline",               # ML Feature Pipeline (Airflow)
    ],

    # Data Storage
    "DataEngineering.DataStorage": [
        "s3_storage_sample.departments",                    # departments container
        "s3_storage_sample.transactions",                   # transactions container
    ],
    "DataEngineering.DataStorage.DataLake": [
        "s3_storage_sample.departments",                    # departments (S3 = data lake)
        "s3_storage_sample.departments.engineering",        # engineering data
        "s3_storage_sample.departments.media",              # media data
        "s3_storage_sample.transactions",                   # transactions
    ],
    "DataEngineering.DataStorage.DataWarehouse": [
        "sample_airflow.snowflake_etl",                     # loads into Snowflake DWH
    ],

    # Data Quality
    "DataEngineering.DataQuality": [
        "sample_dbtcloud.dbt_test_data_quality",            # DBT Data Quality Tests
    ],
    "DataEngineering.DataQuality.DataAccuracy": [
        "sample_dbtcloud.dbt_test_data_quality",            # DBT Data Quality Tests
    ],
    "DataEngineering.DataQuality.DataCompleteness": [
        "sample_dbtcloud.dbt_test_data_quality",            # DBT Data Quality Tests
    ],
    "DataEngineering.DataQuality.DataLineage": [
        "sample_dbtcloud.dbt_transform_orders",             # DBT lineage from transforms
        "sample_dbtcloud.dbt_staging_shopify",              # DBT lineage from staging
    ],
    "DataEngineering.DataQuality.SchemaEvolution": [
        "sample_kafka.avro_record",                         # Avro schema evolution
        "sample_kafka.json_schema_record",                  # JSON schema evolution
    ],

    # Data Processing
    "DataEngineering.DataProcessing": [
        "sample_airflow.real_time_metrics",                 # Real-time processing
        "sample_airflow.hive_etl",                          # Batch processing
    ],
    "DataEngineering.DataProcessing.BatchProcessing": [
        "sample_airflow.hive_etl",                          # Hive = batch
        "sample_airflow.presto_etl",                        # Presto = batch
        "sample_airflow.trino_etl",                         # Trino = batch
        "sample_dbtcloud.dbt_transform_orders",             # DBT transforms = batch
    ],
    "DataEngineering.DataProcessing.StreamProcessing": [
        "sample_airflow.real_time_metrics",                 # Real-time Metrics
        "sample_kafka.customer_events",                     # streaming events
        "sample_kafka.product_events",                      # streaming events
        "sample_kafka.shop_updates",                        # streaming updates
    ],
    "DataEngineering.DataProcessing.Materialization": [
        "sample_dbtcloud.dbt_transform_orders",             # DBT materialized models
        "sample_dbtcloud.dbt_analytics_customers",          # DBT materialized views
    ],

    # ═══════════════════════════════════════════════════════════════════
    # DataGovernance glossary
    # ═══════════════════════════════════════════════════════════════════

    # Privacy
    "DataGovernance.Privacy": [
        "sample_kafka.customer_contacts",                   # PII in customer contacts
        "sample_kafka.address_book",                        # PII in address book
    ],
    "DataGovernance.Privacy.PII": [
        "sample_kafka.customer_contacts",                   # customer PII
        "sample_kafka.address_book",                        # address PII
        "sample_kafka.customer_events",                     # user behavior PII
        "sample_airflow.dim_user_etl",                      # user dimension ETL
    ],
    "DataGovernance.Privacy.GDPR": [
        "sample_kafka.customer_contacts",                   # governed by GDPR
        "sample_kafka.customer_events",                     # governed by GDPR
        "sample_airflow.dim_user_etl",                      # user data pipeline
    ],
    "DataGovernance.Privacy.DataAnonymization": [
        "sample_kafka.customer_contacts",                   # needs anonymization
        "s3_storage_sample.departments.engineering",        # anonymized datasets
    ],
    "DataGovernance.Privacy.DataMasking": [
        "sample_kafka.address_book",                        # masked in non-prod
        "sample_airflow.dim_address_etl",                   # address masking in ETL
    ],
    "DataGovernance.Privacy.ConsentManagement": [
        "sample_kafka.customer_events",                     # consent tracked in events
    ],

    # Stewardship
    "DataGovernance.Stewardship": [
        "elasticsearch_sample.table_search_index",          # search index = catalog
    ],
    "DataGovernance.Stewardship.DataCatalog": [
        "elasticsearch_sample.table_search_index",          # search index powers catalog
    ],
    "DataGovernance.Stewardship.DataContract": [
        "sample_kafka.avro_record",                         # Avro = schema contract
        "sample_kafka.json_schema_record",                  # JSON Schema = contract
        "sample_dbtcloud.dbt_test_data_quality",            # quality guarantees
    ],
    "DataGovernance.Stewardship.MetadataManagement": [
        "elasticsearch_sample.table_search_index",          # metadata search
    ],

    # Classification
    "DataGovernance.Classification": [
        "s3_storage_sample.departments",                    # classified by department
    ],
    "DataGovernance.Classification.SensitivityLevel": [
        "sample_kafka.customer_contacts",                   # Confidential
        "s3_storage_sample.departments.finance",            # Restricted
        "s3_storage_sample.departments.finance.expenditures", # Restricted
    ],
    "DataGovernance.Classification.DataRetention": [
        "s3_storage_sample.transactions",                   # retention policies
        "s3_storage_sample.departments.finance",            # financial data retention
    ],
    "DataGovernance.Classification.PHI": [
        "sample_kafka.customer_contacts",                   # may contain health info
    ],

    # Access Control
    "DataGovernance.AccessControl": [
        "s3_storage_sample.departments",                    # department-level access
        "s3_storage_sample.departments.finance",            # restricted access
    ],
    "DataGovernance.AccessControl.RBAC": [
        "s3_storage_sample.departments",                    # role-based department access
        "s3_storage_sample.departments.finance",            # finance role
        "s3_storage_sample.departments.engineering",        # engineering role
    ],
    "DataGovernance.AccessControl.ColumnLevelSecurity": [
        "sample_kafka.customer_contacts",                   # mask PII columns
    ],
    "DataGovernance.AccessControl.RowLevelSecurity": [
        "s3_storage_sample.departments",                    # filter by department
    ],

    # Stored procedures mapped to relevant terms
    "DataEngineering.DataPipelines.ETL": [
        "sample_data.ecommerce_db.shopify.transform_and_load_data",
        "sample_data.ecommerce_db.shopify.update_dim_address_clean_from_dim_address",
        "sample_data.ecommerce_db.shopify.update_dim_address_table",
        "sample_data.ecommerce_db.shopify.update_fact_order_from_raw_order",
    ],

    # ML models to relevant terms
    "BusinessMetrics.EngagementMetrics": [
        "mlflow_svc.eta_predictions",                       # ETA = engagement prediction
    ],
    "DataEngineering.DataProcessing": [
        "sample_airflow.ml_feature_pipeline",               # ML feature processing
        "sample_dbtcloud.dbt_ml_features",                  # ML feature generation
    ],
}
# fmt: on


# ═══════════════════════════════════════════════════════════════════════════
# 4. Execute assignments
# ═══════════════════════════════════════════════════════════════════════════
def assign_assets(term_ids, assets):
    print("\n=== Assigning Assets to Glossary Terms ===")

    # Merge duplicate term keys (some terms appear twice in the map)
    merged = {}
    for term_fqn, asset_fqns in TERM_ASSET_MAP.items():
        merged.setdefault(term_fqn, []).extend(asset_fqns)

    success_count = 0
    skip_count = 0

    for term_fqn, asset_fqns in sorted(merged.items()):
        term_id = term_ids.get(term_fqn)
        if not term_id:
            print(f"  SKIP term (not found): {term_fqn}")
            skip_count += 1
            continue

        # Build asset references
        refs = []
        for afqn in asset_fqns:
            asset = assets.get(afqn)
            if asset:
                refs.append({"id": asset["id"], "type": asset["type"]})
            else:
                print(f"    SKIP asset (not found): {afqn}")

        if not refs:
            continue

        # Deduplicate
        seen = set()
        unique_refs = []
        for r in refs:
            key = (r["id"], r["type"])
            if key not in seen:
                seen.add(key)
                unique_refs.append(r)

        body = {"assets": unique_refs, "dryRun": False}
        result = api("PUT", f"/v1/glossaryTerms/{term_id}/assets/add", body)
        if result is not None:
            count = len(unique_refs)
            short_name = term_fqn.split(".")[-1]
            asset_names = [a.split(".")[-1] for a in asset_fqns if a in assets]
            print(f"  + {term_fqn} <- {count} assets ({', '.join(asset_names[:4])}{'...' if len(asset_names) > 4 else ''})")
            success_count += 1
        else:
            print(f"  FAIL: {term_fqn}")

    print(f"\n  Assigned assets to {success_count} terms ({skip_count} skipped)")


# ═══════════════════════════════════════════════════════════════════════════
# 5. Print summary
# ═══════════════════════════════════════════════════════════════════════════
def print_summary(term_ids):
    print("\n" + "=" * 60)
    print("ASSET ASSIGNMENT SUMMARY")
    print("=" * 60)

    # Check a few terms for their asset counts
    samples = [
        "BusinessMetrics.Revenue",
        "BusinessMetrics.CustomerMetrics.CLV",
        "BusinessMetrics.CustomerMetrics.ChurnRate",
        "DataEngineering.DataPipelines.ETL",
        "DataEngineering.DataProcessing.StreamProcessing",
        "DataGovernance.Privacy.PII",
        "DataGovernance.AccessControl.RBAC",
    ]
    for fqn in samples:
        tid = term_ids.get(fqn)
        if tid:
            result = api(
                "GET",
                f"/v1/glossaryTerms/{tid}/assets",
                params={"limit": 20},
            )
            if result:
                total = result.get("paging", {}).get("total", 0)
                asset_names = [
                    a.get("displayName") or a.get("name", "?")
                    for a in result.get("data", [])
                ]
                short = fqn.split(".")[-1]
                print(f"\n  {fqn} ({total} assets):")
                for name in asset_names:
                    print(f"    - {name}")


# ═══════════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    print("Asset-to-GlossaryTerm Assignment")
    print("=" * 50)

    health = api("GET", "/v1/system/version")
    if not health:
        print("ERROR: Cannot connect to OpenMetadata")
        sys.exit(1)
    print(f"Connected to OpenMetadata {health.get('version', '?')}")

    print("\nFetching assets...")
    assets = fetch_assets()
    print(f"  Found {len(assets)} assets")

    print("\nFetching glossary terms...")
    term_ids = fetch_term_ids()
    print(f"  Found {len(term_ids)} terms")

    assign_assets(term_ids, assets)
    print_summary(term_ids)
