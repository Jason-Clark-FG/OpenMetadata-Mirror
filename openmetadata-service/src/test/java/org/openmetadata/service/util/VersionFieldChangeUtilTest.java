package org.openmetadata.service.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Set;
import org.junit.jupiter.api.Test;
import org.openmetadata.schema.type.ChangeDescription;
import org.openmetadata.schema.type.FieldChange;
import org.openmetadata.schema.utils.JsonUtils;

class VersionFieldChangeUtilTest {

  @Test
  void extractsSuffixKeysFromChangeDescription() {
    ChangeDescription changeDescription =
        new ChangeDescription()
            .withFieldsUpdated(
                java.util.List.of(
                    new FieldChange().withName("columns.tags.tagFQN"),
                    new FieldChange().withName("description")));

    Set<String> fieldChangeKeys = VersionFieldChangeUtil.extractFieldChangeKeys(changeDescription);

    assertTrue(fieldChangeKeys.contains("columns.tags.tagFQN"));
    assertTrue(fieldChangeKeys.contains("tags.tagFQN"));
    assertTrue(fieldChangeKeys.contains("tagFQN"));
    assertTrue(fieldChangeKeys.contains("description"));
  }

  @Test
  void serializesUniqueFieldChangeKeysPerSuffix() {
    ChangeDescription changeDescription =
        new ChangeDescription()
            .withFieldsAdded(
                java.util.List.of(new FieldChange().withName("schema.fields.description")))
            .withFieldsUpdated(
                java.util.List.of(new FieldChange().withName("schema.fields.description")));

    var keys =
        JsonUtils.readObjects(
            VersionFieldChangeUtil.getChangedFieldKeysJson(changeDescription), String.class);

    assertEquals(3, keys.size());
    assertTrue(keys.contains("schema.fields.description"));
    assertTrue(keys.contains("fields.description"));
    assertTrue(keys.contains("description"));
  }
}
