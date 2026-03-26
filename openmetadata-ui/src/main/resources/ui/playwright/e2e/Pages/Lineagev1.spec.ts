import { expect } from '@playwright/test';
import { get, startCase } from 'lodash';
import { ApiEndpointClass } from '../../support/entity/ApiEndpointClass';
import { ContainerClass } from '../../support/entity/ContainerClass';
import { DashboardClass } from '../../support/entity/DashboardClass';
import { DashboardDataModelClass } from '../../support/entity/DashboardDataModelClass';
import { DirectoryClass } from '../../support/entity/DirectoryClass';
import { EntityDataClass } from '../../support/entity/EntityDataClass';
import { FileClass } from '../../support/entity/FileClass';
import { MetricClass } from '../../support/entity/MetricClass';
import { MlModelClass } from '../../support/entity/MlModelClass';
import { PipelineClass } from '../../support/entity/PipelineClass';
import { SearchIndexClass } from '../../support/entity/SearchIndexClass';
import { SpreadsheetClass } from '../../support/entity/SpreadsheetClass';
import { StoredProcedureClass } from '../../support/entity/StoredProcedureClass';
import { TableClass } from '../../support/entity/TableClass';
import { TopicClass } from '../../support/entity/TopicClass';
import { WorksheetClass } from '../../support/entity/WorksheetClass';
import {
  getApiContext,
  getDefaultAdminAPIContext,
  redirectToHomePage,
} from '../../utils/common';
import { waitForAllLoadersToDisappear } from '../../utils/entity';
import {
  applyPipelineFromModal,
  clickLineageNode,
  connectEdgeBetweenNodes,
  connectEdgeBetweenNodesViaAPI,
  deleteEdge,
  editLineage,
  editLineageClick,
  performZoomOut,
  rearrangeNodes,
  verifyExportLineageCSV,
  verifyExportLineagePNG,
  verifyNodePresent,
  visitLineageTab,
} from '../../utils/lineage';
import { test } from '../fixtures/pages';

test.describe('Lineage Creation', () => {
  const allEntities = {
    table: TableClass,
    container: ContainerClass,
    topic: TopicClass,
    dashboard: DashboardClass,
    mlmodel: MlModelClass,
    pipeline: PipelineClass,
    storedProcedure: StoredProcedureClass,
    searchIndex: SearchIndexClass,
    dataModel: DashboardDataModelClass,
    apiEndpoint: ApiEndpointClass,
    metric: MetricClass,
    directory: DirectoryClass,
    file: FileClass,
    spreadsheet: SpreadsheetClass,
    worksheet: WorksheetClass,
  };

  Object.entries(allEntities).forEach(([key, EntityClass]) => {
    const lineageEntity = new EntityClass();

    test(`verify create lineage for entity - ${startCase(key)}`, async ({
      page,
    }) => {
      // 7 minute timeout
      test.setTimeout(7 * 60 * 1000);
      await redirectToHomePage(page);

      const pipeline = new PipelineClass();
      const { apiContext } = await getApiContext(page);
      const entities = Object.entries(allEntities).map(
        ([_key, EntityClass]) => {
          const lineageEntity = new EntityClass();

          return lineageEntity;
        }
      );

      try {
        await lineageEntity.create(apiContext);
        await pipeline.create(apiContext);
        await Promise.all(entities.map((entity) => entity.create(apiContext)));
      } catch (error) {
        console.error('Error creating entities:', error);
      }

      await lineageEntity.visitEntityPage(page);
      await visitLineageTab(page);
      await editLineageClick(page);
      await performZoomOut(page);

      await test.step('should create lineage with normal edge', async () => {
        for (const entity of entities) {
          await connectEdgeBetweenNodes(page, lineageEntity, entity);
          await rearrangeNodes(page);
          await performZoomOut(page);
        }

        const lineageRes = page.waitForResponse('/api/v1/lineage/getLineage?*');
        await page.reload();
        await lineageRes;
        await page.getByTestId('edit-lineage').waitFor({
          state: 'visible',
        });

        await waitForAllLoadersToDisappear(page);
        await performZoomOut(page);

        for (const entity of entities) {
          await verifyNodePresent(page, entity);
        }

        // Check the Entity Drawer
        await performZoomOut(page);

        for (const entity of entities) {
          const toNodeFqn = get(
            entity,
            'entityResponseData.fullyQualifiedName',
            ''
          );

          await clickLineageNode(page, toNodeFqn);

          await expect(
            page
              .locator('.lineage-entity-panel')
              .getByTestId('entity-header-title')
          ).toHaveText(get(entity, 'entityResponseData.displayName', ''));

          await page.getByTestId('drawer-close-icon').click();

          // Panel should not be visible after closing it
          await expect(page.locator('.lineage-entity-panel')).not.toBeVisible();
        }
      });

      await test.step('should create lineage with edge having pipeline', async () => {
        await editLineage(page);

        await page.getByTestId('fit-screen').click();
        await page.getByRole('menuitem', { name: 'Fit to screen' }).click();
        await performZoomOut(page, 8);
        await waitForAllLoadersToDisappear(page);

        const fromNodeFqn = get(
          lineageEntity,
          'entityResponseData.fullyQualifiedName',
          ''
        );

        await clickLineageNode(page, fromNodeFqn);

        for (const entity of entities) {
          await applyPipelineFromModal(page, lineageEntity, entity, pipeline);
        }
      });

      await test.step('Verify Lineage Export CSV', async () => {
        await editLineageClick(page);
        await waitForAllLoadersToDisappear(page);
        await performZoomOut(page);
        await verifyExportLineageCSV(page, lineageEntity, entities, pipeline);
      });

      await test.step('Verify Lineage Export PNG', async () => {
        await verifyExportLineagePNG(page);
      });

      await test.step('Remove lineage between nodes for the entity', async () => {
        await editLineage(page);
        await page.getByTestId('fit-screen').click();
        await page.getByRole('menuitem', { name: 'Fit to screen' }).click();
        await waitForAllLoadersToDisappear(page);

        await performZoomOut(page);

        for (const entity of entities) {
          await deleteEdge(page, lineageEntity, entity);
        }
      });
    });
  });
});

