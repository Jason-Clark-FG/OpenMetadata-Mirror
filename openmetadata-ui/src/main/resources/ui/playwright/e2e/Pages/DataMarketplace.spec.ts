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
import { DataProduct } from '../../support/domain/DataProduct';
import { Domain } from '../../support/domain/Domain';
import { test } from '../fixtures/pages';
import { performAdminLogin } from '../../utils/admin';
import {
  closeSearchPopover,
  navigateToMarketplace,
  searchMarketplace,
} from '../../utils/dataMarketplace';
import { waitForAllLoadersToDisappear } from '../../utils/entity';

const domain1 = new Domain();
const domain2 = new Domain();
const domain3 = new Domain();
const domain4 = new Domain();

const dp1 = new DataProduct([domain1]);
const dp2 = new DataProduct([domain1]);
const dp3 = new DataProduct([domain1]);
const dp4 = new DataProduct([domain1]);

test.describe(
  'Data Marketplace - Core',
  { tag: ['@Pages', '@Discovery'] },
  () => {
    test.beforeAll('Setup entities', async ({ browser }) => {
      const { apiContext, afterAction } = await performAdminLogin(browser);

      await domain1.create(apiContext);
      await domain2.create(apiContext);
      await domain3.create(apiContext);
      await domain4.create(apiContext);

      await dp1.create(apiContext);
      await dp2.create(apiContext);
      await dp3.create(apiContext);
      await dp4.create(apiContext);

      await afterAction();
    });

    test.afterAll('Cleanup entities', async ({ browser }) => {
      const { apiContext, afterAction } = await performAdminLogin(browser);

      await dp4.delete(apiContext);
      await dp3.delete(apiContext);
      await dp2.delete(apiContext);
      await dp1.delete(apiContext);

      await domain4.delete(apiContext);
      await domain3.delete(apiContext);
      await domain2.delete(apiContext);
      await domain1.delete(apiContext);

      await afterAction();
    });

    test('Page renders with greeting, search, and default widgets', async ({
      page,
    }) => {
      test.slow();

      await test.step('Navigate to marketplace via sidebar', async () => {
        await navigateToMarketplace(page);
        await expect(page).toHaveURL(/.*data-marketplace/);
      });

      await test.step('Verify greeting banner', async () => {
        await expect(page.getByTestId('marketplace-greeting')).toBeVisible();
        await expect(page.getByTestId('greeting-text')).toBeVisible();
      });

      await test.step('Verify search bar is present', async () => {
        const searchInput = page.getByTestId('marketplace-search-input');
        await expect(searchInput).toBeVisible();
        await expect(searchInput).toBeEnabled();
      });

      await test.step('Verify data products widget', async () => {
        await expect(page.getByTestId('marketplace-dp-widget')).toBeVisible();
        await expect(
          page.getByTestId('view-all-data-products')
        ).toBeVisible();
      });

      await test.step('Verify domains widget', async () => {
        await expect(
          page.getByTestId('marketplace-domains-widget')
        ).toBeVisible();
        await expect(page.getByTestId('view-all-domains')).toBeVisible();
      });

      await test.step('Verify admin action buttons', async () => {
        await expect(
          page.getByTestId('add-data-product-btn')
        ).toBeVisible();
        await expect(page.getByTestId('add-domain-btn')).toBeVisible();
      });
    });

    test('Search returns results and clicking navigates to entity', async ({
      page,
    }) => {
      test.slow();

      await test.step('Navigate to marketplace', async () => {
        await navigateToMarketplace(page);
      });

      await test.step('Search for a data product', async () => {
        await searchMarketplace(page, dp4.data.displayName);
        const resultItem = page.getByTestId(
          `search-result-dp-${dp4.responseData.id}`
        );
        await expect(resultItem).toBeVisible();
      });

      await test.step(
        'Click data product result and verify navigation',
        async () => {
          const resultItem = page.getByTestId(
            `search-result-dp-${dp4.responseData.id}`
          );
          await resultItem.dispatchEvent('click');
          await page.waitForURL('**/dataProduct/**');
        }
      );

      await test.step('Navigate back and search for a domain', async () => {
        await navigateToMarketplace(page);
        await searchMarketplace(page, domain4.data.displayName);
        await expect(
          page.getByTestId(
            `search-result-domain-${domain4.responseData.id}`
          )
        ).toBeVisible();
      });

      await test.step(
        'Click domain result and verify navigation',
        async () => {
          const resultItem = page.getByTestId(
            `search-result-domain-${domain4.responseData.id}`
          );
          await resultItem.dispatchEvent('click');
          await page.waitForURL('**/domain/**');
        }
      );
    });

    test('Recent searches persist, are clickable, and clearable', async ({
      page,
    }) => {
      test.slow();

      await test.step('Navigate and perform first search', async () => {
        await navigateToMarketplace(page);
        await searchMarketplace(page, 'testquery1');
        await closeSearchPopover(page);
      });

      await test.step('Perform second search', async () => {
        await searchMarketplace(page, 'testquery2');
        await closeSearchPopover(page);
      });

      await test.step('Verify recent searches appear', async () => {
        await expect(
          page.getByTestId('marketplace-recent-searches')
        ).toBeVisible();
        await expect(
          page.getByTestId('recent-search-testquery2')
        ).toBeVisible();
        await expect(
          page.getByTestId('recent-search-testquery1')
        ).toBeVisible();
      });

      await test.step(
        'Click recent search tag re-executes search',
        async () => {
          const searchResponse = page.waitForResponse(
            (response) =>
              response.url().includes('/api/v1/search/query') &&
              response.status() === 200
          );
          await page.getByTestId('recent-search-testquery1').click();
          await searchResponse;

          await expect(
            page.getByTestId('marketplace-search-input')
          ).toHaveValue('testquery1');
        }
      );

      await test.step(
        'Verify recent searches persist after reload',
        async () => {
          await page.reload();
          await waitForAllLoadersToDisappear(page);
          await expect(
            page.getByTestId('recent-search-testquery1')
          ).toBeVisible();
        }
      );

      await test.step('Clear recent searches', async () => {
        await page.getByTestId('clear-recent-searches').click();
        await expect(
          page.getByTestId('marketplace-recent-searches')
        ).not.toBeVisible();
      });

      await test.step(
        'Verify cleared state persists after reload',
        async () => {
          await page.reload();
          await waitForAllLoadersToDisappear(page);
          await expect(
            page.getByTestId('marketplace-recent-searches')
          ).not.toBeVisible();
        }
      );
    });

    test('Widget card click navigates to entity detail page', async ({
      page,
    }) => {
      test.slow();

      await test.step('Navigate to marketplace', async () => {
        await navigateToMarketplace(page);
      });

      await test.step(
        'Click data product card and verify navigation',
        async () => {
          const dpWidget = page.getByTestId('marketplace-dp-widget');
          const dpCard = dpWidget
            .locator('[data-testid^="marketplace-dp-card-"]')
            .first();
          await expect(dpCard).toBeVisible();
          await dpCard.click();
          await page.waitForURL('**/dataProduct/**');
        }
      );

      await test.step(
        'Navigate back and click domain card',
        async () => {
          await navigateToMarketplace(page);
          const domainsWidget = page.getByTestId(
            'marketplace-domains-widget'
          );
          const domainCard = domainsWidget
            .locator('[data-testid^="marketplace-domain-card-"]')
            .first();
          await expect(domainCard).toBeVisible();
          await domainCard.click();
          await page.waitForURL('**/domain/**');
        }
      );
    });

    test('View All links navigate correctly', async ({ page }) => {
      test.slow();

      await test.step('Navigate to marketplace', async () => {
        await navigateToMarketplace(page);
      });

      await test.step(
        'Click View All Data Products and verify',
        async () => {
          const viewAllDp = page.getByTestId('view-all-data-products');
          await expect(viewAllDp).toBeVisible();
          await viewAllDp.click();
          await page.waitForURL('**/dataProduct**');
        }
      );

      await test.step(
        'Navigate back and click View All Domains',
        async () => {
          await navigateToMarketplace(page);
          const viewAllDomains = page.getByTestId('view-all-domains');
          await expect(viewAllDomains).toBeVisible();
          await viewAllDomains.click();
          await page.waitForURL('**/domain**');
        }
      );
    });
  }
);
