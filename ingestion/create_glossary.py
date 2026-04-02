"""
Create 3 real-world glossaries with cross-glossary typed relationships.

Glossaries:
  1. BusinessMetrics   — Revenue, customer, financial, engagement KPIs
  2. DataEngineering   — Data infrastructure, pipelines, storage, quality concepts
  3. DataGovernance    — Privacy, compliance, stewardship, classification concepts

Cross-glossary links show how business metrics depend on data infrastructure,
and how governance policies regulate both.
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

# Global term key -> UUID mapping (key = "GlossaryName.TermName")
term_ids = {}


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
        print(f"  ERROR {e.code}: {method} {path}")
        err_body = e.read().decode("utf-8", errors="replace")[:500]
        print(f"  {err_body}")
        return None
    except urllib.error.URLError as e:
        print(f"  CONNECTION ERROR: {e.reason}")
        return None


# ═══════════════════════════════════════════════════════════════════════════
# 1. Custom relation types
# ═══════════════════════════════════════════════════════════════════════════
def add_custom_relation_types():
    print("\n=== Adding custom relation types ===")
    settings = api("GET", "/v1/system/settings/glossaryTermRelationSettings")
    if not settings:
        print("  Could not fetch settings — skipping")
        return

    raw = settings.get("config_value", "{}")
    config = json.loads(raw) if isinstance(raw, str) else raw
    existing = {rt["name"] for rt in config.get("relationTypes", [])}

    custom = [
        {
            "name": "dependsOn",
            "displayName": "Depends On",
            "description": "This concept depends on or requires the target for computation or interpretation.",
            "inverseRelation": "requiredBy",
            "rdfPredicate": "https://open-metadata.org/ontology/dependsOn",
            "cardinality": "MANY_TO_MANY",
            "isSymmetric": False,
            "isTransitive": True,
            "isCrossGlossaryAllowed": True,
            "category": "associative",
            "isSystemDefined": False,
            "color": "#52c41a",
        },
        {
            "name": "requiredBy",
            "displayName": "Required By",
            "description": "This concept is required by the target for computation or interpretation.",
            "inverseRelation": "dependsOn",
            "rdfPredicate": "https://open-metadata.org/ontology/requiredBy",
            "cardinality": "MANY_TO_MANY",
            "isSymmetric": False,
            "isTransitive": True,
            "isCrossGlossaryAllowed": True,
            "category": "associative",
            "isSystemDefined": False,
            "color": "#73d13d",
        },
        {
            "name": "governedBy",
            "displayName": "Governed By",
            "description": "This concept is regulated or governed by the target policy or standard.",
            "inverseRelation": "governs",
            "rdfPredicate": "https://open-metadata.org/ontology/governedBy",
            "cardinality": "MANY_TO_MANY",
            "isSymmetric": False,
            "isTransitive": False,
            "isCrossGlossaryAllowed": True,
            "category": "associative",
            "isSystemDefined": False,
            "color": "#722ed1",
        },
        {
            "name": "governs",
            "displayName": "Governs",
            "description": "This policy or standard regulates the target concept.",
            "inverseRelation": "governedBy",
            "rdfPredicate": "https://open-metadata.org/ontology/governs",
            "cardinality": "MANY_TO_MANY",
            "isSymmetric": False,
            "isTransitive": False,
            "isCrossGlossaryAllowed": True,
            "category": "associative",
            "isSystemDefined": False,
            "color": "#9254de",
        },
        {
            "name": "indicatorOf",
            "displayName": "Indicator Of",
            "description": "This metric is a leading or lagging indicator that predicts or reflects the target metric.",
            "inverseRelation": "indicatedBy",
            "rdfPredicate": "https://open-metadata.org/ontology/indicatorOf",
            "cardinality": "MANY_TO_MANY",
            "isSymmetric": False,
            "isTransitive": False,
            "isCrossGlossaryAllowed": True,
            "category": "associative",
            "isSystemDefined": False,
            "color": "#13c2c2",
        },
        {
            "name": "indicatedBy",
            "displayName": "Indicated By",
            "description": "This metric is predicted or reflected by the target indicator metric.",
            "inverseRelation": "indicatorOf",
            "rdfPredicate": "https://open-metadata.org/ontology/indicatedBy",
            "cardinality": "MANY_TO_MANY",
            "isSymmetric": False,
            "isTransitive": False,
            "isCrossGlossaryAllowed": True,
            "category": "associative",
            "isSystemDefined": False,
            "color": "#36cfc9",
        },
        {
            "name": "managedBy",
            "displayName": "Managed By",
            "description": "This data asset or process is managed or overseen by the target role or function.",
            "inverseRelation": "manages",
            "rdfPredicate": "https://open-metadata.org/ontology/managedBy",
            "cardinality": "MANY_TO_MANY",
            "isSymmetric": False,
            "isTransitive": False,
            "isCrossGlossaryAllowed": True,
            "category": "associative",
            "isSystemDefined": False,
            "color": "#1890ff",
        },
        {
            "name": "manages",
            "displayName": "Manages",
            "description": "This role or function manages or oversees the target data asset or process.",
            "inverseRelation": "managedBy",
            "rdfPredicate": "https://open-metadata.org/ontology/manages",
            "cardinality": "MANY_TO_MANY",
            "isSymmetric": False,
            "isTransitive": False,
            "isCrossGlossaryAllowed": True,
            "category": "associative",
            "isSystemDefined": False,
            "color": "#40a9ff",
        },
        {
            "name": "implementedBy",
            "displayName": "Implemented By",
            "description": "This concept or policy is technically implemented or enforced by the target system or process.",
            "inverseRelation": "implements",
            "rdfPredicate": "https://open-metadata.org/ontology/implementedBy",
            "cardinality": "MANY_TO_MANY",
            "isSymmetric": False,
            "isTransitive": False,
            "isCrossGlossaryAllowed": True,
            "category": "associative",
            "isSystemDefined": False,
            "color": "#597ef7",
        },
        {
            "name": "implements",
            "displayName": "Implements",
            "description": "This system or process technically implements or enforces the target concept or policy.",
            "inverseRelation": "implementedBy",
            "rdfPredicate": "https://open-metadata.org/ontology/implements",
            "cardinality": "MANY_TO_MANY",
            "isSymmetric": False,
            "isTransitive": False,
            "isCrossGlossaryAllowed": True,
            "category": "associative",
            "isSystemDefined": False,
            "color": "#85a5ff",
        },
        {
            "name": "replacedBy",
            "displayName": "Replaced By",
            "description": "This term has been superseded by the target.",
            "inverseRelation": "replaces",
            "rdfPredicate": "https://open-metadata.org/ontology/replacedBy",
            "cardinality": "MANY_TO_ONE",
            "isSymmetric": False,
            "isTransitive": False,
            "isCrossGlossaryAllowed": True,
            "category": "associative",
            "isSystemDefined": False,
            "color": "#fa8c16",
        },
        {
            "name": "replaces",
            "displayName": "Replaces",
            "description": "This term supersedes or replaces the target.",
            "inverseRelation": "replacedBy",
            "rdfPredicate": "https://open-metadata.org/ontology/replaces",
            "cardinality": "ONE_TO_MANY",
            "isSymmetric": False,
            "isTransitive": False,
            "isCrossGlossaryAllowed": True,
            "category": "associative",
            "isSystemDefined": False,
            "color": "#ffa940",
        },
    ]

    for ct in custom:
        if ct["name"] not in existing:
            config.setdefault("relationTypes", []).append(ct)
            print(f"  + {ct['name']}")
        else:
            print(f"  ~ {ct['name']} (exists)")

    api(
        "PUT",
        "/v1/system/settings",
        {"config_type": "glossaryTermRelationSettings", "config_value": config},
    )
    print("  Settings saved")


# ═══════════════════════════════════════════════════════════════════════════
# 2. Glossary & term definitions
# ═══════════════════════════════════════════════════════════════════════════
GLOSSARIES = [
    {
        "name": "BusinessMetrics",
        "displayName": "Business Metrics",
        "description": (
            "Key performance indicators and business metrics used across the "
            "organization for revenue tracking, customer analytics, financial "
            "reporting, and product engagement measurement."
        ),
    },
    {
        "name": "DataEngineering",
        "displayName": "Data Engineering",
        "description": (
            "Data infrastructure, pipeline, storage, and quality concepts. "
            "Covers the technical foundations that power analytics and business "
            "metrics computation."
        ),
    },
    {
        "name": "DataGovernance",
        "displayName": "Data Governance",
        "description": (
            "Privacy, compliance, data stewardship, and classification standards. "
            "Defines the policies and frameworks that regulate how data is collected, "
            "stored, processed, and used across the organization."
        ),
    },
]

# fmt: off
TERMS = {
    # ═══════════════════════════════════════════════════════════════════
    # GLOSSARY 1: Business Metrics
    # ═══════════════════════════════════════════════════════════════════
    "BusinessMetrics": [
        # Top-level categories
        {"name": "Revenue", "displayName": "Revenue",
         "description": "The total income generated from normal business operations. Revenue is the top line of an income statement.",
         "synonyms": ["Income", "Sales", "Turnover"]},
        {"name": "CustomerMetrics", "displayName": "Customer Metrics",
         "description": "Metrics that measure customer behavior, acquisition, retention, and value to the business."},
        {"name": "FinancialMetrics", "displayName": "Financial Metrics",
         "description": "Key financial indicators measuring profitability, efficiency, and financial health."},
        {"name": "EngagementMetrics", "displayName": "Engagement Metrics",
         "description": "Metrics measuring how actively users interact with a product or service."},

        # Revenue children
        {"name": "GrossRevenue", "displayName": "Gross Revenue", "parent": "Revenue",
         "description": "Total sales before deductions (returns, discounts, allowances). Formula: Sum of all sales transactions.",
         "synonyms": ["Gross Sales", "Total Revenue"]},
        {"name": "NetRevenue", "displayName": "Net Revenue", "parent": "Revenue",
         "description": "Revenue after deducting returns, allowances, and discounts. Formula: Gross Revenue - Returns - Discounts.",
         "synonyms": ["Net Sales"]},
        {"name": "ARR", "displayName": "Annual Recurring Revenue (ARR)", "parent": "Revenue",
         "description": "Annualized value of recurring subscription revenue. Formula: MRR x 12.",
         "synonyms": ["Annualized Recurring Revenue"]},
        {"name": "MRR", "displayName": "Monthly Recurring Revenue (MRR)", "parent": "Revenue",
         "description": "Predictable recurring revenue earned each month from subscriptions. Formula: ARR / 12.",
         "synonyms": ["Monthly Subscription Revenue"]},
        {"name": "ARPU", "displayName": "Average Revenue Per User (ARPU)", "parent": "Revenue",
         "description": "Average revenue generated per user over a period. Formula: Total Revenue / Number of Users.",
         "synonyms": ["ARPA"]},

        # Customer Metrics children
        {"name": "CAC", "displayName": "Customer Acquisition Cost (CAC)", "parent": "CustomerMetrics",
         "description": "Total cost of acquiring a new customer. Formula: Total Sales & Marketing Spend / New Customers.",
         "synonyms": ["Acquisition Cost"]},
        {"name": "CLV", "displayName": "Customer Lifetime Value (CLV)", "parent": "CustomerMetrics",
         "description": "Predicted total revenue from a customer over the entire relationship. Formula: ARPU / Churn Rate.",
         "synonyms": ["LTV", "Lifetime Value", "CLTV"]},
        {"name": "ChurnRate", "displayName": "Churn Rate", "parent": "CustomerMetrics",
         "description": "Percentage of customers who stop using a product during a period. Formula: (Lost / Start) x 100.",
         "synonyms": ["Attrition Rate"]},
        {"name": "RetentionRate", "displayName": "Retention Rate", "parent": "CustomerMetrics",
         "description": "Percentage of customers who continue using a product over time. Formula: 1 - Churn Rate.",
         "synonyms": ["Customer Retention Rate"]},
        {"name": "NPS", "displayName": "Net Promoter Score (NPS)", "parent": "CustomerMetrics",
         "description": "Customer loyalty metric on a 0-10 scale. Formula: % Promoters (9-10) - % Detractors (0-6)."},

        # Financial Metrics children
        {"name": "GrossMargin", "displayName": "Gross Margin", "parent": "FinancialMetrics",
         "description": "Revenue percentage remaining after COGS. Formula: ((Revenue - COGS) / Revenue) x 100.",
         "synonyms": ["Gross Profit Margin"]},
        {"name": "NetProfitMargin", "displayName": "Net Profit Margin", "parent": "FinancialMetrics",
         "description": "Revenue percentage remaining after all expenses. Formula: (Net Income / Revenue) x 100.",
         "synonyms": ["Profit Margin", "Net Margin"]},
        {"name": "EBITDA", "displayName": "EBITDA", "parent": "FinancialMetrics",
         "description": "Earnings Before Interest, Taxes, Depreciation, and Amortization. Measures operating profitability."},
        {"name": "LTV_CAC_Ratio", "displayName": "LTV:CAC Ratio", "parent": "FinancialMetrics",
         "description": "Ratio of customer lifetime value to acquisition cost. Healthy SaaS target: 3:1+. Formula: CLV / CAC."},
        {"name": "BurnRate", "displayName": "Burn Rate", "parent": "FinancialMetrics",
         "description": "Rate at which a company spends cash reserves monthly. Formula: (Start Cash - End Cash) / Months.",
         "synonyms": ["Cash Burn Rate"]},

        # Engagement Metrics children
        {"name": "DAU", "displayName": "Daily Active Users (DAU)", "parent": "EngagementMetrics",
         "description": "Unique users engaging with the product on a given day."},
        {"name": "MAU", "displayName": "Monthly Active Users (MAU)", "parent": "EngagementMetrics",
         "description": "Unique users engaging with the product within a 30-day window."},
        {"name": "DAU_MAU_Ratio", "displayName": "DAU/MAU Ratio (Stickiness)", "parent": "EngagementMetrics",
         "description": "Ratio measuring product stickiness. Formula: DAU / MAU. Above 0.2 is good.",
         "synonyms": ["Stickiness Ratio"]},
        {"name": "ConversionRate", "displayName": "Conversion Rate", "parent": "EngagementMetrics",
         "description": "Percentage of users who take a desired action. Formula: (Conversions / Visitors) x 100.",
         "synonyms": ["CVR"]},
    ],

    # ═══════════════════════════════════════════════════════════════════
    # GLOSSARY 2: Data Engineering
    # ═══════════════════════════════════════════════════════════════════
    "DataEngineering": [
        # Top-level categories
        {"name": "DataPipelines", "displayName": "Data Pipelines",
         "description": "Automated workflows that extract, transform, and load data between systems."},
        {"name": "DataStorage", "displayName": "Data Storage",
         "description": "Systems and architectures for persisting structured, semi-structured, and unstructured data."},
        {"name": "DataQuality", "displayName": "Data Quality",
         "description": "Practices and metrics ensuring data is accurate, complete, consistent, and timely."},
        {"name": "DataProcessing", "displayName": "Data Processing",
         "description": "Computational paradigms for transforming raw data into usable information."},

        # Data Pipelines children
        {"name": "ETL", "displayName": "ETL (Extract, Transform, Load)", "parent": "DataPipelines",
         "description": "Traditional pipeline pattern: extract from sources, transform in staging, load into target warehouse.",
         "synonyms": ["Extract Transform Load"]},
        {"name": "ELT", "displayName": "ELT (Extract, Load, Transform)", "parent": "DataPipelines",
         "description": "Modern pipeline pattern: extract and load raw data first, then transform in the target system.",
         "synonyms": ["Extract Load Transform"]},
        {"name": "CDC", "displayName": "Change Data Capture (CDC)", "parent": "DataPipelines",
         "description": "Pattern that identifies and captures changes in source data for incremental processing.",
         "synonyms": ["Change Data Capture"]},
        {"name": "DataIngestion", "displayName": "Data Ingestion", "parent": "DataPipelines",
         "description": "The process of importing data from various sources into a storage or processing system."},
        {"name": "Orchestration", "displayName": "Workflow Orchestration", "parent": "DataPipelines",
         "description": "Scheduling and coordinating data pipeline tasks with dependency management (e.g., Airflow, Dagster).",
         "synonyms": ["Pipeline Orchestration"]},

        # Data Storage children
        {"name": "DataWarehouse", "displayName": "Data Warehouse", "parent": "DataStorage",
         "description": "Central repository of integrated, historical data optimized for analytical queries (e.g., Snowflake, BigQuery).",
         "synonyms": ["DWH", "Enterprise Data Warehouse"]},
        {"name": "DataLake", "displayName": "Data Lake", "parent": "DataStorage",
         "description": "Centralized repository storing raw data at any scale in native format (e.g., S3, ADLS, GCS)."},
        {"name": "DataLakehouse", "displayName": "Data Lakehouse", "parent": "DataStorage",
         "description": "Architecture combining data lake flexibility with data warehouse reliability (e.g., Delta Lake, Iceberg)."},
        {"name": "OLAP", "displayName": "OLAP (Online Analytical Processing)", "parent": "DataStorage",
         "description": "Technology optimized for complex analytical queries on multidimensional data."},
        {"name": "OLTP", "displayName": "OLTP (Online Transaction Processing)", "parent": "DataStorage",
         "description": "Technology optimized for high-volume, low-latency transactional workloads."},

        # Data Quality children
        {"name": "DataAccuracy", "displayName": "Data Accuracy", "parent": "DataQuality",
         "description": "Degree to which data correctly represents the real-world values it models."},
        {"name": "DataCompleteness", "displayName": "Data Completeness", "parent": "DataQuality",
         "description": "Measure of whether all required data is present without gaps or missing values."},
        {"name": "DataFreshness", "displayName": "Data Freshness", "parent": "DataQuality",
         "description": "How recently data was updated relative to expectations; staleness detection.",
         "synonyms": ["Data Timeliness", "Data Recency"]},
        {"name": "DataLineage", "displayName": "Data Lineage", "parent": "DataQuality",
         "description": "End-to-end tracking of data flow from origin through transformations to consumption.",
         "synonyms": ["Data Provenance"]},
        {"name": "SchemaEvolution", "displayName": "Schema Evolution", "parent": "DataQuality",
         "description": "Managing changes to data schemas over time without breaking downstream consumers.",
         "synonyms": ["Schema Migration"]},

        # Data Processing children
        {"name": "BatchProcessing", "displayName": "Batch Processing", "parent": "DataProcessing",
         "description": "Processing data in large, scheduled batches (e.g., nightly runs via Spark, Hive)."},
        {"name": "StreamProcessing", "displayName": "Stream Processing", "parent": "DataProcessing",
         "description": "Processing data in real-time as it arrives (e.g., Kafka Streams, Flink, Spark Streaming).",
         "synonyms": ["Real-time Processing"]},
        {"name": "Partitioning", "displayName": "Data Partitioning", "parent": "DataProcessing",
         "description": "Dividing datasets into smaller chunks by key (date, region) for efficient querying and processing."},
        {"name": "Materialization", "displayName": "Materialization", "parent": "DataProcessing",
         "description": "Pre-computing and storing query results (materialized views) for faster downstream reads.",
         "synonyms": ["Materialized View"]},
    ],

    # ═══════════════════════════════════════════════════════════════════
    # GLOSSARY 3: Data Governance
    # ═══════════════════════════════════════════════════════════════════
    "DataGovernance": [
        # Top-level categories
        {"name": "Privacy", "displayName": "Privacy & Compliance",
         "description": "Regulations, policies, and practices for protecting personal and sensitive data."},
        {"name": "Stewardship", "displayName": "Data Stewardship",
         "description": "Roles, responsibilities, and processes for managing data as a strategic asset."},
        {"name": "Classification", "displayName": "Data Classification",
         "description": "Categorizing data by sensitivity, criticality, and regulatory requirements."},
        {"name": "AccessControl", "displayName": "Access Control",
         "description": "Mechanisms for managing who can access, modify, or share data and under what conditions."},

        # Privacy children
        {"name": "PII", "displayName": "Personally Identifiable Information (PII)", "parent": "Privacy",
         "description": "Data that can identify an individual — name, email, SSN, phone number, IP address, etc.",
         "synonyms": ["Personal Data", "Personal Information"]},
        {"name": "GDPR", "displayName": "GDPR", "parent": "Privacy",
         "description": "EU General Data Protection Regulation. Governs collection, storage, and processing of EU residents' personal data."},
        {"name": "CCPA", "displayName": "CCPA", "parent": "Privacy",
         "description": "California Consumer Privacy Act. Gives California residents rights over their personal data."},
        {"name": "DataAnonymization", "displayName": "Data Anonymization", "parent": "Privacy",
         "description": "Irreversibly removing identifying information so individuals cannot be re-identified.",
         "synonyms": ["De-identification"]},
        {"name": "DataMasking", "displayName": "Data Masking", "parent": "Privacy",
         "description": "Replacing sensitive data with realistic but fake values for non-production use.",
         "synonyms": ["Data Obfuscation"]},
        {"name": "ConsentManagement", "displayName": "Consent Management", "parent": "Privacy",
         "description": "Tracking and enforcing user consent preferences for data collection and processing."},

        # Stewardship children
        {"name": "DataOwnership", "displayName": "Data Ownership", "parent": "Stewardship",
         "description": "Assigning accountability for data quality, access, and lifecycle to specific roles or teams."},
        {"name": "DataCatalog", "displayName": "Data Catalog", "parent": "Stewardship",
         "description": "Centralized inventory of data assets with metadata, descriptions, lineage, and ownership info.",
         "synonyms": ["Metadata Catalog"]},
        {"name": "DataSteward", "displayName": "Data Steward", "parent": "Stewardship",
         "description": "Role responsible for maintaining data quality, enforcing policies, and managing metadata for a domain."},
        {"name": "DataContract", "displayName": "Data Contract", "parent": "Stewardship",
         "description": "Formal agreement between data producers and consumers defining schema, SLAs, and quality guarantees."},
        {"name": "MetadataManagement", "displayName": "Metadata Management", "parent": "Stewardship",
         "description": "Practices for capturing, storing, and maintaining descriptive, structural, and operational metadata."},

        # Classification children
        {"name": "SensitivityLevel", "displayName": "Sensitivity Level", "parent": "Classification",
         "description": "Tiers categorizing data by impact if exposed: Public, Internal, Confidential, Restricted."},
        {"name": "DataRetention", "displayName": "Data Retention Policy", "parent": "Classification",
         "description": "Rules defining how long data must be kept before archival or deletion based on regulatory or business needs.",
         "synonyms": ["Retention Policy"]},
        {"name": "PHI", "displayName": "Protected Health Information (PHI)", "parent": "Classification",
         "description": "Health-related data protected under HIPAA — medical records, insurance info, treatment history."},

        # Access Control children
        {"name": "RBAC", "displayName": "Role-Based Access Control (RBAC)", "parent": "AccessControl",
         "description": "Access model where permissions are assigned to roles, and users are assigned to roles."},
        {"name": "ABAC", "displayName": "Attribute-Based Access Control (ABAC)", "parent": "AccessControl",
         "description": "Access model using attributes (user, resource, environment) to make dynamic authorization decisions."},
        {"name": "ColumnLevelSecurity", "displayName": "Column-Level Security", "parent": "AccessControl",
         "description": "Restricting access to specific columns in a table based on user roles or attributes.",
         "synonyms": ["CLS", "Field-Level Security"]},
        {"name": "RowLevelSecurity", "displayName": "Row-Level Security", "parent": "AccessControl",
         "description": "Restricting access to specific rows in a table based on user context (e.g., region, department).",
         "synonyms": ["RLS"]},
    ],
}
# fmt: on


# ═══════════════════════════════════════════════════════════════════════════
# 3. Within-glossary relationships
# ═══════════════════════════════════════════════════════════════════════════
WITHIN_GLOSSARY_RELATIONS = [
    # ── BusinessMetrics internal ──
    ("BusinessMetrics", "MRR", "calculatedFrom", "BusinessMetrics", "ARR"),
    ("BusinessMetrics", "ARR", "calculatedFrom", "BusinessMetrics", "MRR"),
    ("BusinessMetrics", "NetRevenue", "calculatedFrom", "BusinessMetrics", "GrossRevenue"),
    ("BusinessMetrics", "CLV", "calculatedFrom", "BusinessMetrics", "ARPU"),
    ("BusinessMetrics", "CLV", "calculatedFrom", "BusinessMetrics", "ChurnRate"),
    ("BusinessMetrics", "GrossMargin", "calculatedFrom", "BusinessMetrics", "NetRevenue"),
    ("BusinessMetrics", "NetProfitMargin", "calculatedFrom", "BusinessMetrics", "NetRevenue"),
    ("BusinessMetrics", "DAU_MAU_Ratio", "calculatedFrom", "BusinessMetrics", "DAU"),
    ("BusinessMetrics", "DAU_MAU_Ratio", "calculatedFrom", "BusinessMetrics", "MAU"),
    ("BusinessMetrics", "LTV_CAC_Ratio", "calculatedFrom", "BusinessMetrics", "CLV"),
    ("BusinessMetrics", "LTV_CAC_Ratio", "calculatedFrom", "BusinessMetrics", "CAC"),
    ("BusinessMetrics", "ChurnRate", "antonym", "BusinessMetrics", "RetentionRate"),
    # CAC and CLV together form unit economics — CLV is calculated from CAC context
    ("BusinessMetrics", "CAC", "usedToCalculate", "BusinessMetrics", "LTV_CAC_Ratio"),
    # NPS is a leading indicator that predicts retention
    ("BusinessMetrics", "NPS", "indicatorOf", "BusinessMetrics", "RetentionRate"),
    # Higher conversion rate lowers CAC — conversion feeds into CAC calculation
    ("BusinessMetrics", "ConversionRate", "usedToCalculate", "BusinessMetrics", "CAC"),
    # Burn rate is calculated considering revenue (cash out vs cash in)
    ("BusinessMetrics", "BurnRate", "calculatedFrom", "BusinessMetrics", "Revenue"),
    ("BusinessMetrics", "EBITDA", "seeAlso", "BusinessMetrics", "NetProfitMargin"),
    ("BusinessMetrics", "DAU", "broader", "BusinessMetrics", "MAU"),
    ("BusinessMetrics", "GrossRevenue", "partOf", "BusinessMetrics", "Revenue"),
    ("BusinessMetrics", "NetRevenue", "partOf", "BusinessMetrics", "Revenue"),
    ("BusinessMetrics", "LTV_CAC_Ratio", "dependsOn", "BusinessMetrics", "CLV"),
    ("BusinessMetrics", "LTV_CAC_Ratio", "dependsOn", "BusinessMetrics", "CAC"),

    # ── DataEngineering internal ──
    ("DataEngineering", "ELT", "replacedBy", "DataEngineering", "ETL"),  # ELT is the modern replacement
    ("DataEngineering", "CDC", "partOf", "DataEngineering", "DataIngestion"),
    ("DataEngineering", "DataLakehouse", "broader", "DataEngineering", "DataLake"),
    ("DataEngineering", "DataLakehouse", "broader", "DataEngineering", "DataWarehouse"),
    ("DataEngineering", "OLAP", "antonym", "DataEngineering", "OLTP"),
    ("DataEngineering", "BatchProcessing", "antonym", "DataEngineering", "StreamProcessing"),
    # Data accuracy depends on lineage to verify correctness
    ("DataEngineering", "DataAccuracy", "dependsOn", "DataEngineering", "DataLineage"),
    # Schema changes can break completeness — completeness depends on stable schemas
    ("DataEngineering", "DataCompleteness", "dependsOn", "DataEngineering", "SchemaEvolution"),
    ("DataEngineering", "Materialization", "dependsOn", "DataEngineering", "BatchProcessing"),
    ("DataEngineering", "DataFreshness", "dependsOn", "DataEngineering", "CDC"),
    ("DataEngineering", "ETL", "dependsOn", "DataEngineering", "Orchestration"),
    ("DataEngineering", "ELT", "dependsOn", "DataEngineering", "Orchestration"),
    ("DataEngineering", "Partitioning", "seeAlso", "DataEngineering", "Materialization"),

    # ── DataGovernance internal ──
    # CCPA and GDPR are parallel privacy regulations — CCPA modeled after GDPR
    ("DataGovernance", "CCPA", "seeAlso", "DataGovernance", "GDPR"),
    ("DataGovernance", "DataAnonymization", "broader", "DataGovernance", "DataMasking"),
    ("DataGovernance", "PII", "governedBy", "DataGovernance", "GDPR"),
    ("DataGovernance", "PII", "governedBy", "DataGovernance", "CCPA"),
    # PHI is a specific subset of PII (health-related personal data)
    ("DataGovernance", "PHI", "narrower", "DataGovernance", "PII"),
    ("DataGovernance", "ConsentManagement", "dependsOn", "DataGovernance", "PII"),
    ("DataGovernance", "ColumnLevelSecurity", "partOf", "DataGovernance", "RBAC"),
    ("DataGovernance", "RowLevelSecurity", "partOf", "DataGovernance", "RBAC"),
    ("DataGovernance", "ABAC", "broader", "DataGovernance", "RBAC"),
    # Data contracts formalize data ownership agreements
    ("DataGovernance", "DataContract", "dependsOn", "DataGovernance", "DataOwnership"),
    # Data catalog is the tool that implements metadata management
    ("DataGovernance", "DataCatalog", "implements", "DataGovernance", "MetadataManagement"),
    # Data steward is the role that manages data ownership
    ("DataGovernance", "DataSteward", "manages", "DataGovernance", "DataOwnership"),
    # Sensitivity level is the classification applied to PII
    ("DataGovernance", "PII", "governedBy", "DataGovernance", "SensitivityLevel"),
    ("DataGovernance", "DataRetention", "governedBy", "DataGovernance", "GDPR"),
]


# ═══════════════════════════════════════════════════════════════════════════
# 4. CROSS-GLOSSARY relationships (the key part!)
# ═══════════════════════════════════════════════════════════════════════════
CROSS_GLOSSARY_RELATIONS = [
    # ── Business Metrics <-> Data Engineering ──
    # Revenue metrics depend on the data pipeline infrastructure
    ("BusinessMetrics", "Revenue", "dependsOn", "DataEngineering", "ETL"),
    ("BusinessMetrics", "Revenue", "dependsOn", "DataEngineering", "DataWarehouse"),
    # MRR freshness depends on CDC pipelines
    ("BusinessMetrics", "MRR", "dependsOn", "DataEngineering", "CDC"),
    ("BusinessMetrics", "MRR", "dependsOn", "DataEngineering", "StreamProcessing"),
    # DAU/MAU are computed via batch processing in the warehouse
    ("BusinessMetrics", "DAU", "dependsOn", "DataEngineering", "BatchProcessing"),
    ("BusinessMetrics", "MAU", "dependsOn", "DataEngineering", "BatchProcessing"),
    ("BusinessMetrics", "DAU_MAU_Ratio", "dependsOn", "DataEngineering", "Materialization"),
    # Churn Rate needs accurate, complete data
    ("BusinessMetrics", "ChurnRate", "dependsOn", "DataEngineering", "DataAccuracy"),
    ("BusinessMetrics", "ChurnRate", "dependsOn", "DataEngineering", "DataCompleteness"),
    # Conversion Rate depends on real-time event streaming
    ("BusinessMetrics", "ConversionRate", "dependsOn", "DataEngineering", "StreamProcessing"),
    # Business metrics depend on data warehouse for storage & computation
    ("BusinessMetrics", "GrossRevenue", "dependsOn", "DataEngineering", "DataWarehouse"),
    # Data lineage helps trace how business metrics are computed
    ("BusinessMetrics", "CLV", "seeAlso", "DataEngineering", "DataLineage"),

    # ── Business Metrics <-> Data Governance ──
    # Customer metrics involve PII and are governed by privacy regulations
    ("BusinessMetrics", "CAC", "governedBy", "DataGovernance", "GDPR"),
    ("BusinessMetrics", "CLV", "governedBy", "DataGovernance", "GDPR"),
    ("BusinessMetrics", "CLV", "governedBy", "DataGovernance", "CCPA"),
    ("BusinessMetrics", "NPS", "governedBy", "DataGovernance", "ConsentManagement"),
    # Customer metrics depend on PII data
    ("BusinessMetrics", "CAC", "dependsOn", "DataGovernance", "PII"),
    ("BusinessMetrics", "ChurnRate", "dependsOn", "DataGovernance", "PII"),
    # ARPU needs proper access controls since it touches revenue + user data
    ("BusinessMetrics", "ARPU", "governedBy", "DataGovernance", "RowLevelSecurity"),
    # Revenue data has retention requirements
    ("BusinessMetrics", "Revenue", "governedBy", "DataGovernance", "DataRetention"),

    # ── Data Engineering <-> Data Governance ──
    # Data pipelines must comply with governance policies
    ("DataEngineering", "ETL", "governedBy", "DataGovernance", "DataRetention"),
    ("DataEngineering", "DataIngestion", "governedBy", "DataGovernance", "ConsentManagement"),
    ("DataEngineering", "DataIngestion", "governedBy", "DataGovernance", "GDPR"),
    # Data warehouse access is controlled by RBAC
    ("DataEngineering", "DataWarehouse", "governedBy", "DataGovernance", "RBAC"),
    ("DataEngineering", "DataWarehouse", "governedBy", "DataGovernance", "ColumnLevelSecurity"),
    ("DataEngineering", "DataLake", "governedBy", "DataGovernance", "SensitivityLevel"),
    # Data quality is managed by data stewards
    ("DataEngineering", "DataAccuracy", "managedBy", "DataGovernance", "DataSteward"),
    # Completeness guarantees are defined in data contracts
    ("DataEngineering", "DataCompleteness", "governedBy", "DataGovernance", "DataContract"),
    # Lineage is tracked and surfaced through the data catalog
    ("DataEngineering", "DataLineage", "implementedBy", "DataGovernance", "DataCatalog"),
    # Schema changes must comply with data contracts
    ("DataEngineering", "SchemaEvolution", "governedBy", "DataGovernance", "DataContract"),
    # ETL pipelines implement data masking as part of transformation
    ("DataEngineering", "ETL", "implements", "DataGovernance", "DataMasking"),
    # Data lakes require anonymization for compliance
    ("DataEngineering", "DataLake", "dependsOn", "DataGovernance", "DataAnonymization"),
]


# ═══════════════════════════════════════════════════════════════════════════
# Execution helpers
# ═══════════════════════════════════════════════════════════════════════════
def create_glossaries():
    print("\n=== Creating Glossaries ===")
    for g in GLOSSARIES:
        result = api("POST", "/v1/glossaries", g)
        if result:
            print(f"  + {result['name']} (id: {result['id']})")
        else:
            result = api("GET", f"/v1/glossaries/name/{g['name']}")
            if result:
                print(f"  ~ {result['name']} (exists)")


def create_all_terms():
    print("\n=== Creating Glossary Terms ===")
    for glossary_name, terms in TERMS.items():
        print(f"\n  [{glossary_name}]")
        for t in terms:
            body = {
                "glossary": glossary_name,
                "name": t["name"],
                "displayName": t.get("displayName", t["name"]),
                "description": t["description"],
            }
            if "parent" in t:
                body["parent"] = f"{glossary_name}.{t['parent']}"
            if "synonyms" in t:
                body["synonyms"] = t["synonyms"]

            result = api("PUT", "/v1/glossaryTerms", body)
            key = f"{glossary_name}.{t['name']}"
            if result:
                term_ids[key] = result["id"]
                fqn = result.get("fullyQualifiedName", key)
                print(f"    + {fqn}")
            else:
                parent = t.get("parent", "")
                fqn = f"{glossary_name}.{parent + '.' if parent else ''}{t['name']}"
                existing = api("GET", f"/v1/glossaryTerms/name/{fqn}")
                if existing:
                    term_ids[key] = existing["id"]
                    print(f"    ~ {fqn} (exists)")


def create_all_relations():
    all_relations = WITHIN_GLOSSARY_RELATIONS + CROSS_GLOSSARY_RELATIONS

    print("\n=== Creating Relationships ===")
    print(f"  ({len(WITHIN_GLOSSARY_RELATIONS)} within-glossary + {len(CROSS_GLOSSARY_RELATIONS)} cross-glossary)")

    for from_g, from_t, rel_type, to_g, to_t in all_relations:
        from_key = f"{from_g}.{from_t}"
        to_key = f"{to_g}.{to_t}"
        from_id = term_ids.get(from_key)
        to_id = term_ids.get(to_key)

        is_cross = from_g != to_g
        prefix = "CROSS" if is_cross else "     "

        if not from_id or not to_id:
            print(f"  {prefix} SKIP: {from_key} --[{rel_type}]--> {to_key} (missing ID)")
            continue

        body = {
            "relationType": rel_type,
            "term": {"id": str(to_id), "type": "glossaryTerm"},
        }
        result = api("POST", f"/v1/glossaryTerms/{from_id}/relations", body)
        if result is not None:
            print(f"  {prefix} + {from_t} --[{rel_type}]--> {to_g}.{to_t}")
        else:
            print(f"  {prefix} ~ {from_t} --[{rel_type}]--> {to_g}.{to_t} (may exist)")


def print_summary():
    print("\n" + "=" * 70)
    print("ALL GLOSSARIES CREATED SUCCESSFULLY")
    print("=" * 70)

    for g in GLOSSARIES:
        glossary = api("GET", f"/v1/glossaries/name/{g['name']}", params={"fields": "termCount"})
        if glossary:
            print(f"\n  {glossary.get('displayName', g['name'])}: {glossary.get('termCount', '?')} terms")

    # Show cross-glossary graph: CLV touches all 3 glossaries
    print("\n--- Cross-Glossary Graph: CLV (depth=2) ---")
    clv_id = term_ids.get("BusinessMetrics.CLV")
    if clv_id:
        graph = api("GET", f"/v1/glossaryTerms/{clv_id}/relationsGraph", params={"depth": 2})
        if graph:
            nodes = {n["id"]: f"{n.get('fullyQualifiedName', n.get('name', '?'))}" for n in graph.get("nodes", [])}
            for edge in graph.get("edges", []):
                f = nodes.get(edge.get("from", ""), "?")
                t = nodes.get(edge.get("to", ""), "?")
                r = edge.get("relationType", "?")
                print(f"    {f} --[{r}]--> {t}")

    # Show cross-glossary graph: DataWarehouse
    print("\n--- Cross-Glossary Graph: DataWarehouse (depth=2) ---")
    dw_id = term_ids.get("DataEngineering.DataWarehouse")
    if dw_id:
        graph = api("GET", f"/v1/glossaryTerms/{dw_id}/relationsGraph", params={"depth": 2})
        if graph:
            nodes = {n["id"]: f"{n.get('fullyQualifiedName', n.get('name', '?'))}" for n in graph.get("nodes", [])}
            for edge in graph.get("edges", []):
                f = nodes.get(edge.get("from", ""), "?")
                t = nodes.get(edge.get("to", ""), "?")
                r = edge.get("relationType", "?")
                print(f"    {f} --[{r}]--> {t}")

    print("\n--- Relation Type Usage Counts ---")
    usage = api("GET", "/v1/glossaryTerms/relationTypes/usage")
    if usage:
        for rtype, count in sorted(usage.items(), key=lambda x: -x[1]):
            if count > 0:
                print(f"  {rtype}: {count}")


# ═══════════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    print("OpenMetadata Multi-Glossary Creator")
    print("=" * 50)

    health = api("GET", "/v1/system/version")
    if not health:
        print("\nERROR: Cannot connect to OpenMetadata at localhost:8585")
        sys.exit(1)
    print(f"Connected to OpenMetadata {health.get('version', '?')}")

    add_custom_relation_types()
    create_glossaries()
    create_all_terms()
    create_all_relations()
    print_summary()
