#!/usr/bin/env python3
"""
OpenMetadata Resource Requirements Calculator

Estimates infrastructure resources and application configuration for
OpenMetadata server and OpenSearch/Elasticsearch based on your deployment scale.

Usage:
    python3 resource-calculator.py                          # interactive mode
    python3 resource-calculator.py --entities 500000        # non-interactive
    python3 resource-calculator.py --entities 500000 --concurrent-users 50 --output helm
    python3 resource-calculator.py --help
"""

import argparse
import math
import sys


# ── ANSI colours ─────────────────────────────────────────────────────────────

RESET  = "\033[0m"
BOLD   = "\033[1m"
DIM    = "\033[2m"
CYAN   = "\033[36m"
GREEN  = "\033[32m"
YELLOW = "\033[33m"
RED    = "\033[31m"
BLUE   = "\033[34m"
MAGENTA = "\033[35m"


def _no_color() -> bool:
    import os
    return not sys.stdout.isatty() or os.environ.get("NO_COLOR") == "1"


def color(text: str, *codes: str) -> str:
    if _no_color():
        return text
    return "".join(codes) + text + RESET


def header(text: str) -> str:
    return color(f"\n{'─' * 60}\n  {text}\n{'─' * 60}", BOLD, CYAN)


def section(text: str) -> str:
    return color(f"\n  {text}", BOLD)


def ok(text: str) -> str:
    return color(text, GREEN)


def warn(text: str) -> str:
    return color(text, YELLOW)


def bad(text: str) -> str:
    return color(text, RED)


def dim(text: str) -> str:
    return color(text, DIM)


def value(text: str) -> str:
    return color(text, BOLD)


# ── Sizing tiers ─────────────────────────────────────────────────────────────

TIERS = {
    "small":  {"label": "Small",   "min": 0,       "max": 50_000},
    "medium": {"label": "Medium",  "min": 50_001,   "max": 200_000},
    "large":  {"label": "Large",   "min": 200_001,  "max": 2_000_000},
    "xlarge": {"label": "XLarge",  "min": 2_000_001,"max": 5_000_000},
}

# OpenMetadata server config matrix (derived from CLUSTER-SIZING-RUNBOOK.md)
OM_CONFIG = {
    "small": {
        "jvm_heap_gb":              2,
        "server_max_threads":       150,
        "virtual_threads":          False,
        "db_pool_max":              50,
        "db_connection_timeout_ms": 30_000,
        "es_max_conn_total":        50,
        "bulk_queue_size":          1_000,
        "bulk_max_threads":         10,
        "accept_queue_size":        50,
        "server_vcpu":              2,
        "server_ram_gb":            4,
    },
    "medium": {
        "jvm_heap_gb":              4,
        "server_max_threads":       300,
        "virtual_threads":          True,
        "db_pool_max":              100,
        "db_connection_timeout_ms": 30_000,
        "es_max_conn_total":        100,
        "bulk_queue_size":          2_000,
        "bulk_max_threads":         20,
        "accept_queue_size":        100,
        "server_vcpu":              4,
        "server_ram_gb":            8,
    },
    "large": {
        "jvm_heap_gb":              8,
        "server_max_threads":       500,
        "virtual_threads":          True,
        "db_pool_max":              200,
        "db_connection_timeout_ms": 60_000,
        "es_max_conn_total":        200,
        "bulk_queue_size":          5_000,
        "bulk_max_threads":         30,
        "accept_queue_size":        200,
        "server_vcpu":              8,
        "server_ram_gb":            16,
    },
    "xlarge": {
        "jvm_heap_gb":              16,
        "server_max_threads":       750,
        "virtual_threads":          True,
        "db_pool_max":              300,
        "db_connection_timeout_ms": 60_000,
        "es_max_conn_total":        300,
        "bulk_queue_size":          10_000,
        "bulk_max_threads":         50,
        "accept_queue_size":        500,
        "server_vcpu":              16,
        "server_ram_gb":            32,
    },
}

