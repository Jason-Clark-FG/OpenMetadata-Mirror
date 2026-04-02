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

const openExportScopeModal = async (page: Page) => {
  await page.getByTestId('export-search-results-button').click();
  await expect(page.getByTestId('export-scope-modal')).toBeVisible();
};

test.describe('Search Export', { tag: ['@Features', '@Discovery'] }, () => {
  test('Export button is visible on Explore page', async ({ page }) => {
    await navigateToExplorePage(page);

    const exportButton = page.getByTestId('export-search-results-button');

    await expect(exportButton).toBeVisible();
    await expect(exportButton).toContainText('Export');
  });

  test('Clicking Export button opens scope selection modal', async ({
    page,
  }) => {
    await navigateToExplorePage(page);

    await page.getByTestId('export-search-results-button').click();

    const modal = page.getByTestId('export-scope-modal');

    await expect(modal).toBeVisible();
    await expect(modal.getByText('Export')).toBeVisible();
    await expect(modal.getByText('Export Scope')).toBeVisible();
  });

  test('Export scope modal shows Visible results and All matching assets options', async ({
    page,
  }) => {
    await navigateToExplorePage(page);
    await openExportScopeModal(page);

    const modal = page.getByTestId('export-scope-modal');

    await expect(modal.getByText('Visible results')).toBeVisible();
    await expect(modal.getByText('All matching assets')).toBeVisible();
  });

  test('All matching assets is selected by default', async ({ page }) => {
    await navigateToExplorePage(page);
    await openExportScopeModal(page);

    const allMatchingRadio = page
      .getByTestId('export-scope-modal')
      .locator('.ant-radio-wrapper-checked input[value="all"]');

    await expect(allMatchingRadio).toBeChecked();
  });

  test('Selecting Visible results checks the visible radio option', async ({
    page,
  }) => {
    await navigateToExplorePage(page);
    await openExportScopeModal(page);

    const modal = page.getByTestId('export-scope-modal');

    await modal.getByText('Visible results').click();

    const visibleRadio = modal.locator('input[value="visible"]');

    await expect(visibleRadio).toBeChecked();
  });

  test('All matching assets export calls streaming API with dataAsset index', async ({
    page,
  }) => {
    await navigateToExplorePage(page);
    await openExportScopeModal(page);

    const exportApiPromise = page.waitForRequest(
      (req) =>
        req.url().includes('/api/v1/search/export') && req.method() === 'GET'
    );

    const modal = page.getByTestId('export-scope-modal');

    await expect(modal.locator('input[value="all"]')).toBeChecked();
    await modal.getByRole('button', { name: 'Export' }).click();

    const request = await exportApiPromise;

    expect(request.url()).toContain('index=dataAsset');
  });

  test('Visible results export calls streaming API with current tab index and size', async ({
    page,
  }) => {
    await navigateToExplorePage(page);
    await openExportScopeModal(page);

    const exportApiPromise = page.waitForRequest(
      (req) =>
        req.url().includes('/api/v1/search/export') && req.method() === 'GET'
    );

    const modal = page.getByTestId('export-scope-modal');

    await modal.getByText('Visible results').click();
    await expect(modal.locator('input[value="visible"]')).toBeChecked();
    await modal.getByRole('button', { name: 'Export' }).click();

    const request = await exportApiPromise;
    const url = request.url();

    expect(url).toContain('index=');
    expect(url).not.toContain('index=dataAsset');
    expect(url).toContain('size=');
  });

  test('Export triggers CSV download', async ({ page }) => {
    test.slow();

    await page.route('**/api/v1/search/export?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/csv',
        headers: {
          'Content-Disposition': 'attachment; filename="search_export.csv"',
        },
        body: 'Entity Type,Service Name,Service Type,FQN,Name,Display Name,Description,Owners,Tags,Glossary Terms,Domains,Tier\ntable,mysql,Mysql,sample_data.ecommerce_db.shopify.dim_address,dim_address,dim_address,,,,,,',
      });
    });

    await navigateToExplorePage(page);
    await openExportScopeModal(page);

    const downloadPromise = page.waitForEvent('download');

    await page
      .getByTestId('export-scope-modal')
      .getByRole('button', { name: 'Export' })
      .click();

    const download = await downloadPromise;

    expect(download.suggestedFilename()).toContain('Search_Results_');
    expect(download.suggestedFilename()).toContain('.csv');
  });

  test('Export button in modal shows loading state during download', async ({
    page,
  }) => {
    test.slow();

    await page.route('**/api/v1/search/export?*', async (route) => {
      await new Promise<void>((resolve) => setTimeout(resolve, 1500));
      await route.fulfill({
        status: 200,
        contentType: 'text/csv',
        headers: {
          'Content-Disposition': 'attachment; filename="search_export.csv"',
        },
        body: 'Entity Type,Service Name\ntable,mysql',
      });
    });

    await navigateToExplorePage(page);
    await openExportScopeModal(page);

    const modal = page.getByTestId('export-scope-modal');
    const exportButton = modal.getByRole('button', { name: 'Export' });

    await exportButton.click();

    await expect(exportButton).toHaveClass(/ant-btn-loading/);
  });

  test('Cancel button closes the export scope modal', async ({ page }) => {
    await navigateToExplorePage(page);
    await openExportScopeModal(page);

    await page
      .getByTestId('export-scope-modal')
      .getByRole('button', { name: 'Cancel' })
      .click();

    await expect(page.getByTestId('export-scope-modal')).not.toBeVisible();
  });

  test('Modal closes after successful export', async ({ page }) => {
    test.slow();

    await page.route('**/api/v1/search/export?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/csv',
        body: 'Entity Type\ntable',
      });
    });

    await navigateToExplorePage(page);
    await openExportScopeModal(page);

    const downloadPromise = page.waitForEvent('download');

    await page
      .getByTestId('export-scope-modal')
      .getByRole('button', { name: 'Export' })
      .click();

    await downloadPromise;

    await expect(page.getByTestId('export-scope-modal')).not.toBeVisible();
  });
});
