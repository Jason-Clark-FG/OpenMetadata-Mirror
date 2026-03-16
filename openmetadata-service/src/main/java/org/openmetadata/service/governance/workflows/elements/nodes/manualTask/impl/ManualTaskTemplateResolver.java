package org.openmetadata.service.governance.workflows.elements.nodes.manualTask.impl;

import java.util.List;
import org.openmetadata.schema.type.TaskCategory;
import org.openmetadata.schema.type.TaskEntityType;

/**
 * Resolves a manual task template name to its full configuration. Hardcoded for now — will be
 * replaced by a DB lookup when Task Templates become entities.
 */
public class ManualTaskTemplateResolver {

  public record ResolvedTemplate(
      TaskCategory taskCategory,
      TaskEntityType taskType,
      List<String> statuses,
      List<String> terminalStatuses) {}

  public static ResolvedTemplate resolve(String templateName) {
    return switch (templateName) {
      case "IncidentResolution" -> new ResolvedTemplate(
          TaskCategory.Incident,
          TaskEntityType.IncidentResolution,
          List.of("Open", "InProgress", "Pending", "Completed"),
          List.of("Completed"));
      case "GlossaryApproval" -> new ResolvedTemplate(
          TaskCategory.Approval,
          TaskEntityType.GlossaryApproval,
          List.of("Pending", "Approved", "Rejected"),
          List.of("Approved", "Rejected"));
      default -> throw new IllegalArgumentException(
          "Unknown manual task template: " + templateName);
    };
  }
}
