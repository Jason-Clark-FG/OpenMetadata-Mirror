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

import lombok.extern.slf4j.Slf4j;
import org.openmetadata.schema.entity.ai.AIApplication;
import org.openmetadata.schema.type.change.ChangeSource;
import org.openmetadata.service.Entity;
import org.openmetadata.service.resources.ai.AIApplicationResource;
import org.openmetadata.service.util.EntityUtil.Fields;
import org.openmetadata.service.util.EntityUtil.RelationIncludes;

@Slf4j
@Repository
public class AIApplicationRepository extends EntityRepository<AIApplication> {
  private static final String APPLICATION_UPDATE_FIELDS = "modelConfigurations,tools,dataSources";
  private static final String APPLICATION_PATCH_FIELDS = "modelConfigurations,tools,dataSources";

  public AIApplicationRepository() {
    super(
        AIApplicationResource.COLLECTION_PATH,
        Entity.AI_APPLICATION,
        AIApplication.class,
        Entity.getCollectionDAO().aiApplicationDAO(),
        APPLICATION_PATCH_FIELDS,
        APPLICATION_UPDATE_FIELDS);
    supportsSearch = true;
  }

  @Override
  public void setFields(
      AIApplication aiApplication, Fields fields, RelationIncludes relationIncludes) {
    // No additional fields to set beyond base entity fields
  }

  @Override
  public void clearFields(AIApplication aiApplication, Fields fields) {
    // No additional fields to clear
  }

  @Override
  public void prepare(AIApplication aiApplication, boolean update) {
    // Entity references in modelConfigurations are stored as-is without validation
    // as they may reference external LLM models
  }

  @Override
  public void storeEntity(AIApplication aiApplication, boolean update) {
    store(aiApplication, update);
  }

  @Override
  public void storeRelationships(AIApplication aiApplication) {
    // Relationships are stored as part of the JSON entity
    // No additional relationship tables needed for this entity
  }

  @Override
  public EntityRepository<AIApplication>.EntityUpdater getUpdater(
      AIApplication original,
      AIApplication updated,
      Operation operation,
      ChangeSource changeSource) {
    return new AIApplicationUpdater(original, updated, operation);
  }

  public class AIApplicationUpdater extends EntityUpdater {
    public AIApplicationUpdater(
        AIApplication original, AIApplication updated, Operation operation) {
      super(original, updated, operation);
    }

    @Override
    public void entitySpecificUpdate(boolean consolidatingChanges) {
      if (shouldCompare("applicationType"))
        recordChange(
            "applicationType", original.getApplicationType(), updated.getApplicationType());
      if (shouldCompare("developmentStage"))
        recordChange(
            "developmentStage", original.getDevelopmentStage(), updated.getDevelopmentStage());
      if (shouldCompare("modelConfigurations"))
        recordChange(
            "modelConfigurations",
            original.getModelConfigurations(),
            updated.getModelConfigurations(),
            true);
      if (shouldCompare("primaryModel"))
        recordChange("primaryModel", original.getPrimaryModel(), updated.getPrimaryModel(), true);
      if (shouldCompare("promptTemplates"))
        recordChange(
            "promptTemplates", original.getPromptTemplates(), updated.getPromptTemplates(), true);
      if (shouldCompare("tools"))
        recordChange("tools", original.getTools(), updated.getTools(), true);
      if (shouldCompare("dataSources"))
        recordChange("dataSources", original.getDataSources(), updated.getDataSources(), true);
      if (shouldCompare("knowledgeBases"))
        recordChange(
            "knowledgeBases", original.getKnowledgeBases(), updated.getKnowledgeBases(), true);
      if (shouldCompare("upstreamApplications"))
        recordChange(
            "upstreamApplications",
            original.getUpstreamApplications(),
            updated.getUpstreamApplications(),
            true);
      if (shouldCompare("downstreamApplications"))
        recordChange(
            "downstreamApplications",
            original.getDownstreamApplications(),
            updated.getDownstreamApplications(),
            true);
      if (shouldCompare("framework"))
        recordChange("framework", original.getFramework(), updated.getFramework(), true);
      if (shouldCompare("governanceMetadata"))
        recordChange(
            "governanceMetadata",
            original.getGovernanceMetadata(),
            updated.getGovernanceMetadata(),
            true);
      if (shouldCompare("biasMetrics"))
        recordChange("biasMetrics", original.getBiasMetrics(), updated.getBiasMetrics(), true);
      if (shouldCompare("performanceMetrics"))
        recordChange(
            "performanceMetrics",
            original.getPerformanceMetrics(),
            updated.getPerformanceMetrics(),
            true);
      if (shouldCompare("qualityMetrics"))
        recordChange(
            "qualityMetrics", original.getQualityMetrics(), updated.getQualityMetrics(), true);
      if (shouldCompare("safetyMetrics"))
        recordChange(
            "safetyMetrics", original.getSafetyMetrics(), updated.getSafetyMetrics(), true);
      if (shouldCompare("testSuites"))
        recordChange("testSuites", original.getTestSuites(), updated.getTestSuites(), true);
      if (shouldCompare("sourceCode"))
        recordChange("sourceCode", original.getSourceCode(), updated.getSourceCode());
      if (shouldCompare("deploymentUrl"))
        recordChange("deploymentUrl", original.getDeploymentUrl(), updated.getDeploymentUrl());
      if (shouldCompare("documentation"))
        recordChange("documentation", original.getDocumentation(), updated.getDocumentation());
    }
  }
}
