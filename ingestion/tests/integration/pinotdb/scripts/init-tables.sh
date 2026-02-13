#!/bin/bash
set -e

CONTROLLER_URL="http://localhost:9000"

echo "====================================="
echo "Starting Pinot Table Initialization"
echo "====================================="

schema_exists() {
  local schema_name=$1
  curl -s "${CONTROLLER_URL}/schemas/${schema_name}" | grep -q "\"${schema_name}\""
  return $?
}

table_exists() {
  local table_name=$1
  curl -s "${CONTROLLER_URL}/tables/${table_name}" | grep -q "\"${table_name}\""
  return $?
}

create_schema_and_table() {
  local name=$1
  echo ""
  echo "Creating schema: ${name}"
  if schema_exists "${name}"; then
    echo "  Schema ${name} already exists, skipping..."
  else
    curl -X POST "${CONTROLLER_URL}/schemas" \
      -H "Content-Type: application/json" \
      -d @/schemas/${name}_schema.json
    echo "  Schema ${name} created"
  fi

  echo "Creating table: ${name}"
  if table_exists "${name}"; then
    echo "  Table ${name} already exists, skipping..."
  else
    curl -X POST "${CONTROLLER_URL}/tables" \
      -H "Content-Type: application/json" \
      -d @/schemas/${name}_table.json
    echo "  Table ${name} created"
  fi
}

create_schema_and_table "financial_transactions"
create_schema_and_table "profiler_test_table"
create_schema_and_table "numeric_profiler_test"
create_schema_and_table "partitioned_test"

echo ""
echo "Waiting for tables to be ready..."
sleep 5

echo ""
echo "Creating and uploading segments..."
/scripts/create-segments.sh

echo ""
echo "====================================="
echo "Initialization Complete!"
echo "====================================="
