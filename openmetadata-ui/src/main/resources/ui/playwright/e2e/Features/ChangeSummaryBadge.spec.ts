/*
 *  Copyright 2026 Collate.
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
import { test } from '../fixtures/pages';
import { TableClass } from '../../support/entity/TableClass';
import { performAdminLogin } from '../../utils/admin';
import { redirectToHomePage } from '../../utils/common';
import { waitForAllLoadersToDisappear } from '../../utils/entity';

const table = new TableClass();

test.describe(
  'ChangeSummary DescriptionSourceBadge',
  { tag: ['@Features', '@Discovery'] },
  () => {
    test.beforeAll('Setup test entities', async ({ browser }) => {
      const { apiContext, afterAction } = await performAdminLogin(browser);

      await table.create(apiContext);

      const entityPatchResponse = await apiContext.patch(
        `/api/v1/tables/name/${table.entityResponseData?.fullyQualifiedName}?changeSource=Suggested`,
        {
          data: [
            {
              op: 'add',
              path: '/description',
              value: 'AI-generated entity description for badge test',
            },
          ],
          headers: {
            'Content-Type': 'application/json-patch+json',
          },
        }
      );

      expect(entityPatchResponse.status()).toBe(200);

      const columnName = table.entityResponseData?.columns?.[0]?.name;
      const columnPatchResponse = await apiContext.patch(
        `/api/v1/tables/name/${table.entityResponseData?.fullyQualifiedName}?changeSource=Suggested`,
        {
          data: [
            {
              op: 'add',
              path: `/columns/0/description`,
              value: 'AI-generated column description for badge test',
            },
          ],
          headers: {
            'Content-Type': 'application/json-patch+json',
          },
        }
      );

      expect(columnPatchResponse.status()).toBe(200);

      const changeSummaryResponse = await apiContext.get(
        `/api/v1/changeSummary/table/${table.entityResponseData?.id}`
      );

      expect(changeSummaryResponse.status()).toBe(200);

      const changeSummaryData = await changeSummaryResponse.json();

      expect(changeSummaryData.changeSummary).toHaveProperty('description');
      expect(
        changeSummaryData.changeSummary.description.changeSource
      ).toBe('Suggested');

      expect(
        changeSummaryData.changeSummary[
          `columns.${columnName}.description`
        ]
      ).toBeDefined();

      await afterAction();
    });

    test.afterAll('Cleanup test entities', async ({ browser }) => {
      const { apiContext, afterAction } = await performAdminLogin(browser);
      await table.delete(apiContext);
      await afterAction();
    });

    test('AI badge should appear on entity description with Suggested source', async ({
      page,
    }) => {
      test.slow();

      await redirectToHomePage(page);

      await test.step('Navigate to entity page and verify AI badge', async () => {
        const changeSummaryResponse = page.waitForResponse(
          (response) => response.url().includes('/api/v1/changeSummary/')
        );

        await table.visitEntityPage(page);
        await changeSummaryResponse;
        await waitForAllLoadersToDisappear(page);

        const descriptionContainer = page.getByTestId(
          'asset-description-container'
        );

        await expect(descriptionContainer).toBeVisible();

        const badge = descriptionContainer.getByTestId('ai-suggested-badge');

        await expect(badge).toBeVisible();
      });

      await test.step('Verify badge tooltip shows metadata', async () => {
        const badge = page
          .getByTestId('asset-description-container')
          .getByTestId('ai-suggested-badge');

        await badge.hover();

        const tooltip = page.locator('.ant-tooltip:visible');

        await expect(tooltip).toBeVisible();
      });
    });

    test('AI badge should appear on column description with Suggested source', async ({
      page,
    }) => {
      test.slow();

      await redirectToHomePage(page);

      await test.step('Navigate to entity page and verify column badge', async () => {
        const changeSummaryResponse = page.waitForResponse(
          (response) => response.url().includes('/api/v1/changeSummary/')
        );

        await table.visitEntityPage(page);
        await changeSummaryResponse;
        await waitForAllLoadersToDisappear(page);

        const descriptionCells = page
          .getByTestId('description')
          .getByTestId('ai-suggested-badge');

        await expect(descriptionCells.first()).toBeVisible();
      });
    });

    test('AI badge should NOT appear for manually-edited descriptions', async ({
      browser,
      page,
    }) => {
      test.slow();

      const manualTable = new TableClass();

      await test.step('Create table with manual description', async () => {
        const { apiContext, afterAction } = await performAdminLogin(browser);

        await manualTable.create(apiContext);

        const patchResponse = await apiContext.patch(
          `/api/v1/tables/name/${manualTable.entityResponseData?.fullyQualifiedName}`,
          {
            data: [
              {
                op: 'add',
                path: '/description',
                value: 'Manually written description',
              },
            ],
            headers: {
              'Content-Type': 'application/json-patch+json',
            },
          }
        );

        expect(patchResponse.status()).toBe(200);
        await afterAction();
      });

      await test.step('Navigate and verify no AI badge', async () => {
        await redirectToHomePage(page);

        const changeSummaryResponse = page.waitForResponse(
          (response) => response.url().includes('/api/v1/changeSummary/')
        );

        await manualTable.visitEntityPage(page);
        await changeSummaryResponse;
        await waitForAllLoadersToDisappear(page);

        const descriptionContainer = page.getByTestId(
          'asset-description-container'
        );

        await expect(descriptionContainer).toBeVisible();

        const badge = descriptionContainer.getByTestId('ai-suggested-badge');

        await expect(badge).not.toBeVisible();
      });

      await test.step('Cleanup manual table', async () => {
        const { apiContext, afterAction } = await performAdminLogin(browser);
        await manualTable.delete(apiContext);
        await afterAction();
      });
    });
  }
);
