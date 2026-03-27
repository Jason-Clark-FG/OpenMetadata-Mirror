package org.openmetadata.service.search.indexes;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.openmetadata.schema.api.services.CreateMcpService;
import org.openmetadata.schema.entity.services.McpService;

class McpServiceIndexTest {

  @Test
  void testGetEntityReturnsService() {
    McpService service =
        new McpService()
            .withId(UUID.randomUUID())
            .withName("test-service")
            .withFullyQualifiedName("test-service")
            .withServiceType(CreateMcpService.McpServiceType.Mcp)
            .withDeleted(false);

    McpServiceIndex index = new McpServiceIndex(service);
    assertEquals(service, index.getEntity());
  }
}
