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
import test, { expect } from '@playwright/test';
import { get } from 'lodash';
import { EntityDataClass } from '../../support/entity/EntityDataClass';
import { PipelineClass } from '../../support/entity/PipelineClass';
import { TableClass } from '../../support/entity/TableClass';
import { TopicClass } from '../../support/entity/TopicClass';
import { createNewPage, redirectToHomePage } from '../../utils/common';
import { waitForAllLoadersToDisappear } from '../../utils/entity';
import {
  applyPipelineFromModal,
  clickLineageNode,
  connectEdgeBetweenNodesViaAPI,
  editLineage,
  editLineageClick,
  performZoomOut,
  visitLineageTab,
} from '../../utils/lineage';

test.use({ storageState: 'playwright/.auth/admin.json' });

const table = new TableClass();
const topic = new TopicClass();
const pipeline = new PipelineClass();

test.describe('Lineage UI Controls', () => {
  test.beforeAll(async ({ browser }) => {
    const { apiContext, afterAction } = await createNewPage(browser);

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
    const { apiContext, afterAction } = await createNewPage(browser);
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
        await page.waitForTimeout(100);
      }

      for (let i = 0; i < 3; i++) {
        await zoomOutBtn.click();
        await page.waitForTimeout(100);
      }

      await expect(zoomInBtn).toBeVisible();
      await expect(zoomOutBtn).toBeVisible();
    });

    test('Verify fit view options menu', async ({ page }) => {
      await page.getByTestId('fit-screen').click();
      await expect(
        page.locator('#lineage-view-options-menu')
      ).toBeVisible();

      await page.getByRole('menuitem', { name: 'Fit to screen' }).click();
      await page.waitForTimeout(500);

      const tableFqn = get(table, 'entityResponseData.fullyQualifiedName');
      await clickLineageNode(page, tableFqn);

      await page.getByTestId('fit-screen').click();
      await page
        .getByRole('menuitem', { name: 'Refocused to selected' })
        .click();
      await page.waitForTimeout(500);

      await page.getByTestId('fit-screen').click();
      await page.getByRole('menuitem', { name: 'Rearrange Nodes' }).click();
      await page.waitForTimeout(500);

      await page.getByTestId('fit-screen').click();
      await page.getByRole('menuitem', { name: 'Refocused to home' }).click();
      await page.waitForTimeout(500);
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
      await page.waitForTimeout(300);

      expect(page.url()).toContain('fullscreen=true');

      await page.getByTestId('exit-full-screen').click();
      await page.waitForTimeout(300);

      expect(page.url()).not.toContain('fullscreen=true');
    });
  });

  // ====================
  // Suite 2: Filters & Search (5 tests)
  // ====================
  test.describe('Filters and Search', () => {
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
      await expect(
        page.getByTestId(`lineage-node-${topicFqn}`)
      ).toBeVisible();
    });

    test('Verify service filter selection', async ({ page }) => {
      await page.locator('[aria-label="Filters"]').click();
      await page.getByTestId('search-dropdown-Service').click();

      const serviceName = get(table, 'entityResponseData.service.name');
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

      await expect(
        page.getByTestId(`lineage-node-${topicFqn}`)
      ).toBeVisible();
    });
  });

  // ====================
  // Suite 3: Impact Analysis Mode (4 tests)
  // ====================
  test.describe('Impact Analysis Mode', () => {
    test.beforeEach(async ({ page }) => {
      await table.visitEntityPage(page);
      await visitLineageTab(page);
    });

    test('Verify switch to Impact Analysis mode', async ({ page }) => {
      expect(page.url()).not.toContain('mode=impact_analysis');

      const impactRes = page.waitForResponse(
        '/api/v1/lineage/getLineageByEntityCount?*'
      );
      const paginationRes = page.waitForResponse(
        '/api/v1/lineage/getPaginationInfo?*'
      );
      await page.getByRole('button', { name: 'Impact Analysis' }).click();
      await Promise.all([impactRes, paginationRes]);

      expect(page.url()).toContain('mode=impact_analysis');

      await expect(page.getByTestId('lineage-card-table')).toBeVisible();

      const searchBar = page.locator('input[placeholder*="asset"]');
      await expect(searchBar).toBeVisible();

      await page.locator('[aria-label="Filters"]').click();
      await expect(page.getByText(/node depth/i)).toBeVisible();
    });

    test('Verify node depth dropdown', async ({ page }) => {
      await page.getByRole('button', { name: 'Impact Analysis' }).click();
      await waitForAllLoadersToDisappear(page);

      await page.locator('[aria-label="Filters"]').click();

      const depthBtn = page.getByText(/node depth/i);
      await depthBtn.click();

      await expect(page.getByRole('menuitem', { name: '1' })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: '3' })).toBeVisible();

      const lineageRes = page.waitForResponse(
        '/api/v1/lineage/getLineageByEntityCount?*'
      );
      await page.getByRole('menuitem', { name: '2' }).click();
      await lineageRes;

      expect(page.url()).toContain('depth=2');

      await waitForAllLoadersToDisappear(page);
    });

    test('Verify search in Impact Analysis', async ({ page }) => {
      await page.getByRole('button', { name: 'Impact Analysis' }).click();
      await waitForAllLoadersToDisappear(page);

      const searchInput = page.locator('input[placeholder*="asset"]');
      await searchInput.fill(topic.entity.name);

      await page.waitForTimeout(300);

      const topicRow = page
        .getByTestId(`lineage-card-table`)
        .getByText(topic.entity.displayName);
      await expect(topicRow).toBeVisible();

      await searchInput.clear();
      await page.waitForTimeout(300);
    });

    test('Verify CSV export in Impact Analysis', async ({ page }) => {
      await page.getByRole('button', { name: 'Impact Analysis' }).click();
      await waitForAllLoadersToDisappear(page);

      const downloadPromise = page.waitForEvent('download');
      await page.getByTestId('export-button').click();
      const download = await downloadPromise;

      expect(download.suggestedFilename()).toContain('.csv');
    });
  });

  // ====================
  // Suite 4: Lineage Config Modal (4 tests)
  // ====================
  test.describe('Lineage Configuration', () => {
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
      await page.waitForLoadState('networkidle');

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

    test('Verify pipeline view mode toggle', async ({ page }) => {
      await page.getByTestId('lineage-config').click();

      const pipelineModeSelect = page.locator(
        '[data-testid="field-pipeline-view-mode"]'
      );
      await pipelineModeSelect.click();
      await page.getByTitle('Edge').click();

      await page.getByRole('button', { name: /save/i }).click();

      await editLineage(page);
      await applyPipelineFromModal(page, table, topic, pipeline);
      await editLineageClick(page);

      const tableFqn = get(table, 'entityResponseData.fullyQualifiedName');
      const topicFqn = get(topic, 'entityResponseData.fullyQualifiedName');

      await expect(
        page.getByTestId(`pipeline-label-${tableFqn}-${topicFqn}`)
      ).toBeVisible();

      await expect(
        page.getByTestId(
          `lineage-node-${pipeline.entityResponseData.fullyQualifiedName}`
        )
      ).not.toBeVisible();
    });
  });
});
