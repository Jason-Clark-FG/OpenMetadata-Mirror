/*
 *  Copyright 2025 Collate.
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

import { expect, test as baseTest } from '../../support/fixtures/userPages';
import { CustomPropertiesPageObject } from '../PageObject/Explore/CustomPropertiesPageObject';
import { DataQualityPageObject } from '../PageObject/Explore/DataQualityPageObject';
import { LineagePageObject } from '../PageObject/Explore/LineagePageObject';
import { OverviewPageObject } from '../PageObject/Explore/OverviewPageObject';
import { RightPanelPageObject } from '../PageObject/Explore/RightPanelPageObject';
import { SchemaPageObject } from '../PageObject/Explore/SchemaPageObject';
import { TableClass } from '../../support/entity/TableClass';
import { ClassificationClass } from '../../support/tag/ClassificationClass';
import { TagClass } from '../../support/tag/TagClass';
import { Glossary } from '../../support/glossary/Glossary';
import { GlossaryTerm } from '../../support/glossary/GlossaryTerm';
import { uuid } from '../../utils/common';
import { performAdminLogin } from '../../utils/admin';
import { performUserLogin } from '../../utils/user';
import { DashboardClass } from '../../support/entity/DashboardClass';
import { DatabaseClass } from '../../support/entity/DatabaseClass';
import { TopicClass } from '../../support/entity/TopicClass';
import { PipelineClass } from '../../support/entity/PipelineClass';
import { DatabaseSchemaClass } from '../../support/entity/DatabaseSchemaClass';
import { DashboardDataModelClass } from '../../support/entity/DashboardDataModelClass';
import { MlModelClass } from '../../support/entity/MlModelClass';
import { ContainerClass } from '../../support/entity/ContainerClass';
import { SearchIndexClass } from '../../support/entity/SearchIndexClass';
import { Domain } from '../../support/domain/Domain';
import { UserClass } from '../../support/user/UserClass';
import { navigateToExploreAndSelectEntity } from '../../utils/explore';
import { getEntityFqn } from '../../utils/entityPanel';

// Test data setup
const tableEntity = new TableClass();
const dashboardEntity = new DashboardClass();
const pipelineEntity = new PipelineClass();
const topicEntity = new TopicClass();
const databaseEntity = new DatabaseClass();
const databaseSchemaEntity = new DatabaseSchemaClass();
const dashboardDataModelEntity = new DashboardDataModelClass();
const mlmodelEntity = new MlModelClass();
const containerEntity = new ContainerClass();
const searchIndexEntity = new SearchIndexClass();
const domainEntity = new Domain();
const user1 = new UserClass();
// Dedicated entity for the DataConsumer owner-restriction test.
// Keeping it separate prevents race conditions with parallel tests that add/remove
// owners on the shared entityMap entities.
const dcOwnerTestTable = new TableClass();

const testClassification = new ClassificationClass();
const testTag = new TagClass({
  classification: testClassification.data.name,
});
const testGlossary = new Glossary();
const testGlossaryTerm = new GlossaryTerm(testGlossary);

// Entity mapping for tests
const entityMap = {
  table: tableEntity,
  dashboard: dashboardEntity,
  pipeline: pipelineEntity,
  topic: topicEntity,
  database: databaseEntity,
  databaseSchema: databaseSchemaEntity,
  dashboardDataModel: dashboardDataModelEntity,
  mlmodel: mlmodelEntity,
  container: containerEntity,
  searchIndex: searchIndexEntity,
};

// Define local fixture using test.extend
const test = baseTest.extend<{
  rightPanel: RightPanelPageObject;
  overview: OverviewPageObject;
  schema: SchemaPageObject;
  lineage: LineagePageObject;
  dataQuality: DataQualityPageObject;
  customProperties: CustomPropertiesPageObject;
}>({
  rightPanel: async ({ adminPage }, use) => {
    await use(new RightPanelPageObject(adminPage));
  },
  overview: async ({ rightPanel }, use) => {
    await use(new OverviewPageObject(rightPanel));
  },
  schema: async ({ rightPanel }, use) => {
    await use(new SchemaPageObject(rightPanel));
  },
  lineage: async ({ rightPanel }, use) => {
    await use(new LineagePageObject(rightPanel));
  },
  dataQuality: async ({ rightPanel }, use) => {
    await use(new DataQualityPageObject(rightPanel));
  },
  customProperties: async ({ rightPanel }, use) => {
    await use(new CustomPropertiesPageObject(rightPanel));
  },
});

const domainToUpdate =
  domainEntity.responseData?.displayName ?? domainEntity.data.displayName;
const glossaryTermToUpdate =
  testGlossaryTerm.responseData?.displayName ??
  testGlossaryTerm.data.displayName;
const tagToUpdate =
  testTag.responseData?.displayName ?? testTag.data.displayName;
const testTier = 'Tier1';
const customPropertyData: Record<string, { property: { name: string } }> = {};

test.describe('Right Panel Test Suite', () => {
  // Setup test data and page objects
  test.beforeAll(async ({ browser }) => {
    test.slow(true); // 5 minutes
    const { apiContext, afterAction } = await performAdminLogin(browser);

    try {
      // Create all entities in parallel for better performance
      await Promise.all(
        Object.values(entityMap).map((entityInstance) =>
          entityInstance.create(apiContext)
        )
      );

      // Create custom properties sequentially to avoid timeout (each call creates 4 users + multiple properties)
      // Only create for entities that support custom properties
      for (const [entityType, entityInstance] of Object.entries(entityMap)) {
        try {
          await entityInstance.prepareCustomProperty(apiContext);

          // Populate customPropertyData from entity's customPropertyValue
          // Get the first property from customPropertyValue (which is keyed by property type names like 'string', 'integer', etc.)
          const firstProperty = Object.values(
            entityInstance.customPropertyValue
          )[0];
          if (firstProperty) {
            customPropertyData[entityType] = {
              property: firstProperty.property,
            };
          }
        } catch (error) {
          console.warn(
            `Failed to create custom property for ${entityType}:`,
            error
          );
          // Continue with other entities even if one fails
        }
      }

      await testClassification.create(apiContext);
      await testTag.create(apiContext);
      await testGlossary.create(apiContext);
      await testGlossaryTerm.create(apiContext);
      await domainEntity.create(apiContext);
      await user1.create(apiContext);
      await dcOwnerTestTable.create(apiContext);
    } finally {
      await afterAction();
    }
  });

  // No need for explicit beforeEach instantiation as fixtures handle it
  test.beforeEach(async () => {
    test.slow(true);
  });

  // Cleanup test data
  test.afterAll(async ({ browser }) => {
    const { apiContext, afterAction } = await performAdminLogin(browser);

    try {
      await Promise.all(
        Object.values(entityMap).map((entityInstance) =>
          entityInstance.delete(apiContext)
        )
      );
      await testTag.delete(apiContext);
      await testClassification.delete(apiContext);
      await testGlossaryTerm.delete(apiContext);
      await testGlossary.delete(apiContext);
      await user1.delete(apiContext);
      await domainEntity.delete(apiContext);
      await dcOwnerTestTable.delete(apiContext);
    } finally {
      await afterAction();
    }
  });

  test.describe('Explore page right panel tests', () => {
    test.describe('Overview panel CRUD operations', () => {
      Object.entries(entityMap).forEach(([entityType, entityInstance]) => {
        test(`Should update description for ${entityType}`, async ({
          adminPage,
          rightPanel,
          overview,
        }) => {
          const fqn = getEntityFqn(entityInstance);
          await navigateToExploreAndSelectEntity(
            adminPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          await rightPanel.waitForPanelVisible();
          rightPanel.setEntityConfig(entityInstance);

          await overview.navigateToOverviewTab();
          await overview.shouldBeVisible();
          await overview.shouldShowDescriptionSection();

          const descriptionToUpdate = `${entityType} Test description - ${uuid()}`;
          await overview.editDescription(descriptionToUpdate);
          await overview.shouldShowDescriptionWithText(descriptionToUpdate);
        });

        test(`Should update/edit tags for ${entityType}`, async ({
          adminPage,
          rightPanel,
          overview,
        }) => {
          const fqn = getEntityFqn(entityInstance);
          await navigateToExploreAndSelectEntity(
            adminPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          await rightPanel.waitForPanelVisible();
          rightPanel.setEntityConfig(entityInstance);

          await overview.editTags(tagToUpdate);
          await overview.shouldShowTagsSection();
          await overview.shouldShowTag(tagToUpdate);
        });

        test(`Should update/edit tier for ${entityType}`, async ({
          adminPage,
          rightPanel,
          overview,
        }) => {
          const fqn = getEntityFqn(entityInstance);
          await navigateToExploreAndSelectEntity(
            adminPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          await rightPanel.waitForPanelVisible();
          rightPanel.setEntityConfig(entityInstance);

          await overview.assignTier(testTier);
          await overview.shouldShowTierSection();
          await overview.shouldShowTier(testTier);
        });

        test(`Should update/edit glossary terms for ${entityType}`, async ({
          adminPage,
          rightPanel,
          overview,
        }) => {
          const fqn = getEntityFqn(entityInstance);
          await navigateToExploreAndSelectEntity(
            adminPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          await rightPanel.waitForPanelVisible();
          rightPanel.setEntityConfig(entityInstance);

          await overview.editGlossaryTerms(glossaryTermToUpdate);
          await overview.shouldShowGlossaryTermsSection();
        });

        test(`Should update owners for ${entityType}`, async ({
          adminPage,
          rightPanel,
          overview,
        }) => {
          const fqn = getEntityFqn(entityInstance);
          await navigateToExploreAndSelectEntity(
            adminPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          await rightPanel.waitForPanelLoaded();
          await rightPanel.waitForPanelVisible();
          rightPanel.setEntityConfig(entityInstance);

          await overview.addOwnerWithoutValidation(user1.getUserDisplayName());
          await overview.shouldShowOwner(user1.getUserDisplayName());
        });

        test(`Should update domain for ${entityType}`, async ({
          adminPage,
          rightPanel,
          overview,
        }) => {
          const fqn = getEntityFqn(entityInstance);
          await navigateToExploreAndSelectEntity(
            adminPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          await rightPanel.waitForPanelVisible();
          rightPanel.setEntityConfig(entityInstance);

          await overview.editDomain(domainToUpdate);
          await overview.shouldShowDomainsSection();
          await overview.shouldShowDomain(domainToUpdate);
        });
      });
    });

    test.describe('Schema panel tests', () => {
      Object.entries(entityMap).forEach(([entityType, entityInstance]) => {
        test(`Should display and verify schema fields for ${entityType}`, async ({
          adminPage,
          rightPanel,
          schema,
        }) => {
          rightPanel.setEntityConfig(entityInstance);
          test.skip(
            !rightPanel.isTabAvailable('schema'),
            `Schema tab not available for ${entityType}`
          );

          const fqn = getEntityFqn(entityInstance);
          await navigateToExploreAndSelectEntity(
            adminPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          await rightPanel.waitForPanelVisible();
          await schema.navigateToSchemaTab();
          await schema.shouldBeVisible();
        });
      });
    });

    test.describe('Right panel validation by asset type', () => {
      Object.entries(entityMap).forEach(([entityType, entityInstance]) => {
        test(`validates visible/hidden tabs and tab content for ${entityType}`, async ({
          adminPage,
          rightPanel,
        }) => {
          const fqn = getEntityFqn(entityInstance);
          await navigateToExploreAndSelectEntity(
            adminPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          await rightPanel.waitForPanelLoaded();
          await rightPanel.validateRightPanelForAsset(entityType);
        });
      });
    });

    test.describe('Lineage - Navigation and Expansion', () => {
      Object.entries(entityMap).forEach(([entityType, entityInstance]) => {
        test(`Should navigate to lineage and test controls for ${entityType}`, async ({
          adminPage,
          rightPanel,
          lineage,
        }) => {
          rightPanel.setEntityConfig(entityInstance);
          test.skip(
            !rightPanel.isTabAvailable('lineage'),
            `Lineage tab not available for ${entityType}`
          );

          const fqn = getEntityFqn(entityInstance);
          await navigateToExploreAndSelectEntity(
            adminPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          await rightPanel.waitForPanelVisible();
          await lineage.navigateToLineageTab();
          await lineage.shouldBeVisible();
          await lineage.shouldShowLineageControls();
        });

        test(`Should handle lineage expansion buttons for ${entityType}`, async ({
          adminPage,
          rightPanel,
          lineage,
        }) => {
          rightPanel.setEntityConfig(entityInstance);
          test.skip(
            !rightPanel.isTabAvailable('lineage'),
            `Lineage tab not available for ${entityType}`
          );

          const fqn = getEntityFqn(entityInstance);
          await navigateToExploreAndSelectEntity(
            adminPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          await rightPanel.waitForPanelLoaded();
          await rightPanel.waitForPanelVisible();
          await lineage.navigateToLineageTab();
          const hasUpstreamButton = await lineage.hasUpstreamButton();
          if (hasUpstreamButton) {
            await lineage.clickUpstreamButton();
          }

          const hasDownstreamButton = await lineage.hasDownstreamButton();
          if (hasDownstreamButton) {
            await lineage.clickDownstreamButton();
          }
        });
      });
    });

    test.describe('DataQuality - Comprehensive UI Verification', () => {
      Object.entries(entityMap).forEach(([entityType, entityInstance]) => {
        test(`Should navigate to data quality and verify tab structure for ${entityType}`, async ({
          adminPage,
          rightPanel,
          dataQuality,
        }) => {
          rightPanel.setEntityConfig(entityInstance);
          test.skip(
            !rightPanel.isTabAvailable('data quality'),
            `Data Quality tab not available for ${entityType}`
          );

          const fqn = getEntityFqn(entityInstance);
          await navigateToExploreAndSelectEntity(
            adminPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          await rightPanel.waitForPanelLoaded();
          await rightPanel.waitForPanelVisible();
          await dataQuality.navigateToDataQualityTab();
          await dataQuality.shouldBeVisible();
        });

        test(`Should display incidents tab for ${entityType}`, async ({
          adminPage,
          rightPanel,
          dataQuality,
        }) => {
          rightPanel.setEntityConfig(entityInstance);
          test.skip(
            !rightPanel.isTabAvailable('data quality'),
            `Data Quality tab not available for ${entityType}`
          );

          const fqn = getEntityFqn(entityInstance);
          await navigateToExploreAndSelectEntity(
            adminPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          await rightPanel.waitForPanelLoaded();
          await rightPanel.waitForPanelVisible();
          await dataQuality.navigateToDataQualityTab();
          await dataQuality.shouldBeVisible();
          await dataQuality.navigateToIncidentsTab();
          await dataQuality.shouldShowIncidentsTab();
        });

        test(`Should verify empty state when no test cases for ${entityType}`, async ({
          adminPage,
          rightPanel,
          dataQuality,
        }) => {
          rightPanel.setEntityConfig(entityInstance);
          test.skip(
            !rightPanel.isTabAvailable('data quality'),
            `Data Quality tab not available for ${entityType}`
          );

          const fqn = getEntityFqn(entityInstance);
          await navigateToExploreAndSelectEntity(
            adminPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          await rightPanel.waitForPanelLoaded();
          await rightPanel.waitForPanelVisible();
          await dataQuality.navigateToDataQualityTab();
          await dataQuality.shouldBeVisible();
          await dataQuality.shouldShowTestCaseCardsCount(0);
        });
      });
    });

    test.describe('CustomProperties - Comprehensive Testing', () => {
      Object.entries(entityMap).forEach(([entityType, entityInstance]) => {
        test(`Should navigate to custom properties and show interface for ${entityType}`, async ({
          adminPage,
          rightPanel,
          customProperties,
        }) => {
          rightPanel.setEntityConfig(entityInstance);
          test.skip(
            !rightPanel.isTabAvailable('custom property'),
            `Custom Property tab not available for ${entityType}`
          );

          const fqn = getEntityFqn(entityInstance);
          await navigateToExploreAndSelectEntity(
            adminPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          await rightPanel.waitForPanelVisible();
          await customProperties.navigateToCustomPropertiesTab();
          await customProperties.shouldShowCustomPropertiesContainer();
        });

        test(`Should display custom properties for ${entityType}`, async ({
          adminPage,
          rightPanel,
          customProperties,
        }) => {
          rightPanel.setEntityConfig(entityInstance);
          test.skip(
            !rightPanel.isTabAvailable('custom property'),
            `Custom Property tab not available for ${entityType}`
          );

          const fqn = getEntityFqn(entityInstance);
          await navigateToExploreAndSelectEntity(
            adminPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          await rightPanel.waitForPanelVisible();
          await customProperties.navigateToCustomPropertiesTab();
          await customProperties.shouldShowCustomPropertiesContainer();

          const propertyName = customPropertyData[entityType]?.property?.name;
          if (propertyName) {
            await customProperties.shouldShowCustomProperty(propertyName);
          }
        });

        test(`Should search custom properties for ${entityType}`, async ({
          adminPage,
          rightPanel,
          customProperties,
        }) => {
          rightPanel.setEntityConfig(entityInstance);
          test.skip(
            !rightPanel.isTabAvailable('custom property'),
            `Custom Property tab not available for ${entityType}`
          );

          const fqn = getEntityFqn(entityInstance);
          await navigateToExploreAndSelectEntity(
            adminPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          await rightPanel.waitForPanelVisible();
          await customProperties.navigateToCustomPropertiesTab();
          await customProperties.shouldShowCustomPropertiesContainer();

          const propertyName = customPropertyData[entityType]?.property?.name;
          if (propertyName) {
            await customProperties.searchCustomProperties(propertyName);
            await customProperties.shouldShowCustomProperty(propertyName);
          }
        });

        test(`Should clear search and show all properties for ${entityType}`, async ({
          adminPage,
          rightPanel,
          customProperties,
        }) => {
          rightPanel.setEntityConfig(entityInstance);
          test.skip(
            !rightPanel.isTabAvailable('custom property'),
            `Custom Property tab not available for ${entityType}`
          );

          const fqn = getEntityFqn(entityInstance);
          await navigateToExploreAndSelectEntity(
            adminPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          await rightPanel.waitForPanelVisible();
          await customProperties.navigateToCustomPropertiesTab();
          await customProperties.shouldShowCustomPropertiesContainer();

          const propertyName = customPropertyData[entityType]?.property?.name;
          if (propertyName) {
            await customProperties.searchCustomProperties(propertyName);
            await customProperties.shouldShowCustomProperty(propertyName);

            await customProperties.clearSearch();
            await customProperties.shouldShowCustomPropertiesContainer();
          }
        });
        // TODO: Remove skip once the we have search support for custom properties to avoid flakiness
        test.skip(`Should show no results for invalid search for ${entityType}`, async ({
          adminPage,
          rightPanel,
          customProperties,
        }) => {
          const fqn = getEntityFqn(entityInstance);
          await navigateToExploreAndSelectEntity(
            adminPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          await rightPanel.waitForPanelVisible();
          rightPanel.setEntityConfig(entityInstance);

          if (rightPanel.isTabAvailable('custom property')) {
            await customProperties.navigateToCustomPropertiesTab();
            await customProperties.shouldShowCustomPropertiesContainer();

            await customProperties.searchCustomProperties(
              'nonexistent_property_xyz123'
            );
            await customProperties.shouldShowEmptyCustomPropertiesContainer();
          }
        });

        test(`Should verify property name is visible for ${entityType}`, async ({
          adminPage,
          rightPanel,
          customProperties,
        }) => {
          rightPanel.setEntityConfig(entityInstance);
          test.skip(
            !rightPanel.isTabAvailable('custom property'),
            `Custom Property tab not available for ${entityType}`
          );

          const fqn = getEntityFqn(entityInstance);
          await navigateToExploreAndSelectEntity(
            adminPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          await rightPanel.waitForPanelVisible();
          await customProperties.navigateToCustomPropertiesTab();
          await customProperties.shouldShowCustomPropertiesContainer();

          const propertyName = customPropertyData[entityType]?.property?.name;
          if (propertyName) {
            await customProperties.verifyPropertyType(propertyName);
          }
        });
      });
    });

    test.describe('Overview panel - Removal operations', () => {
      Object.entries(entityMap).forEach(([entityType, entityInstance]) => {
        test(`Should remove tag for ${entityType}`, async ({
          adminPage,
          rightPanel,
          overview,
        }) => {
          const fqn = getEntityFqn(entityInstance);
          await navigateToExploreAndSelectEntity(
            adminPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          await rightPanel.waitForPanelVisible();
          rightPanel.setEntityConfig(entityInstance);

          await overview.editTags(tagToUpdate);
          await overview.shouldShowTagsSection();
          await overview.shouldShowTag(tagToUpdate);

          await overview.removeTag([tagToUpdate]);
          await adminPage.waitForSelector('[data-testid="loader"]', {
            state: 'detached',
          });

          await navigateToExploreAndSelectEntity(
            adminPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          const tagElement = adminPage.getByTestId(
            `tag-${testClassification.data.name}.${testTag.data.name}`
          );
          await expect(tagElement).not.toBeVisible();
        });

        test(`Should remove tier for ${entityType}`, async ({
          adminPage,
          rightPanel,
          overview,
        }) => {
          const fqn = getEntityFqn(entityInstance);
          await navigateToExploreAndSelectEntity(
            adminPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          await rightPanel.waitForPanelVisible();
          rightPanel.setEntityConfig(entityInstance);

          await overview.assignTier(testTier);
          await overview.shouldShowTierSection();
          await overview.shouldShowTier(testTier);

          await overview.removeTier();
          await adminPage.waitForSelector('[data-testid="loader"]', {
            state: 'detached',
          });

          await navigateToExploreAndSelectEntity(
            adminPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          const tierElement = adminPage
            .locator('.tier-section')
            .getByText(testTier);
          await expect(tierElement).not.toBeVisible();
        });

        test(`Should remove glossary term for ${entityType}`, async ({
          adminPage,
          rightPanel,
          overview,
        }) => {
          const fqn = getEntityFqn(entityInstance);
          await navigateToExploreAndSelectEntity(
            adminPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          await rightPanel.waitForPanelVisible();
          rightPanel.setEntityConfig(entityInstance);

          await overview.editGlossaryTerms(glossaryTermToUpdate);
          await overview.shouldShowGlossaryTermsSection();

          await overview.removeGlossaryTerm([glossaryTermToUpdate]);
          await adminPage.waitForSelector('[data-testid="loader"]', {
            state: 'detached',
          });

          await navigateToExploreAndSelectEntity(
            adminPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          const glossarySection = adminPage.locator('.glossary-terms-section');
          await expect(
            glossarySection.getByText(glossaryTermToUpdate)
          ).not.toBeVisible();
        });

        test(`Should remove domain for ${entityType}`, async ({
          adminPage,
          rightPanel,
          overview,
        }) => {
          const fqn = getEntityFqn(entityInstance);
          await navigateToExploreAndSelectEntity(
            adminPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          await rightPanel.waitForPanelVisible();
          rightPanel.setEntityConfig(entityInstance);

          await overview.editDomain(domainToUpdate);
          await overview.shouldShowDomainsSection();
          await overview.shouldShowDomain(domainToUpdate);

          await overview.removeDomain(domainToUpdate);
          await adminPage.waitForSelector('[data-testid="loader"]', {
            state: 'detached',
          });

          await navigateToExploreAndSelectEntity(
            adminPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          const domainsSection = adminPage.locator('.domains-section');
          await expect(
            domainsSection.getByText(domainToUpdate)
          ).not.toBeVisible();
        });

        test(`Should remove user owner for ${entityType}`, async ({
          adminPage,
          rightPanel,
          overview,
        }) => {
          const fqn = getEntityFqn(entityInstance);
          await navigateToExploreAndSelectEntity(
            adminPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          await rightPanel.waitForPanelVisible();
          rightPanel.setEntityConfig(entityInstance);

          await overview.addOwnerWithoutValidation(user1.getUserDisplayName());
          await overview.shouldShowOwner(user1.getUserDisplayName());

          await overview.removeOwner([user1.getUserDisplayName()], 'Users');
          await adminPage.waitForSelector('[data-testid="loader"]', {
            state: 'detached',
          });

          await navigateToExploreAndSelectEntity(
            adminPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          const ownerElement = adminPage
            .locator('.owners-section')
            .getByText(user1.getUserDisplayName());
          await expect(ownerElement).not.toBeVisible();
        });
      });
    });

    test.describe('Overview panel - Deleted entity verification', () => {
      Object.entries(entityMap).forEach(([entityType, entityInstance]) => {
        test(`Should verify deleted user not visible in owner selection for ${entityType}`, async ({
          adminPage,
          rightPanel,
          overview,
          browser,
        }) => {
          const deletedUser = new UserClass();
          const { apiContext, afterAction } = await performAdminLogin(browser);

          try {
            await deletedUser.create(apiContext);

            const fqn = getEntityFqn(entityInstance);
            await navigateToExploreAndSelectEntity(
              adminPage,
              entityInstance.entity.name,
              entityInstance.endpoint,
              fqn
            );
            await rightPanel.waitForPanelVisible();
            rightPanel.setEntityConfig(entityInstance);

            await overview.addOwnerWithoutValidation(
              deletedUser.getUserDisplayName()
            );
            await overview.shouldShowOwner(deletedUser.getUserDisplayName());

            await deletedUser.delete(apiContext);
            await adminPage.reload();
            await rightPanel.waitForPanelVisible();

            const deletedOwnerLocator =
              await overview.verifyDeletedOwnerNotVisible(
                deletedUser.getUserDisplayName(),
                'Users'
              );
            await expect(deletedOwnerLocator).not.toBeVisible();
          } finally {
            await afterAction();
          }
        });

        test(`Should verify deleted tag not visible in tag selection for ${entityType}`, async ({
          adminPage,
          rightPanel,
          overview,
          browser,
        }) => {
          const deletedClassification = new ClassificationClass();
          const deletedTag = new TagClass({
            classification: deletedClassification.data.name,
          });
          const { apiContext, afterAction } = await performAdminLogin(browser);

          try {
            await deletedClassification.create(apiContext);
            await deletedTag.create(apiContext);

            const deletedTagDisplayName =
              deletedTag.responseData?.displayName ??
              deletedTag.data.displayName;

            const fqn = getEntityFqn(entityInstance);
            await navigateToExploreAndSelectEntity(
              adminPage,
              entityInstance.entity.name,
              entityInstance.endpoint,
              fqn
            );
            await rightPanel.waitForPanelVisible();
            rightPanel.setEntityConfig(entityInstance);

            await overview.editTags(deletedTagDisplayName);
            await overview.shouldShowTag(deletedTagDisplayName);

            await deletedTag.delete(apiContext);
            await deletedClassification.delete(apiContext);
            await adminPage.reload();
            await rightPanel.waitForPanelVisible();

            const deletedTagLocator = await overview.verifyDeletedTagNotVisible(
              deletedTagDisplayName
            );
            await expect(deletedTagLocator).not.toBeVisible();
          } finally {
            await afterAction();
          }
        });

        test(`Should verify deleted glossary term not visible in selection for ${entityType}`, async ({
          adminPage,
          rightPanel,
          overview,
          browser,
        }) => {
          const deletedGlossary = new Glossary();
          const deletedGlossaryTerm = new GlossaryTerm(deletedGlossary);
          const { apiContext, afterAction } = await performAdminLogin(browser);

          try {
            await deletedGlossary.create(apiContext);
            await deletedGlossaryTerm.create(apiContext);

            const deletedTermDisplayName =
              deletedGlossaryTerm.responseData?.displayName ??
              deletedGlossaryTerm.data.displayName;

            const fqn = getEntityFqn(entityInstance);
            await navigateToExploreAndSelectEntity(
              adminPage,
              entityInstance.entity.name,
              entityInstance.endpoint,
              fqn
            );
            await rightPanel.waitForPanelVisible();
            rightPanel.setEntityConfig(entityInstance);

            await overview.editGlossaryTerms(deletedTermDisplayName);
            await overview.shouldShowGlossaryTermsSection();

            await deletedGlossaryTerm.delete(apiContext);
            await deletedGlossary.delete(apiContext);
            await adminPage.reload();
            await rightPanel.waitForPanelVisible();

            const deletedTermLocator =
              await overview.verifyDeletedGlossaryTermNotVisible(
                deletedTermDisplayName
              );
            await expect(deletedTermLocator).not.toBeVisible();
          } finally {
            await afterAction();
          }
        });
      });
    });

    test.describe('Data Steward User - Permission Verification', () => {
      Object.entries(entityMap).forEach(([entityType, entityInstance]) => {
        test(`Should allow Data Steward to edit description for ${entityType}`, async ({
          dataStewardPage,
        }) => {
          const fqn = getEntityFqn(entityInstance);
          await navigateToExploreAndSelectEntity(
            dataStewardPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          await dataStewardPage.waitForSelector(
            '[data-testid="entity-summary-panel-container"]',
            {
              state: 'visible',
            }
          );

          const rightPanelDS = new RightPanelPageObject(dataStewardPage);
          rightPanelDS.setEntityConfig(entityInstance);
          rightPanelDS.setRolePermissions('DataSteward');

          const overviewDS = new OverviewPageObject(rightPanelDS);
          await overviewDS.navigateToOverviewTab();

          const descriptionToUpdate = `DataSteward description - ${uuid()}`;
          await overviewDS.editDescription(descriptionToUpdate);
          await overviewDS.shouldShowDescriptionWithText(descriptionToUpdate);
        });

        test(`Should allow Data Steward to edit owners for ${entityType}`, async ({
          dataStewardPage,
        }) => {
          const fqn = getEntityFqn(entityInstance);
          await navigateToExploreAndSelectEntity(
            dataStewardPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          await dataStewardPage.waitForSelector(
            '[data-testid="entity-summary-panel-container"]',
            {
              state: 'visible',
            }
          );

          const rightPanelDS = new RightPanelPageObject(dataStewardPage);
          rightPanelDS.setEntityConfig(entityInstance);
          rightPanelDS.setRolePermissions('DataSteward');

          const overviewDS = new OverviewPageObject(rightPanelDS);
          await overviewDS.addOwnerWithoutValidation(
            user1.getUserDisplayName()
          );
          await overviewDS.shouldShowOwner(user1.getUserDisplayName());
        });

        test(`Should allow Data Steward to edit tags for ${entityType}`, async ({
          dataStewardPage,
        }) => {
          const fqn = getEntityFqn(entityInstance);
          await navigateToExploreAndSelectEntity(
            dataStewardPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          await dataStewardPage.waitForSelector(
            '[data-testid="entity-summary-panel-container"]',
            {
              state: 'visible',
            }
          );

          const rightPanelDS = new RightPanelPageObject(dataStewardPage);
          rightPanelDS.setEntityConfig(entityInstance);
          rightPanelDS.setRolePermissions('DataSteward');

          const overviewDS = new OverviewPageObject(rightPanelDS);
          await overviewDS.editTags(tagToUpdate);
          await overviewDS.shouldShowTag(tagToUpdate);
        });

        test(`Should allow Data Steward to edit glossary terms for ${entityType}`, async ({
          dataStewardPage,
        }) => {
          const fqn = getEntityFqn(entityInstance);
          await navigateToExploreAndSelectEntity(
            dataStewardPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          await dataStewardPage.waitForSelector(
            '[data-testid="entity-summary-panel-container"]',
            {
              state: 'visible',
            }
          );

          const rightPanelDS = new RightPanelPageObject(dataStewardPage);
          rightPanelDS.setEntityConfig(entityInstance);
          rightPanelDS.setRolePermissions('DataSteward');

          const overviewDS = new OverviewPageObject(rightPanelDS);
          await overviewDS.editGlossaryTerms(glossaryTermToUpdate);
          await overviewDS.shouldShowGlossaryTermsSection();
        });

        test(`Should allow Data Steward to edit tier for ${entityType}`, async ({
          dataStewardPage,
        }) => {
          const fqn = getEntityFqn(entityInstance);
          await navigateToExploreAndSelectEntity(
            dataStewardPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          await dataStewardPage.waitForSelector(
            '[data-testid="entity-summary-panel-container"]',
            {
              state: 'visible',
            }
          );

          const rightPanelDS = new RightPanelPageObject(dataStewardPage);
          rightPanelDS.setEntityConfig(entityInstance);
          rightPanelDS.setRolePermissions('DataSteward');

          const overviewDS = new OverviewPageObject(rightPanelDS);
          await overviewDS.assignTier(testTier);
          await overviewDS.shouldShowTier(testTier);
        });

        test(`Should allow Data Steward to view all tabs for ${entityType}`, async ({
          dataStewardPage,
        }) => {
          const fqn = getEntityFqn(entityInstance);
          await navigateToExploreAndSelectEntity(
            dataStewardPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          await dataStewardPage.waitForSelector(
            '[data-testid="entity-summary-panel-container"]',
            {
              state: 'visible',
            }
          );

          const rightPanelDS = new RightPanelPageObject(dataStewardPage);
          rightPanelDS.setEntityConfig(entityInstance);
          rightPanelDS.setRolePermissions('DataSteward');

          if (rightPanelDS.isTabAvailable('schema')) {
            const schemaDS = new SchemaPageObject(rightPanelDS);
            await schemaDS.navigateToSchemaTab();
            await schemaDS.shouldBeVisible();
          }

          if (rightPanelDS.isTabAvailable('lineage')) {
            const lineageDS = new LineagePageObject(rightPanelDS);
            await lineageDS.navigateToLineageTab();
            await lineageDS.shouldBeVisible();
          }

          if (rightPanelDS.isTabAvailable('data quality')) {
            const dataQualityDS = new DataQualityPageObject(rightPanelDS);
            await dataQualityDS.navigateToDataQualityTab();
            await dataQualityDS.shouldBeVisible();
          }

          if (rightPanelDS.isTabAvailable('custom property')) {
            const customPropertiesDS = new CustomPropertiesPageObject(
              rightPanelDS
            );
            await customPropertiesDS.navigateToCustomPropertiesTab();
            await customPropertiesDS.shouldShowCustomPropertiesContainer();
          }
        });

        test(`Should NOT show restricted edit buttons for Data Steward for ${entityType}`, async ({
          dataStewardPage,
        }) => {
          const fqn = getEntityFqn(entityInstance);
          await navigateToExploreAndSelectEntity(
            dataStewardPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          await dataStewardPage.waitForSelector(
            '[data-testid="entity-summary-panel-container"]',
            { state: 'visible' }
          );

          const rightPanelDS = new RightPanelPageObject(dataStewardPage);
          rightPanelDS.setEntityConfig(entityInstance);
          rightPanelDS.setRolePermissions('DataSteward');

          const overviewDS = new OverviewPageObject(rightPanelDS);
          await overviewDS.navigateToOverviewTab();

          // DataSteward: canEditDomains=false, canEditDataProducts=false
          await rightPanelDS.verifyPermissions();
        });
      });
    });

    test.describe('Data Consumer User - Permission Verification', () => {
      Object.entries(entityMap).forEach(([entityType, entityInstance]) => {
        test(`Should allow Data Consumer to edit description for ${entityType}`, async ({
          dataConsumerPage,
        }) => {
          const fqn = getEntityFqn(entityInstance);
          await navigateToExploreAndSelectEntity(
            dataConsumerPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          await dataConsumerPage.waitForSelector(
            '[data-testid="entity-summary-panel-container"]',
            {
              state: 'visible',
            }
          );

          const rightPanelDC = new RightPanelPageObject(dataConsumerPage);
          rightPanelDC.setEntityConfig(entityInstance);
          rightPanelDC.setRolePermissions('DataConsumer');

          const overviewDC = new OverviewPageObject(rightPanelDC);
          await overviewDC.navigateToOverviewTab();

          const descriptionToUpdate = `DataConsumer description - ${uuid()}`;
          await overviewDC.editDescription(descriptionToUpdate);
          await overviewDC.shouldShowDescriptionWithText(descriptionToUpdate);
        });

        test(`Should allow Data Consumer to edit tags for ${entityType}`, async ({
          dataConsumerPage,
        }) => {
          const fqn = getEntityFqn(entityInstance);
          await navigateToExploreAndSelectEntity(
            dataConsumerPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          await dataConsumerPage.waitForSelector(
            '[data-testid="entity-summary-panel-container"]',
            {
              state: 'visible',
            }
          );

          const rightPanelDC = new RightPanelPageObject(dataConsumerPage);
          rightPanelDC.setEntityConfig(entityInstance);
          rightPanelDC.setRolePermissions('DataConsumer');

          const overviewDC = new OverviewPageObject(rightPanelDC);
          await overviewDC.editTags(tagToUpdate);
          await overviewDC.shouldShowTag(tagToUpdate);
        });

        test(`Should allow Data Consumer to edit glossary terms for ${entityType}`, async ({
          dataConsumerPage,
        }) => {
          const fqn = getEntityFqn(entityInstance);
          await navigateToExploreAndSelectEntity(
            dataConsumerPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          await dataConsumerPage.waitForSelector(
            '[data-testid="entity-summary-panel-container"]',
            {
              state: 'visible',
            }
          );

          const rightPanelDC = new RightPanelPageObject(dataConsumerPage);
          rightPanelDC.setEntityConfig(entityInstance);
          rightPanelDC.setRolePermissions('DataConsumer');

          const overviewDC = new OverviewPageObject(rightPanelDC);
          await overviewDC.editGlossaryTerms(glossaryTermToUpdate);
          await overviewDC.shouldShowGlossaryTermsSection();
        });

        test(`Should allow Data Consumer to edit tier for ${entityType}`, async ({
          dataConsumerPage,
        }) => {
          const fqn = getEntityFqn(entityInstance);
          await navigateToExploreAndSelectEntity(
            dataConsumerPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          await dataConsumerPage.waitForSelector(
            '[data-testid="entity-summary-panel-container"]',
            {
              state: 'visible',
            }
          );

          const rightPanelDC = new RightPanelPageObject(dataConsumerPage);
          rightPanelDC.setEntityConfig(entityInstance);
          rightPanelDC.setRolePermissions('DataConsumer');

          const overviewDC = new OverviewPageObject(rightPanelDC);
          await overviewDC.assignTier(testTier);
          await overviewDC.shouldShowTier(testTier);
        });

        test(`Should allow Data Consumer to view all tabs for ${entityType}`, async ({
          dataConsumerPage,
        }) => {
          const fqn = getEntityFqn(entityInstance);
          await navigateToExploreAndSelectEntity(
            dataConsumerPage,
            entityInstance.entity.name,
            entityInstance.endpoint,
            fqn
          );
          await dataConsumerPage.waitForSelector(
            '[data-testid="entity-summary-panel-container"]',
            {
              state: 'visible',
            }
          );

          const rightPanelDC = new RightPanelPageObject(dataConsumerPage);
          rightPanelDC.setEntityConfig(entityInstance);
          rightPanelDC.setRolePermissions('DataConsumer');

          if (rightPanelDC.isTabAvailable('schema')) {
            const schemaDC = new SchemaPageObject(rightPanelDC);
            await schemaDC.navigateToSchemaTab();
            await schemaDC.shouldBeVisible();
          }

          if (rightPanelDC.isTabAvailable('lineage')) {
            const lineageDC = new LineagePageObject(rightPanelDC);
            await lineageDC.navigateToLineageTab();
            await lineageDC.shouldBeVisible();
          }

          if (rightPanelDC.isTabAvailable('data quality')) {
            const dataQualityDC = new DataQualityPageObject(rightPanelDC);
            await dataQualityDC.navigateToDataQualityTab();
            await dataQualityDC.shouldBeVisible();
          }

          if (rightPanelDC.isTabAvailable('custom property')) {
            const customPropertiesDC = new CustomPropertiesPageObject(
              rightPanelDC
            );
            await customPropertiesDC.navigateToCustomPropertiesTab();
            await customPropertiesDC.shouldShowCustomPropertiesContainer();
          }
        });

        test(`Should follow Data Consumer role policies for ownerless ${entityType}`, async ({
          browser,
        }) => {
          const { page: dataConsumerPage, afterAction } = await performUserLogin(
            browser,
            user1
          );

          try {
            const fqn = getEntityFqn(entityInstance);
            await navigateToExploreAndSelectEntity(
              dataConsumerPage,
              entityInstance.entity.name,
              entityInstance.endpoint,
              fqn
            );
            await dataConsumerPage.waitForSelector(
              '[data-testid="entity-summary-panel-container"]',
              { state: 'visible' }
            );

            const rightPanelDC = new RightPanelPageObject(dataConsumerPage);
            rightPanelDC.setEntityConfig(entityInstance);
            rightPanelDC.setRolePermissions('DataConsumer');

            const overviewDC = new OverviewPageObject(rightPanelDC);
            await overviewDC.navigateToOverviewTab();

            // DataConsumer: canEditDomains=false, canEditDataProducts=false
            await rightPanelDC.verifyPermissions();
          } finally {
            await afterAction();
          }
        });
      });
    });

    // Standalone test using a dedicated entity (dcOwnerTestTable) that no other
    // parallel test touches. This prevents the race condition where a parallel
    // "remove owner" test strips the owner between admin assignment and the
    // DataConsumer navigation, making the entity ownerless and granting
    // EditOwners to all users again.
    test.describe('Data Consumer User - Owner Restriction', () => {
      test('Should NOT allow Data Consumer to edit owners when entity has owner', async ({
        adminPage,
        browser,
      }) => {
        const { page: dataConsumerPage, afterAction } = await performUserLogin(
          browser,
          user1
        );

        try {
          const fqn = getEntityFqn(dcOwnerTestTable);

        // Admin assigns user1 as owner so the entity is no longer ownerless.
        // When an entity has an owner, EditOwners is no longer granted to all
        // users — DataConsumer (which lacks EditOwners / EditAll) cannot see
        // the edit-owners button.
        await navigateToExploreAndSelectEntity(
          adminPage,
          dcOwnerTestTable.entity.name,
          dcOwnerTestTable.endpoint,
          fqn
        );
        await adminPage.waitForSelector(
          '[data-testid="entity-summary-panel-container"]',
          { state: 'visible' }
        );
        const adminRightPanel = new RightPanelPageObject(adminPage);
        adminRightPanel.setEntityConfig(dcOwnerTestTable);
        const adminOverview = new OverviewPageObject(adminRightPanel);
        await adminOverview.addOwnerWithoutValidation(
          user1.getUserDisplayName()
        );
        await adminOverview.shouldShowOwner(user1.getUserDisplayName());

        // DataConsumer navigates to the same entity and verifies that the
        // edit-owners button is NOT visible (restricted by role).
        await navigateToExploreAndSelectEntity(
          dataConsumerPage,
          dcOwnerTestTable.entity.name,
          dcOwnerTestTable.endpoint,
          fqn
        );
        await dataConsumerPage.waitForSelector(
          '[data-testid="entity-summary-panel-container"]',
          { state: 'visible' }
        );
          const dcSummaryPanel = dataConsumerPage.locator(
            '.entity-summary-panel-container'
          );
          await expect(
            dcSummaryPanel.getByTestId('edit-owners')
          ).not.toBeVisible();
        } finally {
          await afterAction();
        }
      });
    });

    test.describe('Empty State Scenarios - Comprehensive Coverage', () => {
      test('Should show appropriate message when no owners assigned', async ({
        adminPage,
        rightPanel,
        overview,
      }) => {
        const testEntity = new TableClass();
        const { apiContext, afterAction } = await performAdminLogin(
          adminPage.context().browser()!
        );

        try {
          await testEntity.create(apiContext);

          const fqn = getEntityFqn(testEntity);
          await navigateToExploreAndSelectEntity(
            adminPage,
            testEntity.entity.name,
            testEntity.endpoint,
            fqn
          );
          await rightPanel.waitForPanelVisible();
          rightPanel.setEntityConfig(testEntity);

          await overview.navigateToOverviewTab();
          const ownersSection = adminPage.locator('.owners-section');
          await expect(ownersSection).toBeVisible();
          // No owner chips should be present for a freshly-created entity
          await expect(adminPage.getByTestId('user-tag')).not.toBeVisible();
        } finally {
          await testEntity.delete(apiContext);
          await afterAction();
        }
      });

      test('Should show appropriate message when no tags assigned', async ({
        adminPage,
        rightPanel,
        overview,
      }) => {
        const testEntity = new TableClass();
        const { apiContext, afterAction } = await performAdminLogin(
          adminPage.context().browser()!
        );

        try {
          await testEntity.create(apiContext);

          const fqn = getEntityFqn(testEntity);
          await navigateToExploreAndSelectEntity(
            adminPage,
            testEntity.entity.name,
            testEntity.endpoint,
            fqn
          );
          await rightPanel.waitForPanelVisible();
          rightPanel.setEntityConfig(testEntity);

          await overview.navigateToOverviewTab();
          const tagsSection = adminPage.locator('.tags-section');
          await expect(tagsSection).toBeVisible();
          // Verified from test output: empty tags section shows this placeholder text
          await expect(tagsSection).toContainText('No Tags assigned');
        } finally {
          await testEntity.delete(apiContext);
          await afterAction();
        }
      });

      test('Should show appropriate message when no tier assigned', async ({
        adminPage,
        rightPanel,
        overview,
      }) => {
        const testEntity = new TableClass();
        const { apiContext, afterAction } = await performAdminLogin(
          adminPage.context().browser()!
        );

        try {
          await testEntity.create(apiContext);

          const fqn = getEntityFqn(testEntity);
          await navigateToExploreAndSelectEntity(
            adminPage,
            testEntity.entity.name,
            testEntity.endpoint,
            fqn
          );
          await rightPanel.waitForPanelVisible();
          rightPanel.setEntityConfig(testEntity);

          await overview.navigateToOverviewTab();
          const tierSection = adminPage.locator('.tier-section');
          await expect(tierSection).toBeVisible();
          // The tier chip only renders when a tier is assigned — verify it is absent
          await expect(
            adminPage
              .locator('[data-testid="entity-summary-panel-container"]')
              .getByTestId('Tier')
              .locator('.ant-tag')
          ).not.toBeVisible();
        } finally {
          await testEntity.delete(apiContext);
          await afterAction();
        }
      });

      test('Should show appropriate message when no domain assigned', async ({
        adminPage,
        rightPanel,
        overview,
      }) => {
        const testEntity = new TableClass();
        const { apiContext, afterAction } = await performAdminLogin(
          adminPage.context().browser()!
        );

        try {
          await testEntity.create(apiContext);

          const fqn = getEntityFqn(testEntity);
          await navigateToExploreAndSelectEntity(
            adminPage,
            testEntity.entity.name,
            testEntity.endpoint,
            fqn
          );
          await rightPanel.waitForPanelVisible();
          rightPanel.setEntityConfig(testEntity);

          await overview.navigateToOverviewTab();
          const domainSection = adminPage.locator('.domains-section');
          await expect(domainSection).toBeVisible();
          // Verified from test output: empty domains section shows this placeholder text
          await expect(adminPage.locator('.domains-content')).toContainText(
            'No Domains assigned'
          );
        } finally {
          await testEntity.delete(apiContext);
          await afterAction();
        }
      });

      test('Should show appropriate message when no glossary terms assigned', async ({
        adminPage,
        rightPanel,
        overview,
      }) => {
        const testEntity = new TableClass();
        const { apiContext, afterAction } = await performAdminLogin(
          adminPage.context().browser()!
        );

        try {
          await testEntity.create(apiContext);

          const fqn = getEntityFqn(testEntity);
          await navigateToExploreAndSelectEntity(
            adminPage,
            testEntity.entity.name,
            testEntity.endpoint,
            fqn
          );
          await rightPanel.waitForPanelVisible();
          rightPanel.setEntityConfig(testEntity);

          await overview.navigateToOverviewTab();
          const glossarySection = adminPage.locator('.glossary-terms-section');
          await expect(glossarySection).toBeVisible();
          // No glossary term chips should be present; the container holds only the empty state
          await expect(
            adminPage
              .getByTestId('glossary-container')
              .locator('.no-data-placeholder')
          ).toBeVisible();
        } finally {
          await testEntity.delete(apiContext);
          await afterAction();
        }
      });

      test('Should show lineage not found when no lineage exists', async ({
        adminPage,
        rightPanel,
        lineage,
      }) => {
        const testEntity = new TableClass();
        const { apiContext, afterAction } = await performAdminLogin(
          adminPage.context().browser()!
        );

        try {
          await testEntity.create(apiContext);

          const fqn = getEntityFqn(testEntity);
          await navigateToExploreAndSelectEntity(
            adminPage,
            testEntity.entity.name,
            testEntity.endpoint,
            fqn
          );
          await rightPanel.waitForPanelVisible();
          rightPanel.setEntityConfig(testEntity);

          await lineage.navigateToLineageTab();
          await lineage.shouldBeVisible();
        } finally {
          await testEntity.delete(apiContext);
          await afterAction();
        }
      });

      test('Should show no test cases message when data quality tab is empty', async ({
        adminPage,
        rightPanel,
        dataQuality,
      }) => {
        const testEntity = new TableClass();
        const { apiContext, afterAction } = await performAdminLogin(
          adminPage.context().browser()!
        );

        try {
          await testEntity.create(apiContext);

          const fqn = getEntityFqn(testEntity);
          await navigateToExploreAndSelectEntity(
            adminPage,
            testEntity.entity.name,
            testEntity.endpoint,
            fqn
          );
          await rightPanel.waitForPanelVisible();
          rightPanel.setEntityConfig(testEntity);

          await dataQuality.navigateToDataQualityTab();
          await dataQuality.shouldBeVisible();
          await dataQuality.shouldShowTestCaseCardsCount(0);
        } finally {
          await testEntity.delete(apiContext);
          await afterAction();
        }
      });
    });

    test.describe('Overview panel - Description removal', () => {
      Object.entries(entityMap).forEach(([entityType, entityInstance]) => {
        test(`Should clear description for ${entityType}`, async ({
          adminPage,
        }) => {
          const {
            page: authenticatedPage,
            afterAction,
          } = await performAdminLogin(adminPage.context().browser()!);
          const rightPanel = new RightPanelPageObject(authenticatedPage);
          const localOverview = new OverviewPageObject(rightPanel);

          // Use the shared entity instance from entityMap which is already created in beforeAll
          try {
            const fqn = getEntityFqn(entityInstance);
            await navigateToExploreAndSelectEntity(
              authenticatedPage,
              entityInstance.entity.name,
              entityInstance.endpoint,
              fqn
            );
            await rightPanel.waitForPanelVisible();
            rightPanel.setEntityConfig(entityInstance);

            // First, ensure there is a description
            const descriptionText = `Description to remove - ${uuid()}`;
            await localOverview.editDescription(descriptionText);
            await localOverview.shouldShowDescriptionWithText(descriptionText);

            // Clear the description
            await localOverview.editDescription('');

            // Reload the entity panel and verify description is gone
            await navigateToExploreAndSelectEntity(
              authenticatedPage,
              entityInstance.entity.name,
              entityInstance.endpoint,
              fqn
            );
            await rightPanel.waitForPanelVisible();

            // The description text should no longer be present
            const descElement = authenticatedPage
              .locator('.description-section')
              .getByText(descriptionText);
            await expect(descElement).not.toBeVisible();
          } finally {
            await afterAction();
          }
        });
      });
    });

    test.describe('Entity switch - Panel content reload', () => {
      test('Should update panel content when switching between entities', async ({
        adminPage,
      }) => {
        const {
          page: authenticatedPage,
          afterAction,
        } = await performAdminLogin(adminPage.context().browser()!);
        const rightPanel = new RightPanelPageObject(authenticatedPage);
        const localOverview = new OverviewPageObject(rightPanel);

        try {
          // Navigate to the first entity (table)
          const tableFqn = getEntityFqn(tableEntity);
          await navigateToExploreAndSelectEntity(
            authenticatedPage,
            tableEntity.entity.name,
            tableEntity.endpoint,
            tableFqn
          );
          await rightPanel.waitForPanelVisible();
          rightPanel.setEntityConfig(tableEntity);
          await localOverview.navigateToOverviewTab();
          await localOverview.shouldBeVisible();

          // Verify table-specific content is visible
          const panelContainer = authenticatedPage.locator(
            '[data-testid="entity-summary-panel-container"]'
          );
          await expect(panelContainer).toBeVisible();
          const tableNameInPanel = panelContainer.getByText(
            tableEntity.entity.name
          );
          await expect(tableNameInPanel).toBeVisible();

          // Switch to a different entity (dashboard)
          const dashboardFqn = getEntityFqn(dashboardEntity);
          await navigateToExploreAndSelectEntity(
            authenticatedPage,
            dashboardEntity.entity.name,
            dashboardEntity.endpoint,
            dashboardFqn
          );
          await rightPanel.waitForPanelVisible();
          rightPanel.setEntityConfig(dashboardEntity);

          // Verify dashboard-specific content is now visible (not stale table data)
          const updatedPanel = authenticatedPage.locator(
            '[data-testid="entity-summary-panel-container"]'
          );
          await expect(updatedPanel).toBeVisible();
          const dashboardNameInPanel = updatedPanel.getByText(
            dashboardEntity.entity.name
          );
          await expect(dashboardNameInPanel).toBeVisible();

          // Verify the old entity name is no longer visible in the panel
          const staleTableName = updatedPanel.getByText(
            tableEntity.entity.name,
            { exact: true }
          );
          await expect(staleTableName).not.toBeVisible();
        } finally {
          await afterAction();
        }
      });
    });

    test.describe('Overview panel - Multi-tag operations', () => {
      test('Should add multiple tags simultaneously', async ({
        adminPage,
      }) => {
        const testEntity = new TableClass();
        const {
          page: authenticatedPage,
          apiContext,
          afterAction,
        } = await performAdminLogin(adminPage.context().browser()!);
        const rightPanel = new RightPanelPageObject(authenticatedPage);
        const localOverview = new OverviewPageObject(rightPanel);

        try {
          await testEntity.create(apiContext);

          const fqn = getEntityFqn(testEntity);
          await navigateToExploreAndSelectEntity(
            authenticatedPage,
            testEntity.entity.name,
            testEntity.endpoint,
            fqn
          );
          await rightPanel.waitForPanelVisible();
          rightPanel.setEntityConfig(testEntity);

          // Add first tag
          await localOverview.editTags(tagToUpdate);
          await localOverview.shouldShowTag(tagToUpdate);

          // Add second tag (via edit)
          const secondTag = 'PII.Sensitive';
          await localOverview.editTags(secondTag);
          await localOverview.shouldShowTag(secondTag);

          // Both tags should be visible
          await localOverview.shouldShowTag(tagToUpdate);
          await localOverview.shouldShowTag(secondTag);

          // Cleanup: remove both tags
          await localOverview.removeTag([secondTag]);
          await localOverview.removeTag([tagToUpdate]);
        } finally {
          await testEntity.delete(apiContext);
          await afterAction();
        }
      });
    });
  });
});
