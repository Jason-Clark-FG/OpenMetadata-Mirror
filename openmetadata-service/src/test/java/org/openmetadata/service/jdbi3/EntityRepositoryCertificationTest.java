package org.openmetadata.service.jdbi3;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.openmetadata.schema.entity.data.Pipeline;
import org.openmetadata.schema.type.AssetCertification;
import org.openmetadata.schema.type.TagLabel;
import org.openmetadata.schema.type.TagLabelMetadata;
import org.openmetadata.service.Entity;
import org.openmetadata.service.jdbi3.CollectionDAO.TagUsageDAO;
import org.openmetadata.service.util.EntityUtil.Fields;
import org.openmetadata.service.util.EntityUtil.RelationIncludes;

class EntityRepositoryCertificationTest {

  private CollectionDAO daoCollection;
  private TagUsageDAO tagUsageDAO;
  private CollectionDAO.EntityRelationshipDAO relationshipDAO;
  private CollectionDAO.PipelineDAO pipelineDAO;
  private TestPipelineRepo repo;

  private static class TestPipelineRepo extends EntityRepository<Pipeline> {
    TestPipelineRepo(CollectionDAO.PipelineDAO dao) {
      super(
          "pipelines",
          Entity.PIPELINE,
          Pipeline.class,
          dao,
          "certification,tags,owners",
          "certification,tags,owners");
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
    tagUsageDAO = mock(TagUsageDAO.class);
    relationshipDAO = mock(CollectionDAO.EntityRelationshipDAO.class);
    pipelineDAO = mock(CollectionDAO.PipelineDAO.class);

    when(daoCollection.tagUsageDAO()).thenReturn(tagUsageDAO);
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

  @Test
  void getCertificationReturnsCertWhenTagFound() {
    Pipeline entity =
        new Pipeline()
            .withId(UUID.randomUUID())
            .withName("my-pipeline")
            .withFullyQualifiedName("service.my-pipeline");

    CollectionDAO.TagUsageDAO.TagLabelWithFQNHash tagEntry =
        new CollectionDAO.TagUsageDAO.TagLabelWithFQNHash();
    tagEntry.setTagFQN("Certification.Gold");
    tagEntry.setSource(TagLabel.TagSource.CLASSIFICATION.ordinal());
    tagEntry.setLabelType(TagLabel.LabelType.AUTOMATED.ordinal());
    tagEntry.setState(TagLabel.State.CONFIRMED.ordinal());

    when(tagUsageDAO.getCertTagsInternalBatch(anyList(), anyString()))
        .thenReturn(List.of(tagEntry));

    AssetCertification cert = repo.getCertification(entity);

    assertNotNull(cert);
    assertNotNull(cert.getTagLabel());
  }

  @Test
  void getCertificationReturnsNullWhenNoTagFound() {
    Pipeline entity =
        new Pipeline()
            .withId(UUID.randomUUID())
            .withName("my-pipeline")
            .withFullyQualifiedName("service.my-pipeline");

    when(tagUsageDAO.getCertTagsInternalBatch(anyList(), anyString())).thenReturn(List.of());

    AssetCertification cert = repo.getCertification(entity);

    assertNull(cert);
  }

  @Test
  void applyCertificationIsNoOpWhenTagLabelIsNull() {
    AssetCertification certWithNullTag = new AssetCertification().withTagLabel(null);
    Pipeline entity =
        new Pipeline()
            .withId(UUID.randomUUID())
            .withName("my-pipeline")
            .withFullyQualifiedName("service.my-pipeline")
            .withCertification(certWithNullTag);

    assertDoesNotThrow(() -> repo.applyCertification(entity));

    verify(tagUsageDAO, never())
        .applyTag(
            anyInt(),
            anyString(),
            anyString(),
            anyString(),
            anyInt(),
            anyInt(),
            nullable(String.class),
            nullable(String.class),
            nullable(String.class));
  }

  @Test
  void applyCertificationIsNoOpWhenCertificationIsNull() {
    Pipeline entity =
        new Pipeline()
            .withId(UUID.randomUUID())
            .withName("my-pipeline")
            .withFullyQualifiedName("service.my-pipeline")
            .withCertification(null);

    assertDoesNotThrow(() -> repo.applyCertification(entity));

    verify(tagUsageDAO, never())
        .applyTag(
            anyInt(),
            anyString(),
            anyString(),
            anyString(),
            anyInt(),
            anyInt(),
            nullable(String.class),
            nullable(String.class),
            nullable(String.class));
  }

  @Test
  void applyCertificationSkipsWhenSameCertAlreadyExists() {
    TagLabel tagLabel = new TagLabel().withTagFQN("Certification.Gold");
    AssetCertification incoming =
        new AssetCertification().withTagLabel(tagLabel).withExpiryDate(null);

    Pipeline entity =
        new Pipeline()
            .withId(UUID.randomUUID())
            .withName("my-pipeline")
            .withFullyQualifiedName("service.my-pipeline")
            .withCertification(incoming);

    CollectionDAO.TagUsageDAO.TagLabelWithFQNHash existingEntry =
        new CollectionDAO.TagUsageDAO.TagLabelWithFQNHash();
    existingEntry.setTagFQN("Certification.Gold");
    existingEntry.setSource(TagLabel.TagSource.CLASSIFICATION.ordinal());
    existingEntry.setLabelType(TagLabel.LabelType.AUTOMATED.ordinal());
    existingEntry.setState(TagLabel.State.CONFIRMED.ordinal());

    when(tagUsageDAO.getCertTagsInternalBatch(anyList(), anyString()))
        .thenReturn(List.of(existingEntry));

    assertDoesNotThrow(() -> repo.applyCertification(entity));

    verify(tagUsageDAO, never()).deleteTagsByPrefixAndTarget(anyInt(), anyString(), anyString());
  }

  @Test
  void applyCertificationAppliesTagWhenCertIsDifferent() {
    TagLabel incomingLabel = new TagLabel().withTagFQN("Certification.Silver");
    AssetCertification incoming =
        new AssetCertification().withTagLabel(incomingLabel).withExpiryDate(null);

    Pipeline entity =
        new Pipeline()
            .withId(UUID.randomUUID())
            .withName("my-pipeline")
            .withFullyQualifiedName("service.my-pipeline")
            .withCertification(incoming);

    when(tagUsageDAO.getCertTagsInternalBatch(anyList(), anyString())).thenReturn(List.of());

    assertDoesNotThrow(() -> repo.applyCertification(entity));

    verify(tagUsageDAO)
        .applyTag(
            anyInt(),
            anyString(),
            anyString(),
            anyString(),
            anyInt(),
            anyInt(),
            nullable(String.class),
            nullable(String.class),
            nullable(TagLabelMetadata.class));
  }

  @Test
  void deleteCertificationTagIsNoOpWhenEntityFqnIsEmpty() {
    assertDoesNotThrow(() -> repo.deleteCertificationTag(""));
  }

  @Test
  void deleteCertificationTagCallsDeleteWhenClassificationIsSet() {
    assertDoesNotThrow(() -> repo.deleteCertificationTag("service.my-pipeline"));

    verify(tagUsageDAO).deleteTagsByPrefixAndTarget(anyInt(), anyString(), anyString());
  }

  @Test
  void storeRelationshipsInternalEmptyListDoesNotCallDao() {
    assertDoesNotThrow(() -> repo.storeRelationshipsInternal(List.of()));

    verify(tagUsageDAO, never())
        .applyTag(
            anyInt(),
            anyString(),
            anyString(),
            anyString(),
            anyInt(),
            anyInt(),
            nullable(String.class),
            nullable(String.class),
            nullable(String.class));
  }

  @Test
  void storeRelationshipsInternalWithNoCertificationEntityDoesNotThrow() {
    Pipeline entity =
        new Pipeline()
            .withId(UUID.randomUUID())
            .withName("my-pipeline")
            .withFullyQualifiedName("service.my-pipeline")
            .withCertification(null);

    when(tagUsageDAO.getCertTagsInternalBatch(anyList(), anyString())).thenReturn(List.of());

    assertDoesNotThrow(() -> repo.storeRelationshipsInternal(List.of(entity)));
  }

  @Test
  void applyCertificationBatchIsNoOpWhenListIsEmpty() {
    assertDoesNotThrow(() -> repo.applyCertificationBatch(List.of()));

    verify(tagUsageDAO, never()).deleteTagsByPrefixAndTargets(anyInt(), anyString(), anyList());
    verify(tagUsageDAO, never()).applyTagsBatchMultiTarget(any(Map.class));
  }

  @Test
  void applyCertificationBatchIsNoOpWhenNoCertifiedEntities() {
    Pipeline entity =
        new Pipeline()
            .withId(UUID.randomUUID())
            .withName("my-pipeline")
            .withFullyQualifiedName("service.my-pipeline")
            .withCertification(null);

    assertDoesNotThrow(() -> repo.applyCertificationBatch(List.of(entity)));

    verify(tagUsageDAO, never()).deleteTagsByPrefixAndTargets(anyInt(), anyString(), anyList());
    verify(tagUsageDAO, never()).applyTagsBatchMultiTarget(any(Map.class));
  }

  @Test
  void applyCertificationBatchIsNoOpWhenTagLabelIsNull() {
    Pipeline entity =
        new Pipeline()
            .withId(UUID.randomUUID())
            .withName("my-pipeline")
            .withFullyQualifiedName("service.my-pipeline")
            .withCertification(new AssetCertification().withTagLabel(null));

    assertDoesNotThrow(() -> repo.applyCertificationBatch(List.of(entity)));

    verify(tagUsageDAO, never()).deleteTagsByPrefixAndTargets(anyInt(), anyString(), anyList());
  }

  @Test
  void applyCertificationBatchDeletesAndInsertsForCertifiedEntities() {
    TagLabel tagLabel = new TagLabel().withTagFQN("Certification.Gold");
    Pipeline entity =
        new Pipeline()
            .withId(UUID.randomUUID())
            .withName("my-pipeline")
            .withFullyQualifiedName("service.my-pipeline")
            .withCertification(new AssetCertification().withTagLabel(tagLabel));

    assertDoesNotThrow(() -> repo.applyCertificationBatch(List.of(entity)));

    verify(tagUsageDAO).deleteTagsByPrefixAndTargets(anyInt(), anyString(), anyList());
    verify(tagUsageDAO).applyTagsBatchMultiTarget(any(Map.class));
  }

  @Test
  void applyCertificationBatchOnlyProcessesCertifiedEntities() {
    TagLabel tagLabel = new TagLabel().withTagFQN("Certification.Silver");
    Pipeline certified =
        new Pipeline()
            .withId(UUID.randomUUID())
            .withName("certified-pipeline")
            .withFullyQualifiedName("service.certified-pipeline")
            .withCertification(new AssetCertification().withTagLabel(tagLabel));
    Pipeline uncertified =
        new Pipeline()
            .withId(UUID.randomUUID())
            .withName("uncertified-pipeline")
            .withFullyQualifiedName("service.uncertified-pipeline")
            .withCertification(null);

    assertDoesNotThrow(() -> repo.applyCertificationBatch(List.of(certified, uncertified)));

    verify(tagUsageDAO).deleteTagsByPrefixAndTargets(anyInt(), anyString(), anyList());
    verify(tagUsageDAO).applyTagsBatchMultiTarget(any(Map.class));
  }

  @Test
  void getTagsFiltersCertificationTags() {
    TagLabel certTag =
        new TagLabel()
            .withTagFQN("Certification.Gold")
            .withSource(TagLabel.TagSource.CLASSIFICATION)
            .withLabelType(TagLabel.LabelType.AUTOMATED);
    TagLabel regularTag =
        new TagLabel()
            .withTagFQN("PII.Sensitive")
            .withSource(TagLabel.TagSource.CLASSIFICATION)
            .withLabelType(TagLabel.LabelType.MANUAL);

    when(tagUsageDAO.getTags(anyString())).thenReturn(List.of(certTag, regularTag));

    List<TagLabel> tags = repo.getTags("service.my-pipeline");

    assertNotNull(tags);
    assertEquals(1, tags.size());
    assertEquals("PII.Sensitive", tags.get(0).getTagFQN());
  }

  @Test
  void toTagLabelMapsFieldsCorrectly() {
    TagLabelMetadata metadata = new TagLabelMetadata().withExpiryDate(12345L);
    CollectionDAO.TagUsageDAO.TagLabelWithFQNHash hash =
        new CollectionDAO.TagUsageDAO.TagLabelWithFQNHash();
    hash.setSource(TagLabel.TagSource.CLASSIFICATION.ordinal());
    hash.setTagFQN("Certification.Gold");
    hash.setLabelType(TagLabel.LabelType.AUTOMATED.ordinal());
    hash.setState(TagLabel.State.CONFIRMED.ordinal());
    hash.setMetadata(metadata);

    TagLabel label = hash.toTagLabel();

    assertEquals(TagLabel.TagSource.CLASSIFICATION, label.getSource());
    assertEquals("Certification.Gold", label.getTagFQN());
    assertEquals(TagLabel.LabelType.AUTOMATED, label.getLabelType());
    assertEquals(TagLabel.State.CONFIRMED, label.getState());
    assertEquals(12345L, label.getMetadata().getExpiryDate());
  }
}
