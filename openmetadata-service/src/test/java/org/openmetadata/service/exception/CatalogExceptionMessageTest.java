package org.openmetadata.service.exception;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.openmetadata.schema.type.TagLabel;

class CatalogExceptionMessageTest {

  @Test
  void testMutuallyExclusiveLabels_glossarySource() {
    TagLabel tag1 =
        new TagLabel()
            .withTagFQN("glossary1.term1")
            .withSource(TagLabel.TagSource.GLOSSARY)
            .withLabelType(TagLabel.LabelType.MANUAL);
    TagLabel tag2 =
        new TagLabel()
            .withTagFQN("glossary1.term2")
            .withSource(TagLabel.TagSource.GLOSSARY)
            .withLabelType(TagLabel.LabelType.MANUAL);

    String message = CatalogExceptionMessage.mutuallyExclusiveLabels(tag1, tag2);

    assertTrue(message.contains("Glossary terms"));
    assertTrue(message.contains("mutually exclusive"));
    assertEquals(
        "Glossary terms glossary1.term1 and glossary1.term2 are mutually exclusive"
            + " and can't be assigned together",
        message);
  }

  @Test
  void testMutuallyExclusiveLabels_classificationSource() {
    TagLabel tag1 =
        new TagLabel()
            .withTagFQN("classification.tag1")
            .withSource(TagLabel.TagSource.CLASSIFICATION)
            .withLabelType(TagLabel.LabelType.MANUAL);
    TagLabel tag2 =
        new TagLabel()
            .withTagFQN("classification.tag2")
            .withSource(TagLabel.TagSource.CLASSIFICATION)
            .withLabelType(TagLabel.LabelType.MANUAL);

    String message = CatalogExceptionMessage.mutuallyExclusiveLabels(tag1, tag2);

    assertTrue(message.contains("Tag labels"));
    assertTrue(message.contains("mutually exclusive"));
  }
}
