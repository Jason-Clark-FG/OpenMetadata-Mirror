package org.openmetadata.service.migration.postgres.v201;

import lombok.SneakyThrows;
import org.openmetadata.service.migration.api.MigrationProcessImpl;
import org.openmetadata.service.migration.utils.MigrationFile;
import org.openmetadata.service.migration.utils.v201.MigrationUtil;
import org.openmetadata.service.jdbi3.locator.ConnectionType;

public class Migration extends MigrationProcessImpl {

  public Migration(MigrationFile migrationFile) {
    super(migrationFile);
  }

  @Override
  @SneakyThrows
  public void runDataMigration() {
    initializeWorkflowHandler();
    MigrationUtil migrationUtil = new MigrationUtil(handle, ConnectionType.POSTGRES);
    migrationUtil.runTaskWorkflowCutoverMigration();
  }
}
