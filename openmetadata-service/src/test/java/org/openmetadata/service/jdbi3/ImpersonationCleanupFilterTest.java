package org.openmetadata.service.jdbi3;

import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.Test;
import org.openmetadata.service.security.ImpersonationCleanupFilter;

class ImpersonationCleanupFilterTest {

  @Test
  void filterClearsReadBundleContextThreadLocal() {
    ReadBundleContext.push(new ReadBundle());
    new ImpersonationCleanupFilter().filter(null, null);
    assertNull(ReadBundleContext.getCurrent());
  }
}