test.describe('Lineage Edit mode', () => {});

test.describe('Lineage Filters', () => {
  const table = new TableClass();
  const topic = new TopicClass();

  test.beforeEach(async ({ page }) => {
    await table.visitEntityPage(page);
    await visitLineageTab(page);
  });

  test('Verify filter panel toggle', async ({ page }) => {
    const filterBtn = page.locator('[aria-label="Filters"]');

    await filterBtn.click();
    await expect(page.locator('.m-t-sm')).toBeVisible();
    await expect(page.getByTestId('search-dropdown-Owners')).toBeVisible();
    await expect(page.getByTestId('search-dropdown-Tier')).toBeVisible();

    await filterBtn.click();
    await expect(page.locator('.m-t-sm')).not.toBeVisible();
  });

  test('Verify owner filter selection', async ({ page }) => {
    await page.locator('[aria-label="Filters"]').click();

    await page.getByTestId('search-dropdown-Owners').click();

    await expect(
      page.getByTitle(EntityDataClass.user1.responseData.name)
    ).toBeVisible();

    await page.getByTitle(EntityDataClass.user1.responseData.name).click();

    const lineageRes = page.waitForResponse('/api/v1/lineage/getLineage?*');
    await page.getByRole('button', { name: 'Update' }).click();
    await lineageRes;

    const topicFqn = get(topic, 'entityResponseData.fullyQualifiedName');
    await expect(page.getByTestId(`lineage-node-${topicFqn}`)).toBeVisible();
  });

  test('Verify service filter selection', async ({ page }) => {
    await page.locator('[aria-label="Filters"]').click();
    await page.getByTestId('search-dropdown-Service').click();

    const serviceName = get(table, 'entityResponseData.service.name', '');
    await page.getByTitle(serviceName).click();

    const lineageRes = page.waitForResponse('/api/v1/lineage/getLineage?*');
    await page.getByRole('button', { name: 'Update' }).click();
    await lineageRes;

    await waitForAllLoadersToDisappear(page);
  });

  test('Verify clear all filters', async ({ page }) => {
    await page.locator('[aria-label="Filters"]').click();

    await page.getByTestId('search-dropdown-Owners').click();
    await page.getByTitle(EntityDataClass.user1.responseData.name).click();

    const clearAllBtn = page.getByRole('button', { name: /clear/i });
    await expect(clearAllBtn).toBeEnabled();

    await clearAllBtn.click();

    await page.getByTestId('search-dropdown-Owners').click();
    await page.waitForTimeout(300);
  });

  test('Verify LineageSearchSelect in lineage mode', async ({ page }) => {
    const searchSelect = page.getByTestId('search-entity-select');
    await expect(searchSelect).toBeVisible();

    await searchSelect.click();
    await page.fill(
      '[data-testid="search-entity-select"] .ant-select-selection-search-input',
      topic.entity.name
    );

    await page.waitForRequest('/api/v1/search/query?*');

    const topicFqn = get(topic, 'entityResponseData.fullyQualifiedName');
    await page.getByTestId(`node-suggestion-${topicFqn}`).click();

    const lineageRes = page.waitForResponse('/api/v1/lineage/getLineage?*');
    await lineageRes;

    await expect(page.getByTestId(`lineage-node-${topicFqn}`)).toBeVisible();
  });
});

