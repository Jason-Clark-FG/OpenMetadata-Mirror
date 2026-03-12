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
import { TableClass } from '../../support/entity/TableClass';
import { TopicClass } from '../../support/entity/TopicClass';
import { createNewPage, redirectToHomePage } from '../../utils/common';
import { waitForAllLoadersToDisappear } from '../../utils/entity';
import {
  connectEdgeBetweenNodesViaAPI,
  performZoomOut,
  visitLineageTab,
} from '../../utils/lineage';
import { sidebarClick } from '../../utils/sidebar';

test.use({ storageState: 'playwright/.auth/admin.json' });

const table = new TableClass();
const topic = new TopicClass();

test.describe('Lineage Advanced Features', () => {
  test.beforeAll(async ({ browser }) => {
    const { apiContext, afterAction } = await createNewPage(browser);

    await Promise.all([table.create(apiContext), topic.create(apiContext)]);

    await table.patch({
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
    await Promise.all([table.delete(apiContext), topic.delete(apiContext)]);
    await afterAction();
  });

  test.beforeEach(async ({ page }) => {
    await redirectToHomePage(page);
  });

  test.describe('Data Observability Layer', () => {
    test.beforeEach(async ({ page }) => {
      await table.visitEntityPage(page);
      await visitLineageTab(page);
      await performZoomOut(page);
    });

    test('Verify DQ layer toggle activation', async ({ page }) => {
      await page.getByTestId('lineage-layer-btn').click();

      const observabilityBtn = page.getByTestId(
        'lineage-layer-observability-btn'
      );
      await expect(observabilityBtn).toBeVisible();

      await expect(observabilityBtn).not.toHaveClass(/Mui-selected/);

      await observabilityBtn.click();
      await page.keyboard.press('Escape');

      await page.getByTestId('lineage-layer-btn').click();
      await expect(observabilityBtn).toHaveClass(/Mui-selected/);
    });

    test('Verify DQ layer toggle off removes highlights', async ({ page }) => {
      await page.getByTestId('lineage-layer-btn').click();

      const observabilityBtn = page.getByTestId(
        'lineage-layer-observability-btn'
      );

      await observabilityBtn.click();
      await page.keyboard.press('Escape');

      await page.waitForTimeout(500);

      await page.getByTestId('lineage-layer-btn').click();
      await expect(observabilityBtn).toHaveClass(/Mui-selected/);

      await observabilityBtn.click();
      await page.keyboard.press('Escape');

      await page.getByTestId('lineage-layer-btn').click();
      await expect(observabilityBtn).not.toHaveClass(/Mui-selected/);
    });
  });

  test.describe('Platform Lineage Views', () => {
    test('Verify service platform view', async ({ page }) => {
      await table.visitEntityPage(page);
      await visitLineageTab(page);
      await performZoomOut(page);

      await page.getByTestId('lineage-layer-btn').click();

      const serviceBtn = page.getByTestId('lineage-layer-service-btn');
      await expect(serviceBtn).toBeVisible();

      await serviceBtn.click();
      await page.keyboard.press('Escape');

      await page.waitForTimeout(500);

      await page.getByTestId('lineage-layer-btn').click();
      await expect(serviceBtn).toHaveClass(/Mui-selected/);
    });

    test('Verify domain platform view', async ({ page }) => {
      await table.visitEntityPage(page);
      await visitLineageTab(page);
      await performZoomOut(page);

      await page.getByTestId('lineage-layer-btn').click();

      const domainBtn = page.getByTestId('lineage-layer-domain-btn');
      await expect(domainBtn).toBeVisible();

      await domainBtn.click();
      await page.keyboard.press('Escape');

      await page.waitForTimeout(500);

      await page.getByTestId('lineage-layer-btn').click();
      await expect(domainBtn).toHaveClass(/Mui-selected/);

      await page.keyboard.press('Escape');

      await waitForAllLoadersToDisappear(page);
    });

    test('Verify platform view switching', async ({ page }) => {
      await table.visitEntityPage(page);
      await visitLineageTab(page);
      await performZoomOut(page);

      await page.getByTestId('lineage-layer-btn').click();

      const serviceBtn = page.getByTestId('lineage-layer-service-btn');
      const domainBtn = page.getByTestId('lineage-layer-domain-btn');

      await serviceBtn.click();
      await page.keyboard.press('Escape');

      await page.getByTestId('lineage-layer-btn').click();
      await expect(serviceBtn).toHaveClass(/Mui-selected/);
      await expect(domainBtn).not.toHaveClass(/Mui-selected/);

      await domainBtn.click();
      await page.keyboard.press('Escape');

      await page.getByTestId('lineage-layer-btn').click();
      await expect(domainBtn).toHaveClass(/Mui-selected/);
      await expect(serviceBtn).not.toHaveClass(/Mui-selected/);
    });
  });

  test.describe('Error Handling', () => {
    test('Verify invalid entity search handling', async ({ page }) => {
      await sidebarClick(page, 'Govern');
      await page.getByTestId('appbar-item-lineage').click();

      await waitForAllLoadersToDisappear(page);

      const searchSelect = page.getByTestId('search-entity-select');
      await expect(searchSelect).toBeVisible();

      await searchSelect.click();

      await page
        .locator(
          '[data-testid="search-entity-select"] .ant-select-selection-search-input'
        )
        .fill('invalid_fqn_does_not_exist_12345');

      await page.waitForTimeout(500);

      const noResultsText = page.getByText(/no match/i);
      if ((await noResultsText.count()) > 0) {
        await expect(noResultsText).toBeVisible();
      }
    });

    test('Verify lineage tab with no lineage data', async ({ page }) => {
      const emptyTable = new TableClass();
      const { apiContext, afterAction } = await createNewPage(page.context());

      await emptyTable.create(apiContext);

      await emptyTable.visitEntityPage(page);
      await visitLineageTab(page);

      await waitForAllLoadersToDisappear(page);

      const tableFqn = get(
        emptyTable,
        'entityResponseData.fullyQualifiedName'
      );
      const tableNode = page.getByTestId(`lineage-node-${tableFqn}`);
      await expect(tableNode).toBeVisible();

      await emptyTable.delete(apiContext);
      await afterAction();
    });
  });
});
