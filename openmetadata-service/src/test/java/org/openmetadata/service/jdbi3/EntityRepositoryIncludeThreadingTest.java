/*
 *  Copyright 2021 Collate
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *  http://www.apache.org/licenses/LICENSE-2.0
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

package org.openmetadata.service.jdbi3;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.CALLS_REAL_METHODS;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.MockedStatic;
import org.openmetadata.schema.entity.data.Pipeline;
import org.openmetadata.schema.type.Include;
import org.openmetadata.schema.type.Relationship;
import org.openmetadata.service.Entity;
import org.openmetadata.service.util.EntityUtil.Fields;
import org.openmetadata.service.util.EntityUtil.RelationIncludes;

class EntityRepositoryIncludeThreadingTest {

  private CollectionDAO daoCollection;
  private CollectionDAO.EntityRelationshipDAO relationshipDAO;
  private CollectionDAO.PipelineDAO pipelineDAO;
  private TestPipelineRepo repo;

  private static class TestPipelineRepo extends EntityRepository<Pipeline> {
    TestPipelineRepo(CollectionDAO.PipelineDAO dao) {
      super("pipelines", Entity.PIPELINE, Pipeline.class, dao, "owners", "owners");
    }

    @Override
    protected void setFields(Pipeline entity, Fields fields, RelationIncludes r) {}

    @Override
    protected void clearFields(Pipeline entity, Fields fields) {}

    @Override
    protected void prepare(Pipeline entity, boolean update) {}

    @Override
    protected void storeEntity(Pipeline entity, boolean update) {}

    @Override
    protected void storeRelationships(Pipeline entity) {}
  }

  @BeforeEach
  void setUp() {
    daoCollection = mock(CollectionDAO.class);
    relationshipDAO = mock(CollectionDAO.EntityRelationshipDAO.class);
    pipelineDAO = mock(CollectionDAO.PipelineDAO.class);

    when(daoCollection.tagUsageDAO()).thenReturn(mock(CollectionDAO.TagUsageDAO.class));
    when(daoCollection.relationshipDAO()).thenReturn(relationshipDAO);

    Entity.setCollectionDAO(daoCollection);
    Entity.setJobDAO(null);
    Entity.setSearchRepository(null);
    Entity.setEntityRelationshipRepository(null);

    repo = new TestPipelineRepo(pipelineDAO);
  }

  @AfterEach
  void tearDown() {
    Entity.setCollectionDAO(null);
    Entity.setJobDAO(null);
    Entity.setSearchRepository(null);
    Entity.setEntityRelationshipRepository(null);
  }

  private Pipeline pipelineWithOwner(UUID pipelineId, UUID ownerId) {
    CollectionDAO.EntityRelationshipObject ownerRel =
        CollectionDAO.EntityRelationshipObject.builder()
            .fromId(ownerId.toString())
            .toId(pipelineId.toString())
            .fromEntity(Entity.USER)
            .toEntity(Entity.PIPELINE)
            .relation(Relationship.OWNS.ordinal())
            .build();
    when(relationshipDAO.findFromBatchWithRelations(
            anyList(), anyString(), anyList(), any(Include.class)))
        .thenReturn(List.of(ownerRel));
    return new Pipeline()
        .withId(pipelineId)
        .withName("test-pipeline")
        .withFullyQualifiedName("service.test-pipeline");
  }

  @Test
  void setFieldsInBulk_twoParam_passesNonDeleted() {
    Pipeline pipeline = pipelineWithOwner(UUID.randomUUID(), UUID.randomUUID());
    Fields fields = new Fields(Set.of("owners"));

    ArgumentCaptor<Include> includeCaptor = ArgumentCaptor.forClass(Include.class);
    try (MockedStatic<Entity> entityStatic = mockStatic(Entity.class, CALLS_REAL_METHODS)) {
      entityStatic
          .when(() -> Entity.getEntityReferencesByIdsRespectingInclude(any(), any(), any()))
          .thenReturn(List.of());

      repo.setFieldsInBulk(fields, List.of(pipeline));

      entityStatic.verify(
          () ->
              Entity.getEntityReferencesByIdsRespectingInclude(
                  anyString(), anyList(), includeCaptor.capture()));
      assertEquals(Include.NON_DELETED, includeCaptor.getValue());
    }
  }

  @Test
  void setFieldsInBulk_withNonDeleted_passesNonDeleted() {
    Pipeline pipeline = pipelineWithOwner(UUID.randomUUID(), UUID.randomUUID());
    Fields fields = new Fields(Set.of("owners"));

    ArgumentCaptor<Include> includeCaptor = ArgumentCaptor.forClass(Include.class);
    try (MockedStatic<Entity> entityStatic = mockStatic(Entity.class, CALLS_REAL_METHODS)) {
      entityStatic
          .when(() -> Entity.getEntityReferencesByIdsRespectingInclude(any(), any(), any()))
          .thenReturn(List.of());

      repo.setFieldsInBulk(fields, List.of(pipeline), Include.NON_DELETED);

      entityStatic.verify(
          () ->
              Entity.getEntityReferencesByIdsRespectingInclude(
                  anyString(), anyList(), includeCaptor.capture()));
      assertEquals(Include.NON_DELETED, includeCaptor.getValue());
    }
  }

  @Test
  void setFieldsInBulk_withAll_passesAll() {
    Pipeline pipeline = pipelineWithOwner(UUID.randomUUID(), UUID.randomUUID());
    Fields fields = new Fields(Set.of("owners"));

    ArgumentCaptor<Include> includeCaptor = ArgumentCaptor.forClass(Include.class);
    try (MockedStatic<Entity> entityStatic = mockStatic(Entity.class, CALLS_REAL_METHODS)) {
      entityStatic
          .when(() -> Entity.getEntityReferencesByIdsRespectingInclude(any(), any(), any()))
          .thenReturn(List.of());

      repo.setFieldsInBulk(fields, List.of(pipeline), Include.ALL);

      entityStatic.verify(
          () ->
              Entity.getEntityReferencesByIdsRespectingInclude(
                  anyString(), anyList(), includeCaptor.capture()));
      assertEquals(Include.ALL, includeCaptor.getValue());
    }
  }

  @Test
  void setFieldsInBulk_withNull_defaultsToNonDeleted() {
    Pipeline pipeline = pipelineWithOwner(UUID.randomUUID(), UUID.randomUUID());
    Fields fields = new Fields(Set.of("owners"));

    ArgumentCaptor<Include> includeCaptor = ArgumentCaptor.forClass(Include.class);
    try (MockedStatic<Entity> entityStatic = mockStatic(Entity.class, CALLS_REAL_METHODS)) {
      entityStatic
          .when(() -> Entity.getEntityReferencesByIdsRespectingInclude(any(), any(), any()))
          .thenReturn(List.of());

      repo.setFieldsInBulk(fields, List.of(pipeline), null);

      entityStatic.verify(
          () ->
              Entity.getEntityReferencesByIdsRespectingInclude(
                  anyString(), anyList(), includeCaptor.capture()));
      assertEquals(Include.NON_DELETED, includeCaptor.getValue());
    }
  }
}