test.describe('Lineage export', () => {});

test.describe('Lineage Settings modal', () => {
  const table = new TableClass();

  test.beforeEach(async ({ page }) => {
    await table.visitEntityPage(page);
    await visitLineageTab(page);
  });

  test('Verify opening config modal', async ({ page }) => {
    await page.getByTestId('lineage-config').click();

    await expect(page.locator('[role="dialog"]')).toBeVisible();

    await expect(page.getByLabel(/upstream/i)).toBeVisible();
    await expect(page.getByLabel(/downstream/i)).toBeVisible();
  });

  test('Verify updating depth configuration', async ({ page }) => {
    await page.getByTestId('lineage-config').click();

    await page.getByLabel(/upstream/i).fill('5');
    await page.getByLabel(/downstream/i).fill('4');

    await page.getByRole('button', { name: /save/i }).click();

    await expect(page.locator('[role="dialog"]')).not.toBeVisible();

    await page.reload();
    await waitForAllLoadersToDisappear(page);

    await page.getByTestId('lineage-config').click();

    await expect(page.getByLabel(/upstream/i)).toHaveValue('5');
    await expect(page.getByLabel(/downstream/i)).toHaveValue('4');
  });

  test('Verify validation for invalid depth', async ({ page }) => {
    await page.getByTestId('lineage-config').click();

    await page.getByLabel(/upstream/i).fill('-1');
    await page.getByRole('button', { name: /save/i }).click();

    await expect(page.getByText(/cannot be less than/i)).toBeVisible();

    await expect(page.locator('[role="dialog"]')).toBeVisible();

    await page.getByLabel(/upstream/i).fill('3');
    await page.getByRole('button', { name: /save/i }).click();

    await expect(page.locator('[role="dialog"]')).not.toBeVisible();
  });
});

test.describe('Lineage graph controls', () => {
  const table = new TableClass();
  const topic = new TopicClass();
  const pipeline = new PipelineClass();

  test.beforeAll(async ({ browser }) => {
    const { apiContext, afterAction } = await getDefaultAdminAPIContext(
      browser
    );

    await Promise.all([
      table.create(apiContext),
      topic.create(apiContext),
      pipeline.create(apiContext),
    ]);

    // Patch topic with metadata for filter tests
    await topic.patch({
      apiContext,
      patchData: [
        {
          op: 'add',
          path: '/owners/0',
          value: {
            type: 'user',
            id: EntityDataClass.user1.responseData.id,
          },
        },
        {
          op: 'add',
          path: '/domains/0',
          value: {
            type: 'domain',
            id: EntityDataClass.domain1.responseData.id,
          },
        },
      ],
    });

    await connectEdgeBetweenNodesViaAPI(
      apiContext,
      { id: table.entityResponseData.id, type: 'table' },
      { id: topic.entityResponseData.id, type: 'topic' }
    );

    await afterAction();
  });

  test.afterAll(async ({ browser }) => {
    const { apiContext, afterAction } = await getDefaultAdminAPIContext(
      browser
    );
    await Promise.all([
      table.delete(apiContext),
      topic.delete(apiContext),
      pipeline.delete(apiContext),
    ]);
    await afterAction();
  });

  test.beforeEach(async ({ page }) => {
    await redirectToHomePage(page);
  });

  // ====================
  // Suite 1: Canvas Control Buttons (4 tests)
  // ====================
  test.describe('Canvas Controls', () => {
    test.beforeEach(async ({ page }) => {
      await table.visitEntityPage(page);
      await visitLineageTab(page);
      await performZoomOut(page);
    });

    test('Verify zoom in and zoom out controls', async ({ page }) => {
      const zoomInBtn = page.getByTestId('zoom-in');
      const zoomOutBtn = page.getByTestId('zoom-out');

      await performZoomOut(page, 5);

      for (let i = 0; i < 3; i++) {
        await zoomInBtn.click();
      }

      for (let i = 0; i < 3; i++) {
        await zoomOutBtn.click();
      }

      await expect(zoomInBtn).toBeVisible();
      await expect(zoomOutBtn).toBeVisible();
    });

    test('Verify fit view options menu', async ({ page }) => {
      await page.getByTestId('fit-screen').click();
      await expect(page.locator('#lineage-view-options-menu')).toBeVisible();

      await page.getByRole('menuitem', { name: 'Fit to screen' }).click();

      const tableFqn = get(table, 'entityResponseData.fullyQualifiedName', '');
      await clickLineageNode(page, tableFqn);

      await page.getByTestId('fit-screen').click();
      await page
        .getByRole('menuitem', { name: 'Refocused to selected' })
        .click();

      await page.getByTestId('fit-screen').click();
      await page.getByRole('menuitem', { name: 'Rearrange Nodes' }).click();

      await page.getByTestId('fit-screen').click();
      await page.getByRole('menuitem', { name: 'Refocused to home' }).click();
    });

    test('Verify minimap toggle functionality', async ({ page }) => {
      const minimap = page.locator('.react-flow__minimap');
      await expect(minimap).toBeVisible();

      await page.getByTestId('toggle-mind-map').click();
      await expect(minimap).not.toBeVisible();

      await page.getByTestId('toggle-mind-map').click();
      await expect(minimap).toBeVisible();
    });

    test('Verify fullscreen toggle', async ({ page }) => {
      expect(page.url()).not.toContain('fullscreen=true');

      await page.getByTestId('full-screen').click();

      expect(page.url()).toContain('fullscreen=true');

      await page.getByTestId('exit-full-screen').click();

      expect(page.url()).not.toContain('fullscreen=true');
    });
  });
});