# OpenSearch / Elasticsearch sizing
# Metadata documents average ~3 KB; shards should stay 10-30 GB for metadata.
AVG_DOC_SIZE_KB = 3
TARGET_SHARD_GB = 15


def _opensearch_config(entities: int, tier: str) -> dict:
    """Return OpenSearch sizing parameters."""
    index_gb = math.ceil((entities * AVG_DOC_SIZE_KB) / (1024 * 1024))
    index_gb = max(index_gb, 1)

    num_shards = max(1, math.ceil(index_gb / TARGET_SHARD_GB))
    replicas   = 0 if tier == "small" else 1

    # Heap: 50 % of node RAM, cap at 32 GB
    heap_map = {"small": 1, "medium": 2, "large": 8, "xlarge": 16}
    heap_gb  = heap_map[tier]
    node_ram_gb = heap_gb * 2

    # Data nodes: scale with shard count (1 node per ~3 primary shards)
    data_nodes = max(1, math.ceil(num_shards / 3))
    if tier == "small":
        data_nodes = 1
    elif tier == "medium":
        data_nodes = max(1, data_nodes)
    elif tier == "large":
        data_nodes = max(3, data_nodes)
    else:
        data_nodes = max(3, data_nodes)

    # vCPU: 2 per data node, minimum 2
    vcpu_per_node = 2 if tier in ("small", "medium") else 4

    return {
        "index_size_gb":  index_gb,
        "num_shards":     num_shards,
        "num_replicas":   replicas,
        "heap_gb":        heap_gb,
        "node_ram_gb":    node_ram_gb,
        "data_nodes":     data_nodes,
        "vcpu_per_node":  vcpu_per_node,
        "total_vcpu":     vcpu_per_node * data_nodes,
        "total_ram_gb":   node_ram_gb * data_nodes,
        "disk_gb":        math.ceil(index_gb * (1 + replicas) * 1.3),
    }


def _db_config(tier: str) -> dict:
    """Return MySQL/PostgreSQL sizing parameters."""
    configs = {
        "small":  {"ram_gb": 4,  "vcpu": 2, "innodb_buffer_gb": 2,  "max_connections": 200},
        "medium": {"ram_gb": 8,  "vcpu": 4, "innodb_buffer_gb": 4,  "max_connections": 300},
        "large":  {"ram_gb": 16, "vcpu": 8, "innodb_buffer_gb": 8,  "max_connections": 500},
        "xlarge": {"ram_gb": 32, "vcpu": 16,"innodb_buffer_gb": 16, "max_connections": 1000},
    }
    return configs[tier]


# ── Interactive prompts ───────────────────────────────────────────────────────

def prompt_int(msg: str, default: int | None = None, min_val: int = 1) -> int:
    default_str = f" [{default}]" if default is not None else ""
    while True:
        raw = input(f"  {msg}{default_str}: ").strip()
        if raw == "" and default is not None:
            return default
        try:
            val = int(raw.replace(",", "").replace("_", ""))
            if val < min_val:
                print(f"  {warn(f'Must be at least {min_val}. Try again.')}")
                continue
            return val
        except ValueError:
            print(f"  {warn('Please enter a whole number (e.g. 500000).')}")


def prompt_choice(msg: str, choices: list[str], default: str) -> str:
    choices_str = "/".join(
        ok(c) if c == default else c for c in choices
    )
    while True:
        raw = input(f"  {msg} ({choices_str}): ").strip().lower()
        if raw == "":
            return default
        if raw in choices:
            return raw
        print(f"  {warn('Invalid choice. Options: ' + ', '.join(choices))}")


# ── Tier detection ────────────────────────────────────────────────────────────

def detect_tier(entities: int) -> str:
    for tier, bounds in TIERS.items():
        if bounds["min"] <= entities <= bounds["max"]:
            return tier
    return "xlarge"


