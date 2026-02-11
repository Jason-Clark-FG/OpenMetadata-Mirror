package org.openmetadata.service.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.openmetadata.schema.type.Include.NON_DELETED;

import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.openmetadata.schema.entity.data.Table;
import org.openmetadata.service.Entity;
import org.openmetadata.service.util.EntityUtil.Fields;
import org.openmetadata.service.util.EntityUtil.RelationIncludes;

class RequestEntityCacheTest {

  @AfterEach
  void cleanup() {
    RequestEntityCache.clear();
  }

  @Test
  void getByIdReturnsDefensiveCopy() {
    UUID id = UUID.randomUUID();
    Fields fields = new Fields(Set.of("owners"));
    RelationIncludes includes = RelationIncludes.fromInclude(NON_DELETED);
    Table table = new Table().withId(id).withName("orders");

    RequestEntityCache.putById(Entity.TABLE, id, fields, includes, true, table, Table.class);

    Table first = RequestEntityCache.getById(Entity.TABLE, id, fields, includes, true, Table.class);
    assertNotSame(table, first);
    first.withName("orders_mutated");

    Table second = RequestEntityCache.getById(Entity.TABLE, id, fields, includes, true, Table.class);
    assertEquals("orders", second.getName());
  }

  @Test
  void cacheKeyIncludesFieldSetRelationIncludeAndFromCacheFlag() {
    UUID id = UUID.randomUUID();
    Table table = new Table().withId(id).withName("lineitem");
    Fields fields = new Fields(Set.of("owners"));
    RelationIncludes includeAll = RelationIncludes.fromInclude(NON_DELETED);

    RequestEntityCache.putById(Entity.TABLE, id, fields, includeAll, true, table, Table.class);

    assertNull(
        RequestEntityCache.getById(
            Entity.TABLE,
            id,
            new Fields(Set.of("domains")),
            includeAll,
            true,
            Table.class));
    assertNull(
        RequestEntityCache.getById(
            Entity.TABLE, id, fields, RelationIncludes.fromInclude(null), true, Table.class));
    assertNull(RequestEntityCache.getById(Entity.TABLE, id, fields, includeAll, false, Table.class));
  }
}
