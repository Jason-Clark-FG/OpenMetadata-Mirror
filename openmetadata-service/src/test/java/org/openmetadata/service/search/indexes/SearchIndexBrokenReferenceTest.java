package org.openmetadata.service.search.indexes;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mockStatic;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;
import org.openmetadata.schema.type.EntityReference;
import org.openmetadata.schema.type.Include;
import org.openmetadata.service.Entity;
import org.openmetadata.service.exception.EntityNotFoundException;

class SearchIndexBrokenReferenceTest {

  @Test
  void testGetEntityOrNull_returnsNullForMissingEntity() {
    EntityReference ref = new EntityReference().withId(UUID.randomUUID()).withType("table");
    try (MockedStatic<Entity> entityMock = mockStatic(Entity.class)) {
      entityMock
          .when(() -> Entity.getEntityOrNull(any(EntityReference.class), anyString(), any()))
          .thenCallRealMethod();
      entityMock
          .when(() -> Entity.getEntity(any(EntityReference.class), anyString(), any(Include.class)))
          .thenThrow(EntityNotFoundException.byId(ref.getId().toString()));

      Object result = assertDoesNotThrow(() -> Entity.getEntityOrNull(ref, "", Include.ALL));
      assertNull(result);
    }
  }

  @Test
  void testGetEntityOrNull_returnsNullForNullReference() {
    Object result = Entity.getEntityOrNull(null, "", Include.ALL);
    assertNull(result);
  }
}