def tier_label(tier: str) -> str:
    labels = {"small": "Small (<50K)", "medium": "Medium (50K–200K)",
              "large": "Large (200K–2M)", "xlarge": "XLarge (2M–5M)"}
    return labels[tier]


# ── Output formatters ─────────────────────────────────────────────────────────

def _fmt_gb(gb: int) -> str:
    return f"{gb}G" if gb < 1024 else f"{gb // 1024}T"


def print_summary(entities: int, concurrent_users: int, tier: str,
                  om: dict, es: dict, db: dict) -> None:
    print(header("OpenMetadata Resource Requirements Calculator"))
    print(f"\n  Deployment profile:  {value(tier_label(tier))}")
    print(f"  Entities:            {value(f'{entities:,}')}")
    print(f"  Concurrent users:    {value(str(concurrent_users))}")

    # ── OpenMetadata Server ───────────────────────────────────────────────────
    print(section("OpenMetadata Server"))
    om_infra = f"{om['server_vcpu']} vCPU  /  {om['server_ram_gb']} GB RAM"
    print(f"    {'Infrastructure':40s}  {value(om_infra)}")
    print(f"    {'JVM Heap (-Xmx / -Xms)':40s}  {value(_fmt_gb(om['jvm_heap_gb']))}")
    print(f"    {'Max Jetty Threads':40s}  {value(str(om['server_max_threads']))}")
    vt_val = ok("enabled") if om["virtual_threads"] else warn("disabled (enable at >50K)")
    print(f"    {'Virtual Threads (Java 21)':40s}  {vt_val}")
    print(f"    {'DB Connection Pool Max':40s}  {value(str(om['db_pool_max']))}")
    print(f"    {'DB Connection Timeout (ms)':40s}  {value(str(om['db_connection_timeout_ms']))}")
    print(f"    {'ES/OS Max Connections Total':40s}  {value(str(om['es_max_conn_total']))}")
    print(f"    {'Bulk Operation Queue Size':40s}  {value(str(om['bulk_queue_size']))}")
    print(f"    {'Bulk Operation Max Threads':40s}  {value(str(om['bulk_max_threads']))}")
    print(f"    {'Accept Queue Size':40s}  {value(str(om['accept_queue_size']))}")

    # ── OpenSearch / Elasticsearch ────────────────────────────────────────────
    print(section("OpenSearch / Elasticsearch"))
    es_node_infra = f"{es['vcpu_per_node']} vCPU  /  {es['node_ram_gb']} GB RAM"
    print(f"    {'Infrastructure (per data node)':40s}  {value(es_node_infra)}")
    print(f"    {'JVM Heap per node':40s}  {value(_fmt_gb(es['heap_gb']))}")
    print(f"    {'Data nodes':40s}  {value(str(es['data_nodes']))}")
    print(f"    {'Primary shards':40s}  {value(str(es['num_shards']))}")
    print(f"    {'Replica shards':40s}  {value(str(es['num_replicas']))}")
    es_idx = f"{es['index_size_gb']} GB"
    print(f"    {'Estimated index size':40s}  {value(es_idx)}")
    es_disk = f"{es['disk_gb']} GB"
    print(f"    {'Minimum disk (with replicas + buffer)':40s}  {value(es_disk)}")
    print(f"    {'Total cluster vCPU':40s}  {value(str(es['total_vcpu']))}")
    es_ram = f"{es['total_ram_gb']} GB"
    print(f"    {'Total cluster RAM':40s}  {value(es_ram)}")

    # ── Database ──────────────────────────────────────────────────────────────
    print(section("MySQL / PostgreSQL"))
    db_infra = f"{db['vcpu']} vCPU  /  {db['ram_gb']} GB RAM"
    print(f"    {'Infrastructure':40s}  {value(db_infra)}")
    print(f"    {'InnoDB Buffer Pool':40s}  {value(_fmt_gb(db['innodb_buffer_gb']))}")
    print(f"    {'max_connections':40s}  {value(str(db['max_connections']))}")

    # ── Grand total ───────────────────────────────────────────────────────────
    total_vcpu = om["server_vcpu"] + es["total_vcpu"] + db["vcpu"]
    total_ram  = om["server_ram_gb"] + es["total_ram_gb"] + db["ram_gb"]
    print(section("Total Estimated Infrastructure"))
    print(f"    {'vCPU':40s}  {value(str(total_vcpu))}")
    print(f"    {'RAM':40s}  {value(f'{total_ram} GB')}")
    es_disk2 = f"{es['disk_gb']} GB"
    print(f"    {'Disk (OpenSearch)':40s}  {value(es_disk2)}")

    # ── Notes ─────────────────────────────────────────────────────────────────
    print(section("Notes"))
    if tier == "small":
        print(f"    {dim('• Single-node OpenSearch is fine at this scale.')}")
    if tier in ("large", "xlarge"):
        print(f"    {dim('• Consider running multiple OpenMetadata server instances.')}")
        print(f"    {dim('• Enable distributed search reindexing (see DISTRIBUTED_INDEXING.md).')}")
    print(f"    {dim('• Database numbers assume a dedicated DB host. Adjust if shared.')}")
    print(f"    {dim('• Run benchmarks with bin/distributed-test/scripts/benchmark-sizing.sh')}")
    print(f"    {dim('  to validate and tune for your exact workload.')}")
    print()


