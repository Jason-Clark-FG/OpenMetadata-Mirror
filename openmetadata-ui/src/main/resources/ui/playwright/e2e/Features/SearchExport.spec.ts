/*
 *  Copyright 2024 Collate.
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

import { expect, Page } from '@playwright/test';
import { redirectToHomePage } from '../../utils/common';
import { test } from '../fixtures/pages';

const navigateToExplorePage = async (page: Page) => {
  await redirectToHomePage(page);
  await page.getByTestId('app-bar-item-explore').click();
  await expect(page.getByTestId('explore-page')).toBeVisible();
};

test.describe('Search Export', () => {
  test('Export button is visible on Explore page', async ({ page }) => {
    await navigateToExplorePage(page);

    const exportButton = page.getByTestId('export-search-results-button');
    await expect(exportButton).toBeVisible();
    await expect(exportButton).toHaveText(/Export/);
  });

  test('Export button shows dropdown with Current Tab and All Data Assets options', async ({
    page,
  }) => {
    await navigateToExplorePage(page);

    const exportButton = page.getByTestId('export-search-results-button');
    await exportButton.click();

    const dropdown = page.locator('.ant-dropdown:visible');
    await expect(dropdown).toBeVisible();
    await expect(dropdown.getByText('Current Tab')).toBeVisible();
    await expect(dropdown.getByText('All Data Assets')).toBeVisible();
  });

  test('Current Tab export calls streaming API with index parameter', async ({
    page,
  }) => {
    await navigateToExplorePage(page);

    const apiPromise = page.waitForRequest(
      (req) =>
        req.url().includes('/api/v1/search/export') &&
        !req.url().includes('exportAsync') &&
        req.method() === 'GET'
    );

    await page.getByTestId('export-search-results-button').click();
    const dropdown = page.locator('.ant-dropdown:visible');
    await dropdown.getByText('Current Tab').click();

    const request = await apiPromise;
    const url = request.url();
    expect(url).toContain('index=');
  });

  test('All Data Assets export calls streaming API with dataAsset index', async ({
    page,
  }) => {
    await navigateToExplorePage(page);

    const apiPromise = page.waitForRequest(
      (req) =>
        req.url().includes('/api/v1/search/export') &&
        !req.url().includes('exportAsync') &&
        req.method() === 'GET'
    );

    await page.getByTestId('export-search-results-button').click();
    const dropdown = page.locator('.ant-dropdown:visible');
    await dropdown.getByText('All Data Assets').click();

    const request = await apiPromise;
    expect(request.url()).toContain('index=dataAsset');
  });

  test('Export triggers direct CSV download', async ({ page }) => {
    await navigateToExplorePage(page);

    // Intercept the streaming export API to return mock CSV data
    await page.route('**/api/v1/search/export?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/octet-stream',
        headers: {
          'Content-Disposition': 'attachment; filename="search_export.csv"',
        },
        body: 'Entity Type,Service Name,Service Type,FQN,Name,Display Name,Description,Owners,Tags,Glossary Terms,Domains,Tier\ntable,mysql,Mysql,sample_data.ecommerce_db.shopify.dim_address,dim_address,dim_address,,,,,,',
      });
    });

    const downloadPromise = page.waitForEvent('download');

    await page.getByTestId('export-search-results-button').click();
    const dropdown = page.locator('.ant-dropdown:visible');
    await dropdown.getByText('Current Tab').click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('search_export_');
    expect(download.suggestedFilename()).toContain('.csv');
  });

  test('Export button shows loading state during download', async ({
    page,
  }) => {
    await navigateToExplorePage(page);

    // Slow down the response to observe loading state
    await page.route('**/api/v1/search/export?*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.fulfill({
        status: 200,
        contentType: 'application/octet-stream',
        headers: {
          'Content-Disposition': 'attachment; filename="search_export.csv"',
        },
        body: 'Entity Type,Service Name\ntable,mysql',
      });
    });

    await page.getByTestId('export-search-results-button').click();
    const dropdown = page.locator('.ant-dropdown:visible');
    await dropdown.getByText('Current Tab').click();

    // Button should show loading state
    const exportButton = page.getByTestId('export-search-results-button');
    await expect(exportButton).toHaveClass(/ant-btn-loading/);
  });

  test('Dropdown closes after selecting an option', async ({ page }) => {
    await navigateToExplorePage(page);

    await page.getByTestId('export-search-results-button').click();

    const dropdown = page.locator('.ant-dropdown:visible');
    await expect(dropdown).toBeVisible();

    await dropdown.getByText('Current Tab').click();

    await expect(page.locator('.ant-dropdown:visible')).not.toBeVisible();
  });

  test('Export button is accessible with keyboard', async ({ page }) => {
    await navigateToExplorePage(page);

    const exportButton = page.getByTestId('export-search-results-button');
    await exportButton.focus();
    await page.keyboard.press('Enter');

    const dropdown = page.locator('.ant-dropdown:visible');
    await expect(dropdown).toBeVisible();
  });
});
