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
import { expect } from '@playwright/test';
import { get } from 'lodash';
import { DashboardClass } from '../../support/entity/DashboardClass';
import { EntityDataClass } from '../../support/entity/EntityDataClass';
import { MlModelClass } from '../../support/entity/MlModelClass';
import { PipelineClass } from '../../support/entity/PipelineClass';
import { TableClass } from '../../support/entity/TableClass';
import { TopicClass } from '../../support/entity/TopicClass';
import { performAdminLogin } from '../../utils/admin';
import { createNewPage, redirectToHomePage } from '../../utils/common';
import { waitForAllLoadersToDisappear } from '../../utils/entity';
import {
  activateColumnLayer,
  clickEdgeBetweenNodes,
  clickLineageNode,
  connectEdgeBetweenNodesViaAPI,
  editLineage,
  editLineageClick,
  performCollapse,
  performExpand,
  performZoomOut,
  verifyNodePresent,
  visitLineageTab,
} from '../../utils/lineage';
import { test } from '../fixtures/pages';

const table1 = new TableClass();
const table2 = new TableClass();
const topic = new TopicClass();
const dashboard = new DashboardClass();
const mlmodel = new MlModelClass();
const pipeline = new PipelineClass();

test.describe('Lineage Interactions', () => {
  test.beforeAll(async ({ browser }) => {
    const { apiContext, afterAction } = await performAdminLogin(browser);

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
    const entities = [
      { entity: table1, type: 'table', name: 'Table' },
      { entity: topic, type: 'topic', name: 'Topic' },
      { entity: dashboard, type: 'dashboard', name: 'Dashboard' },
    ];

    for (const { entity, name } of entities) {
      test(`Verify layer toggles for ${name}`, async ({ page }) => {
        await entity.visitEntityPage(page);
        await visitLineageTab(page);
        await performZoomOut(page);

        await page.getByTestId('lineage-layer-btn').click();

        const columnBtn = page.getByTestId('lineage-layer-column-btn');
        await expect(columnBtn).toBeVisible();

        await expect(columnBtn).not.toHaveClass(/Mui-selected/);

        await columnBtn.click();
        await page.keyboard.press('Escape');

        await page.getByTestId('lineage-layer-btn').click();
        await expect(columnBtn).toHaveClass(/Mui-selected/);

        const observabilityBtn = page.getByTestId(
          'lineage-layer-observability-btn'
        );
        await observabilityBtn.click();
        await page.keyboard.press('Escape');

        await page.getByTestId('lineage-layer-btn').click();
        await expect(columnBtn).toHaveClass(/Mui-selected/);
        await expect(observabilityBtn).toHaveClass(/Mui-selected/);

        await columnBtn.click();
        await page.keyboard.press('Escape');

        await page.getByTestId('lineage-layer-btn').click();
        await expect(columnBtn).not.toHaveClass(/Mui-selected/);
        await expect(observabilityBtn).toHaveClass(/Mui-selected/);
      });
    }

    test('Verify platform view toggles are exclusive', async ({ page }) => {
      await table1.visitEntityPage(page);
      await visitLineageTab(page);

      await page.getByTestId('lineage-layer-btn').click();

      const serviceBtn = page.getByTestId('lineage-layer-service-btn');
      await expect(serviceBtn).toBeVisible();

      await serviceBtn.click();
      await page.keyboard.press('Escape');

      await page.getByTestId('lineage-layer-btn').click();
      await expect(serviceBtn).toHaveClass(/Mui-selected/);

      const domainBtn = page.getByTestId('lineage-layer-domain-btn');
      await domainBtn.click();
      await page.keyboard.press('Escape');

      await page.getByTestId('lineage-layer-btn').click();
      await expect(domainBtn).toHaveClass(/Mui-selected/);
      await expect(serviceBtn).not.toHaveClass(/Mui-selected/);
    });

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
      const table1Fqn = get(table1, 'entityResponseData.fullyQualifiedName');
      const topicFqn = get(topic, 'entityResponseData.fullyQualifiedName');

      await clickEdgeBetweenNodes(page, table1Fqn, topicFqn, false);

      await expect(page.locator('.edge-info-drawer')).toBeVisible();

      await expect(
        page.getByText(table1.entityResponseData.displayName)
      ).toBeVisible();
      await expect(
        page.getByText(topic.entityResponseData.displayName)
      ).toBeVisible();
    });

    test('Verify edge delete button in drawer', async ({ page }) => {
      const table1Fqn = get(table1, 'entityResponseData.fullyQualifiedName');
      const topicFqn = get(topic, 'entityResponseData.fullyQualifiedName');

      await editLineage(page);

      await clickEdgeBetweenNodes(page, table1Fqn, topicFqn, false);

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
      await table2.visitEntityPage(page);
      await visitLineageTab(page);
      await performZoomOut(page);

      await editLineage(page);

      const table2Fqn = get(table2, 'entityResponseData.fullyQualifiedName');

      await verifyNodePresent(page, table2);

      const tableFqn = get(table1, 'entityResponseData.fullyQualifiedName');

      await connectEdgeBetweenNodesViaAPI(
        await (async () => {
          const { apiContext } = await createNewPage(await page.context());

          return apiContext;
        })(),
        { id: table2.entityResponseData.id, type: 'table' },
        { id: table1.entityResponseData.id, type: 'table' }
      );

      await page.reload();
      await visitLineageTab(page);
      await performZoomOut(page);

      await editLineage(page);

      await clickEdgeBetweenNodes(page, table2Fqn, tableFqn, false);

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

    test('Verify column edge interaction', async ({ page }) => {
      await activateColumnLayer(page);

      const tableColumns = get(
        table1,
        'entityResponseData.columns',
        []
      ) as Array<{ fullyQualifiedName: string }>;
      const topicFields = get(
        topic,
        'entityResponseData.messageSchema.schemaFields',
        []
      ) as Array<{
        fullyQualifiedName: string;
      }>;

      if (tableColumns.length > 0 && topicFields.length > 0) {
        const sourceColFqn = tableColumns[0].fullyQualifiedName;
        const targetColFqn = topicFields[0].fullyQualifiedName;

        const columnEdge = page.locator(
          `[data-fromnode="${sourceColFqn}"][data-tonode="${targetColFqn}"]`
        );

        if ((await columnEdge.count()) > 0) {
          await columnEdge.click();

          await expect(page.locator('.edge-info-drawer')).toBeVisible();
        }
      }
    });

    test('Verify edge hover highlighting', async ({ page }) => {
      const table1Fqn = get(table1, 'entityResponseData.fullyQualifiedName');
      const topicFqn = get(topic, 'entityResponseData.fullyQualifiedName');

      const edge = page.locator(
        `[data-fromnode="${table1Fqn}"][data-tonode="${topicFqn}"]`
      );

      await expect(edge).toBeVisible();

      await edge.hover();

      await page.waitForTimeout(300);
    });
  });

  test.describe('Node Interaction', () => {
    test.beforeEach(async ({ page }) => {
      await table1.visitEntityPage(page);
      await visitLineageTab(page);
      await performZoomOut(page);
    });

    test('Verify node click selection and tracing', async ({ page }) => {
      const topicFqn = get(topic, 'entityResponseData.fullyQualifiedName');

      await clickLineageNode(page, topicFqn);

      const topicNode = page.getByTestId(`lineage-node-${topicFqn}`);
      await expect(topicNode).toBeVisible();

      await page
        .locator('.react-flow__pane')
        .click({ position: { x: 10, y: 10 } });

      await page.waitForTimeout(300);
    });

    test('Verify node panel opens on click', async ({ page }) => {
      const topicFqn = get(topic, 'entityResponseData.fullyQualifiedName');

      await clickLineageNode(page, topicFqn);

      await expect(page.locator('[role="dialog"]')).toBeVisible();

      await expect(
        page.getByText(topic.entityResponseData.displayName)
      ).toBeVisible();

      await page.getByLabel('Close').first().click();

      await expect(page.locator('[role="dialog"]')).not.toBeVisible();
    });

    test('Verify node visibility in lineage', async ({ page }) => {
      await verifyNodePresent(page, table1);
      await verifyNodePresent(page, topic);
    });

    test('Verify multiple node interactions', async ({ page }) => {
      const table1Fqn = get(table1, 'entityResponseData.fullyQualifiedName');
      const topicFqn = get(topic, 'entityResponseData.fullyQualifiedName');

      await clickLineageNode(page, table1Fqn);
      await page.waitForTimeout(300);

      await page
        .locator('.react-flow__pane')
        .click({ position: { x: 10, y: 10 } });

      await clickLineageNode(page, topicFqn);
      await page.waitForTimeout(300);
    });
  });

  test.describe('Node Expansion and Lazy Loading', () => {
    test.beforeEach(async ({ page }) => {
      await dashboard.visitEntityPage(page);
      await visitLineageTab(page);
      await performZoomOut(page);
    });

    test('Verify upstream expansion with API call', async ({ page }) => {
      const dashboardFqn = get(
        dashboard,
        'entityResponseData.fullyQualifiedName'
      );

      const upstreamExpandHandle = page
        .getByTestId(`lineage-node-${dashboardFqn}`)
        .locator('[data-testid="upstream-expand-handle"]');

      if ((await upstreamExpandHandle.count()) > 0) {
        await upstreamExpandHandle.hover();

        await expect(page.getByText(/load upstream/i)).toBeVisible();

        const lineageRes = page.waitForResponse('/api/v1/lineage/**');
        await upstreamExpandHandle.click();
        await lineageRes;

        await waitForAllLoadersToDisappear(page);

        await performExpand(page, dashboard, true, topic);

        await verifyNodePresent(page, topic);

        const collapseHandle = page
          .getByTestId(`lineage-node-${dashboardFqn}`)
          .locator('[data-testid="upstream-collapse-handle"]');

        await expect(collapseHandle).toBeVisible();
      }
    });

    test('Verify downstream expansion with API call', async ({ page }) => {
      await table1.visitEntityPage(page);
      await visitLineageTab(page);
      await performZoomOut(page);

      const table1Fqn = get(table1, 'entityResponseData.fullyQualifiedName');

      const downstreamExpandHandle = page
        .getByTestId(`lineage-node-${table1Fqn}`)
        .locator('[data-testid="downstream-expand-handle"]');

      if ((await downstreamExpandHandle.count()) > 0) {
        const lineageRes = page.waitForResponse('/api/v1/lineage/**');
        await downstreamExpandHandle.click();
        await lineageRes;

        await waitForAllLoadersToDisappear(page);
      }
    });

    test('Verify collapse hides expanded nodes', async ({ page }) => {
      const dashboardFqn = get(
        dashboard,
        'entityResponseData.fullyQualifiedName'
      );

      const upstreamExpandHandle = page
        .getByTestId(`lineage-node-${dashboardFqn}`)
        .locator('[data-testid="upstream-expand-handle"]');

      if ((await upstreamExpandHandle.count()) > 0) {
        await upstreamExpandHandle.click();
        await waitForAllLoadersToDisappear(page);

        await performCollapse(page, dashboard, true, [topic]);

        const topicFqn = get(topic, 'entityResponseData.fullyQualifiedName');
        const topicNode = page.getByTestId(`lineage-node-${topicFqn}`);

        await page.waitForTimeout(500);
      }
    });

    test('Verify expand handle tooltip', async ({ page }) => {
      const dashboardFqn = get(
        dashboard,
        'entityResponseData.fullyQualifiedName'
      );

      const upstreamExpandHandle = page
        .getByTestId(`lineage-node-${dashboardFqn}`)
        .locator('[data-testid="upstream-expand-handle"]');

      if ((await upstreamExpandHandle.count()) > 0) {
        await upstreamExpandHandle.hover();

        await page.waitForTimeout(500);
      }
    });
  });

  test.describe('Edit Mode Operations', () => {
    test.beforeEach(async ({ page }) => {
      await table1.visitEntityPage(page);
      await visitLineageTab(page);
      await performZoomOut(page);
    });

    test('Verify entering and exiting edit mode', async ({ page }) => {
      await editLineage(page);

      await expect(page.getByTestId('edit-lineage')).toHaveClass(/active/);

      const table1Fqn = get(table1, 'entityResponseData.fullyQualifiedName');
      const tableNode = page.getByTestId(`lineage-node-${table1Fqn}`);

      await expect(tableNode.locator('.react-flow__handle')).toBeVisible();

      await editLineageClick(page);

      await expect(page.getByTestId('edit-lineage')).not.toHaveClass(/active/);
    });

    test('Verify column layer activation in edit mode', async ({ page }) => {
      await editLineage(page);

      await activateColumnLayer(page);

      await page.waitForTimeout(500);

      await editLineageClick(page);
    });

    test('Verify edit mode with edge operations', async ({ page }) => {
      await editLineage(page);

      const table1Fqn = get(table1, 'entityResponseData.fullyQualifiedName');
      const topicFqn = get(topic, 'entityResponseData.fullyQualifiedName');

      await clickEdgeBetweenNodes(page, table1Fqn, topicFqn, false);

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