def print_docker_compose(om: dict, es: dict) -> str:
    vt = "true" if om["virtual_threads"] else "false"
    heap = f"-Xmx{om['jvm_heap_gb']}g -Xms{om['jvm_heap_gb']}g"
    es_heap = f"-Xms{es['heap_gb']}g -Xmx{es['heap_gb']}g"
    snippet = f"""# ── OpenMetadata server environment variables ──────────────────────────────
environment:
  JAVA_OPTS: "{heap}"
  SERVER_MAX_THREADS: "{om['server_max_threads']}"
  SERVER_ENABLE_VIRTUAL_THREAD: "{vt}"
  SERVER_ACCEPT_QUEUE_SIZE: "{om['accept_queue_size']}"
  DB_CONNECTION_POOL_MAX_SIZE: "{om['db_pool_max']}"
  DB_CONNECTION_TIMEOUT: "{om['db_connection_timeout_ms']}"
  ELASTICSEARCH_MAX_CONN_TOTAL: "{om['es_max_conn_total']}"
  BULK_OPERATION_QUEUE_SIZE: "{om['bulk_queue_size']}"
  BULK_OPERATION_MAX_THREADS: "{om['bulk_max_threads']}"

# ── OpenSearch environment variables ───────────────────────────────────────
# (add to the opensearch/elasticsearch service)
environment:
  OPENSEARCH_JAVA_OPTS: "{es_heap}"
  bootstrap.memory_lock: "true"
"""
    return snippet


def print_helm(om: dict, es: dict) -> str:
    vt = "true" if om["virtual_threads"] else "false"
    heap = f"-Xmx{om['jvm_heap_gb']}g -Xms{om['jvm_heap_gb']}g"
    es_heap = f"{es['heap_gb']}g"
    snippet = f"""# ── values.yaml (OpenMetadata Helm chart) ─────────────────────────────────
openmetadata:
  jvmOpts: "{heap}"
  config:
    serverMaxThreads: {om['server_max_threads']}
    enableVirtualThread: {vt}
    serverAcceptQueueSize: {om['accept_queue_size']}
    database:
      connectionPoolMaxSize: {om['db_pool_max']}
      connectionTimeout: {om['db_connection_timeout_ms']}
    elasticsearch:
      maxConnectionsTotal: {om['es_max_conn_total']}
    bulkOperation:
      queueSize: {om['bulk_queue_size']}
      maxThreads: {om['bulk_max_threads']}
  resources:
    requests:
      cpu: "{om['server_vcpu'] // 2}"
      memory: "{om['server_ram_gb'] // 2}Gi"
    limits:
      cpu: "{om['server_vcpu']}"
      memory: "{om['server_ram_gb']}Gi"

opensearch:
  master:
    heapSize: "{es_heap}"
    resources:
      requests:
        cpu: "{es['vcpu_per_node'] // 2}"
        memory: "{es['node_ram_gb'] // 2}Gi"
      limits:
        cpu: "{es['vcpu_per_node']}"
        memory: "{es['node_ram_gb']}Gi"
    replicas: {es['data_nodes']}
"""
    return snippet


