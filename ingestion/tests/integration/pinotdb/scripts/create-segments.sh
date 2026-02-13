#!/bin/bash
set -e

echo "Creating segments from CSV data..."

TABLES="financial_transactions profiler_test_table numeric_profiler_test partitioned_test"

for table in $TABLES; do
  mkdir -p /tmp/pinot_data/${table}
  cp /data/${table}.csv /tmp/pinot_data/${table}/

  echo "Creating segment for ${table}..."
  /opt/pinot/bin/pinot-admin.sh CreateSegment \
    -tableConfigFile /schemas/${table}_table.json \
    -schemaFile /schemas/${table}_schema.json \
    -dataDir /tmp/pinot_data/${table} \
    -format CSV \
    -outDir /tmp/segments/${table} \
    -overwrite

  echo "Uploading ${table} segment..."
  /opt/pinot/bin/pinot-admin.sh UploadSegment \
    -controllerHost localhost \
    -controllerPort 9000 \
    -segmentDir /tmp/segments/${table} \
    -tableName ${table}
done

echo "All segments created and uploaded successfully!"