test.describe('Lineage Layers', () => {});

test.describe('Lineage Interactions', () => {
  const table1 = new TableClass();
  const table2 = new TableClass();
  const topic = new TopicClass();
  const dashboard = new DashboardClass();
  const mlmodel = new MlModelClass();
  const pipeline = new PipelineClass();

  test.beforeAll(async ({ browser }) => {
    const { apiContext, afterAction } = await getDefaultAdminAPIContext(
      browser
    );

    await Promise.all([
      table1.create(apiContext),
      table2.create(apiContext),
      topic.create(apiContext),
      dashboard.create(apiContext),
      mlmodel.create(apiContext),
      pipeline.create(apiContext),
    ]);

    await topic.patch({
      apiContext,
      patchData: [
        {
          op: 'add',
          path: '/owners/0',
          value: {
            type: 'user',
            id: EntityDataClass.user1.responseData.id,
          },
        },
        {
          op: 'add',
          path: '/domains/0',
          value: {
            type: 'domain',
            id: EntityDataClass.domain1.responseData.id,
          },
        },
      ],
    });

    await connectEdgeBetweenNodesViaAPI(
      apiContext,
      { id: table1.entityResponseData.id, type: 'table' },
      { id: topic.entityResponseData.id, type: 'topic' }
    );

    await connectEdgeBetweenNodesViaAPI(
      apiContext,
      { id: topic.entityResponseData.id, type: 'topic' },
      { id: dashboard.entityResponseData.id, type: 'dashboard' }
    );

    await afterAction();
  });

  test.afterAll(async ({ browser }) => {
    const { apiContext, afterAction } = await performAdminLogin(browser);
    await Promise.all([
      table1.delete(apiContext),
      table2.delete(apiContext),
      topic.delete(apiContext),
      dashboard.delete(apiContext),
      mlmodel.delete(apiContext),
      pipeline.delete(apiContext),
    ]);
    await afterAction();
  });

  test.beforeEach(async ({ page }) => {
    await redirectToHomePage(page);
  });

  test.describe('Lineage Layers Toggle', () => {
    test('Verify multiple non-platform layers can be active simultaneously', async ({
      page,
    }) => {
      await table1.visitEntityPage(page);
      await visitLineageTab(page);

      await page.getByTestId('lineage-layer-btn').click();

      const columnBtn = page.getByTestId('lineage-layer-column-btn');
      const observabilityBtn = page.getByTestId(
        'lineage-layer-observability-btn'
      );

      await columnBtn.click();
      await observabilityBtn.click();
      await page.keyboard.press('Escape');

      await page.getByTestId('lineage-layer-btn').click();
      await expect(columnBtn).toHaveClass(/Mui-selected/);
      await expect(observabilityBtn).toHaveClass(/Mui-selected/);
    });
  });

  test.describe('Edge Interaction', () => {
    test.beforeEach(async ({ page }) => {
      await table1.visitEntityPage(page);
      await visitLineageTab(page);
      await performZoomOut(page);
    });

    test('Verify edge click opens edge drawer', async ({ page }) => {
      await clickEdgeBetweenNodes(page, table1, topic, false);

      await expect(page.locator('.edge-info-drawer')).toBeVisible();

      await expect(
        page.getByText(table1.entityResponseData.displayName ?? '')
      ).toBeVisible();
      await expect(
        page.getByText(topic.entityResponseData.displayName ?? '')
      ).toBeVisible();
    });

    test('Verify edge delete button in drawer', async ({ page }) => {
      const table1Fqn = get(table1, 'entityResponseData.fullyQualifiedName');

      await editLineage(page);

      await clickEdgeBetweenNodes(page, table1, topic, false);

      const deleteBtn = page
        .locator('.edge-info-drawer')
        .getByTestId('delete-edge');
      await expect(deleteBtn).toBeVisible();

      await deleteBtn.click();

      await expect(
        page.locator('[data-testid="confirmation-modal"]')
      ).toBeVisible();

      await page
        .locator('[data-testid="confirmation-modal"]')
        .getByRole('button', { name: 'Confirm' })
        .click();

      await waitForAllLoadersToDisappear(page);

      await editLineageClick(page);

      const edge = page.locator(`[data-fromnode="${table1Fqn}"]`);
      await expect(edge).not.toBeVisible();
    });

    test('Verify add pipeline to edge', async ({ page }) => {
      const { apiContext } = await getApiContext(page);
      await table2.visitEntityPage(page);
      await visitLineageTab(page);
      await performZoomOut(page);

      await editLineage(page);

      const table2Fqn = get(
        table2,
        'entityResponseData.fullyQualifiedName',
        ''
      );

      await verifyNodePresent(page, table2);

      const tableFqn = get(table1, 'entityResponseData.fullyQualifiedName');

      await connectEdgeBetweenNodesViaAPI(
        apiContext,
        { id: table2.entityResponseData.id, type: 'table' },
        { id: table1.entityResponseData.id, type: 'table' }
      );

      await page.reload();
      await visitLineageTab(page);
      await performZoomOut(page);

      await editLineage(page);

      await clickEdgeBetweenNodes(page, table2, table1, false);

      const addPipelineBtn = page
        .locator('.edge-info-drawer')
        .getByTestId('add-pipeline');
      await addPipelineBtn.click();

      await expect(page.locator('[data-testid="entity-modal"]')).toBeVisible();

      await page
        .locator('[data-testid="entity-modal"]')
        .getByTestId('searchbar')
        .fill(pipeline.entity.name);

      await page.waitForTimeout(500);

      const pipelineFqn = get(
        pipeline,
        'entityResponseData.fullyQualifiedName'
      );
      await page.getByTestId(`${pipelineFqn}-container`).click();

      const saveRes = page.waitForResponse('/api/v1/lineage');
      await page.getByRole('button', { name: 'Save' }).click();
      await saveRes;

      await waitForAllLoadersToDisappear(page);

      await editLineageClick(page);

      await expect(
        page.getByTestId(`pipeline-label-${table2Fqn}-${tableFqn}`)
      ).toBeVisible();
    });
  });

  test.describe('Node Interaction', () => {
    test.beforeEach(async ({ page }) => {
      await table1.visitEntityPage(page);
      await visitLineageTab(page);
      await performZoomOut(page);
    });

    test('Verify node panel opens on click', async ({ page }) => {
      const topicFqn = get(topic, 'entityResponseData.fullyQualifiedName', '');

      await clickLineageNode(page, topicFqn);

      await expect(page.locator('[role="dialog"]')).toBeVisible();

      await expect(
        page.getByText(topic.entityResponseData.displayName ?? '')
      ).toBeVisible();

      await page.getByLabel('Close').first().click();

      await expect(page.locator('[role="dialog"]')).not.toBeVisible();
    });
  });

  test.describe('Edit Mode Operations', () => {
    test.beforeEach(async ({ page }) => {
      await table1.visitEntityPage(page);
      await visitLineageTab(page);
      await performZoomOut(page);
    });

    test('Verify edit mode with edge operations', async ({ page }) => {
      await editLineage(page);

      await clickEdgeBetweenNodes(page, table1, topic, false);

      await expect(page.locator('.edge-info-drawer')).toBeVisible();

      const addPipelineBtn = page
        .locator('.edge-info-drawer')
        .getByTestId('add-pipeline');

      if ((await addPipelineBtn.count()) > 0) {
        await expect(addPipelineBtn).toBeVisible();
      }

      await editLineageClick(page);
    });
  });
});