def print_yaml(om: dict) -> str:
    vt = "true" if om["virtual_threads"] else "false"
    snippet = f"""# ── openmetadata.yaml ─────────────────────────────────────────────────────
server:
  applicationConnectors:
    - type: http
      port: 8585
      maxThreads: {om['server_max_threads']}
      acceptQueueSize: {om['accept_queue_size']}
  enableVirtualThread: {vt}

database:
  hikariConfig:
    maximumPoolSize: {om['db_pool_max']}
    connectionTimeout: {om['db_connection_timeout_ms']}

elasticsearch:
  maxConnectionsTotal: {om['es_max_conn_total']}

bulkOperation:
  queueSize: {om['bulk_queue_size']}
  maxThreads: {om['bulk_max_threads']}
"""
    return snippet


# ── CLI argument parsing ──────────────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="OpenMetadata resource requirements calculator.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument("--entities", type=int,
                   help="Total number of metadata entities (tables, topics, dashboards, etc.)")
    p.add_argument("--concurrent-users", type=int, default=None,
                   help="Expected peak concurrent API users/workers (default: auto-scaled)")
    p.add_argument("--output", choices=["summary", "docker-compose", "helm", "yaml", "all"],
                   default="summary",
                   help="Output format (default: summary)")
    p.add_argument("--no-interactive", action="store_true",
                   help="Skip prompts; use defaults for any missing value")
    return p


def main() -> None:
    parser = build_parser()
    args   = parser.parse_args()

    interactive = not args.no_interactive and sys.stdout.isatty()

    # ── Collect inputs ────────────────────────────────────────────────────────
    if args.entities is None:
        if interactive:
            print(header("OpenMetadata Resource Requirements Calculator"))
            print(f"\n  {dim('This tool estimates the resources needed for your OpenMetadata deployment.')}")
            print(f"  {dim('Provide your expected scale and get configuration recommendations.')}\n")
            entities = prompt_int(
                "How many metadata entities do you expect? "
                "(tables + topics + dashboards + pipelines + …)",
                default=50_000,
                min_val=1,
            )
        else:
            entities = 50_000
    else:
        entities = args.entities

    tier = detect_tier(entities)

    default_users = max(10, min(200, entities // 1000))
    if args.concurrent_users is not None:
        concurrent_users = args.concurrent_users
    elif interactive:
        concurrent_users = prompt_int(
            "Peak concurrent API users / ingestion workers",
            default=default_users,
            min_val=1,
        )
    else:
        concurrent_users = default_users

    # Bump tier if concurrent load is high relative to entities
    if concurrent_users > 100 and tier == "small":
        tier = "medium"
    elif concurrent_users > 300 and tier == "medium":
        tier = "large"

    # ── Compute recommendations ───────────────────────────────────────────────
    om = OM_CONFIG[tier]
    es = _opensearch_config(entities, tier)
    db = _db_config(tier)

    # ── Render output ─────────────────────────────────────────────────────────
    output = args.output

    if output in ("summary", "all"):
        print_summary(entities, concurrent_users, tier, om, es, db)

    if output in ("docker-compose", "all"):
        if output == "all":
            print(section("Docker Compose environment variables"))
        print(print_docker_compose(om, es))

    if output in ("helm", "all"):
        if output == "all":
            print(section("Helm values.yaml"))
        print(print_helm(om, es))

    if output in ("yaml", "all"):
        if output == "all":
            print(section("openmetadata.yaml"))
        print(print_yaml(om))


if __name__ == "__main__":
    main()
