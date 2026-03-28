package org.openmetadata.service.governance.workflows.elements.nodes.manualTask;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.openmetadata.service.governance.workflows.elements.nodes.manualTask.impl.ManualTaskTemplateResolver;
import org.openmetadata.service.governance.workflows.elements.nodes.manualTask.impl.ManualTaskTemplateResolver.ResolvedTemplate;

class ManualTaskTemplateResolverTest {

  @ParameterizedTest
  @ValueSource(strings = {"IncidentResolution", "GlossaryApproval"})
  void testResolvedTemplateHasRequiredFields(String templateName) {
    ResolvedTemplate resolved = ManualTaskTemplateResolver.resolve(templateName);

    assertNotNull(resolved.taskCategory());
    assertNotNull(resolved.taskType());
    assertFalse(resolved.statuses().isEmpty(), "statuses must not be empty");
    assertFalse(resolved.terminalStatuses().isEmpty(), "terminalStatuses must not be empty");
  }

  @ParameterizedTest
  @ValueSource(strings = {"IncidentResolution", "GlossaryApproval"})
  void testTerminalStatusesAreSubsetOfStatuses(String templateName) {
    ResolvedTemplate resolved = ManualTaskTemplateResolver.resolve(templateName);

    assertTrue(
        resolved.statuses().containsAll(resolved.terminalStatuses()),
        "terminalStatuses must be a subset of statuses");
  }

  @Test
  void testUnknownTemplateThrows() {
    assertThrows(
        IllegalArgumentException.class, () -> ManualTaskTemplateResolver.resolve("NonExistent"));
  }
}
