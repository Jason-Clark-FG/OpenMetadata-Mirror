/*
 *  Copyright 2026 Collate
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
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.jdbi.v3.core.Jdbi;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.openmetadata.schema.entity.data.Folder;
import org.openmetadata.schema.type.Relationship;
import org.openmetadata.service.Entity;
import org.openmetadata.service.util.EntityUtil.Fields;

/**
 * Guards the folder-listing {@code childrenCount} query shape introduced for the Context Center
 * document-page pagination work. A page of folders must resolve every folder's non-deleted child
 * file count in a single batched scan ({@code countNonDeletedChildFilesBatch}) rather than one
 * {@code COUNT(*)} per folder (N+1), and an empty page must issue no query at all — the batch DAO
 * method binds {@code fromIds} with {@code @BindList}, which throws on an empty list, so the empty
 * page is guarded before the query is reached.
 */
class FolderRepositoryListingTest {

  private CollectionDAO daoCollection;
  private CollectionDAO.EntityRelationshipDAO relationshipDAO;
  private FolderRepository repository;

  @BeforeEach
  void setUp() {
    daoCollection = mock(CollectionDAO.class);
    relationshipDAO = mock(CollectionDAO.EntityRelationshipDAO.class);
    CollectionDAO.FolderDAO folderDAO = mock(CollectionDAO.FolderDAO.class);
    when(daoCollection.relationshipDAO()).thenReturn(relationshipDAO);
    when(daoCollection.folderDAO()).thenReturn(folderDAO);
    Jdbi jdbi = mock(Jdbi.class);
    when(jdbi.onDemand(CollectionDAO.class)).thenReturn(daoCollection);
    Entity.setCollectionDAO(daoCollection);
    repository = new FolderRepository(jdbi);
  }

  @AfterEach
  void tearDown() {
    Entity.cleanup();
  }

  @Test
  void childrenCount_isBatchedIntoOneQueryPerPage() {
    Folder f0 = folder("drive.f0");
    Folder f1 = folder("drive.f1");
    when(relationshipDAO.countNonDeletedChildFilesBatch(
            anyList(), anyString(), anyInt(), anyString()))
        .thenReturn(
            List.of(
                CollectionDAO.EntityRelationshipCount.builder().id(f0.getId()).count(3).build()));

    repository.setFieldsInBulk(
        new Fields(Set.of("childrenCount")), new ArrayList<>(List.of(f0, f1)));

    // One batched scan for the whole page, never a per-folder COUNT(*).
    verify(relationshipDAO, times(1))
        .countNonDeletedChildFilesBatch(anyList(), anyString(), anyInt(), anyString());
    verify(relationshipDAO, never())
        .countNonDeletedChildFiles(any(UUID.class), anyString(), anyInt(), anyString());
    assertEquals(3, f0.getChildrenCount());
    // A folder absent from the batch result (no non-deleted children) defaults to 0.
    assertEquals(0, f1.getChildrenCount());
  }

  @Test
  void childrenCount_queriesContainsRelationBetweenFolderAndContextFile() {
    Folder f0 = folder("drive.f0");
    when(relationshipDAO.countNonDeletedChildFilesBatch(
            anyList(), anyString(), anyInt(), anyString()))
        .thenReturn(List.of());

    repository.setFieldsInBulk(new Fields(Set.of("childrenCount")), new ArrayList<>(List.of(f0)));

    // Locks the relationship semantics: folder --CONTAINS--> contextFile.
    verify(relationshipDAO)
        .countNonDeletedChildFilesBatch(
            anyList(),
            eq(FolderRepository.FOLDER_ENTITY),
            eq(Relationship.CONTAINS.ordinal()),
            eq(ContextFileRepository.CONTEXT_FILE_ENTITY));
  }

  @Test
  void childrenCount_forEmptyPage_issuesNoQuery() {
    // The @BindList("fromIds") batch method throws on an empty list; an empty page must be guarded
    // before the DAO call so GET /folders?fields=childrenCount on a zero-folder instance stays 200.
    repository.setFieldsInBulk(new Fields(Set.of("childrenCount")), new ArrayList<>());

    verify(relationshipDAO, never())
        .countNonDeletedChildFilesBatch(anyList(), anyString(), anyInt(), anyString());
  }

  @Test
  void childrenCount_notRequested_issuesNoQueryAndClearsField() {
    Folder f0 = folder("drive.f0");

    repository.setFieldsInBulk(new Fields(Set.of()), new ArrayList<>(List.of(f0)));

    verify(relationshipDAO, never())
        .countNonDeletedChildFilesBatch(anyList(), anyString(), anyInt(), anyString());
    assertNull(f0.getChildrenCount());
  }

  private Folder folder(String fqn) {
    String name = fqn.substring(fqn.lastIndexOf('.') + 1);
    return new Folder().withId(UUID.randomUUID()).withName(name).withFullyQualifiedName(fqn);
  }
}
