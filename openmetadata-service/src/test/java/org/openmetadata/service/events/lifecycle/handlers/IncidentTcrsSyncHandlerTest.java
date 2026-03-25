package org.openmetadata.service.events.lifecycle.handlers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.openmetadata.schema.entity.tasks.Task;
import org.openmetadata.schema.type.TaskCategory;
import org.openmetadata.schema.type.TaskEntityType;
import org.openmetadata.service.Entity;
import org.openmetadata.service.resources.feeds.MessageParser;

class IncidentTcrsSyncHandlerTest {

  private final IncidentTcrsSyncHandler handler = new IncidentTcrsSyncHandler();

  @Test
  void handlerName() {
    assertEquals("IncidentTcrsSyncHandler", handler.getHandlerName());
  }

  @Test
  void supportedEntityTypes_onlyTask() {
    assertEquals(Set.of(Entity.TASK), handler.getSupportedEntityTypes());
  }

  @Test
  void isAsync_true() {
    assertTrue(handler.isAsync());
  }

  @Test
  void parseAboutEntityLink_extractsTestCaseFqnAndStateId() {
    UUID stateId = UUID.randomUUID();
    String link = "<#E::testCase::myService.myDb.mySchema.myTestCase::incidents::" + stateId + ">";

    MessageParser.EntityLink parsed = MessageParser.EntityLink.parse(link);

    assertEquals("testCase", parsed.getEntityType());
    assertEquals("myService.myDb.mySchema.myTestCase", parsed.getEntityFQN());
    assertEquals("incidents", parsed.getFieldName());
    assertEquals(stateId.toString(), parsed.getArrayFieldName());
  }

  @Test
  void isIncidentTask_trueForIncidentCategoryWithLink() {
    Task task =
        new Task()
            .withCategory(TaskCategory.Incident)
            .withType(TaskEntityType.TestCaseResolution)
            .withAboutEntityLink("<#E::testCase::fqn::incidents::" + UUID.randomUUID() + ">");

    assertTrue(handler.isIncidentTask(task));
  }

  @Test
  void isIncidentTask_falseForNonIncidentCategory() {
    Task task =
        new Task()
            .withCategory(TaskCategory.Approval)
            .withAboutEntityLink("<#E::glossaryTerm::fqn>");

    assertFalse(handler.isIncidentTask(task));
  }

  @Test
  void isIncidentTask_falseForMissingLink() {
    Task task = new Task().withCategory(TaskCategory.Incident);

    assertFalse(handler.isIncidentTask(task));
  }

  @Test
  void isIncidentTask_falseForLinkWithoutIncidentsField() {
    Task task =
        new Task().withCategory(TaskCategory.Incident).withAboutEntityLink("<#E::testCase::fqn>");

    assertFalse(handler.isIncidentTask(task));
  }

  @Test
  void isIncidentTask_falseForBlankLink() {
    Task task = new Task().withCategory(TaskCategory.Incident).withAboutEntityLink("");

    assertFalse(handler.isIncidentTask(task));
  }

  @Test
  void isIncidentTask_falseForIncidentsFieldWithoutStateId() {
    Task task =
        new Task()
            .withCategory(TaskCategory.Incident)
            .withAboutEntityLink("<#E::testCase::fqn::incidents>");

    assertFalse(handler.isIncidentTask(task));
  }
}
