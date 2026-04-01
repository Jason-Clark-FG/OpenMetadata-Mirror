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
import {
  cleanupWebSocketMock,
  setupWebSocketMock,
} from '../../utils/websocket';
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

  test('Clicking Current Tab opens export modal with CSV option', async ({
    page,
  }) => {
    await navigateToExplorePage(page);

    await page.getByTestId('export-search-results-button').click();

    const dropdown = page.locator('.ant-dropdown:visible');
    await dropdown.getByText('Current Tab').click();

    const modal = page.locator('.ant-modal:visible');
    await expect(modal).toBeVisible();
    await expect(modal.getByText('CSV', { exact: true })).toBeVisible();

    await modal.getByRole('button', { name: /cancel/i }).click();
    await expect(modal).not.toBeVisible();
  });

  test('Clicking All Data Assets opens export modal with CSV option', async ({
    page,
  }) => {
    await navigateToExplorePage(page);

    await page.getByTestId('export-search-results-button').click();

    const dropdown = page.locator('.ant-dropdown:visible');
    await dropdown.getByText('All Data Assets').click();

    const modal = page.locator('.ant-modal:visible');
    await expect(modal).toBeVisible();
    await expect(modal.getByText('CSV', { exact: true })).toBeVisible();

    await modal.getByRole('button', { name: /cancel/i }).click();
    await expect(modal).not.toBeVisible();
  });

  test('Export modal has a pre-filled file name', async ({ page }) => {
    await navigateToExplorePage(page);

    await page.getByTestId('export-search-results-button').click();
    const dropdown = page.locator('.ant-dropdown:visible');
    await dropdown.getByText('Current Tab').click();

    const modal = page.locator('.ant-modal:visible');
    const fileNameInput = modal.locator('input[type="text"]').first();
    await expect(fileNameInput).not.toHaveValue('');

    await modal.getByRole('button', { name: /cancel/i }).click();
  });

  test('Current Tab export calls API with current tab index', async ({
    page,
  }) => {
    await navigateToExplorePage(page);

    const apiPromise = page.waitForRequest(
      (req) =>
        req.url().includes('/api/v1/search/exportAsync') &&
        req.method() === 'GET'
    );

    await page.getByTestId('export-search-results-button').click();
    const dropdown = page.locator('.ant-dropdown:visible');
    await dropdown.getByText('Current Tab').click();

    const modal = page.locator('.ant-modal:visible');
    await expect(modal).toBeVisible();

    // Click the export/submit button in the modal
    const exportBtn = modal.getByRole('button', { name: /csv/i });
    if (await exportBtn.isVisible()) {
      await exportBtn.click();
    }

    const request = await apiPromise;
    const url = request.url();
    expect(url).toContain('index=');
    expect(url).not.toContain('index=dataAsset');
  });

  test('All Data Assets export calls API with dataAsset index', async ({
    page,
  }) => {
    await navigateToExplorePage(page);

    const apiPromise = page.waitForRequest(
      (req) =>
        req.url().includes('/api/v1/search/exportAsync') &&
        req.method() === 'GET'
    );

    await page.getByTestId('export-search-results-button').click();
    const dropdown = page.locator('.ant-dropdown:visible');
    await dropdown.getByText('All Data Assets').click();

    const modal = page.locator('.ant-modal:visible');
    await expect(modal).toBeVisible();

    const exportBtn = modal.getByRole('button', { name: /csv/i });
    if (await exportBtn.isVisible()) {
      await exportBtn.click();
    }

    const request = await apiPromise;
    expect(request.url()).toContain('index=dataAsset');
  });

  test('Export triggers async job and shows progress via WebSocket', async ({
    page,
  }) => {
    await test.step('Setup WebSocket mock', async () => {
      await setupWebSocketMock(page);
    });

    await test.step('Navigate and trigger export', async () => {
      await navigateToExplorePage(page);

      // Intercept the API call to return a mock async response
      await page.route('**/api/v1/search/exportAsync*', async (route) => {
        await route.fulfill({
          status: 202,
          contentType: 'application/json',
          body: JSON.stringify({
            jobId: 'test-job-123',
            message: 'Export started',
          }),
        });
      });

      await page.getByTestId('export-search-results-button').click();
      const dropdown = page.locator('.ant-dropdown:visible');
      await dropdown.getByText('Current Tab').click();

      const modal = page.locator('.ant-modal:visible');
      await expect(modal).toBeVisible();

      const exportBtn = modal.getByRole('button', { name: /csv/i });
      if (await exportBtn.isVisible()) {
        await exportBtn.click();
      }
    });

    await test.step('Simulate WebSocket progress and verify UI updates', async () => {
      const { getWebSocketMock } = await import('../../utils/websocket');
      const wsMock = getWebSocketMock();
      const modal = page.locator('.ant-modal:visible');

      // Send progress event
      wsMock.emit('csvExportChannel', {
        jobId: 'test-job-123',
        status: 'IN_PROGRESS',
        progress: 50,
        total: 100,
        message: 'Exporting 50 of 100 items',
        data: '',
        error: null,
      });

      // Verify progress bar is shown in the modal
      await expect(modal.locator('.ant-progress')).toBeVisible();

      // Send completion event with CSV data
      wsMock.emit('csvExportChannel', {
        jobId: 'test-job-123',
        status: 'COMPLETED',
        data: 'Entity Type,Service Name\ntable,mysql',
        error: null,
        progress: 100,
        total: 100,
        message: 'Export completed',
      });

      // Verify success banner is shown after completion
      await expect(
        modal.locator('.message-banner-wrapper.success')
      ).toBeVisible();
    });

    cleanupWebSocketMock();
  });

  test('Dropdown closes after selecting an option', async ({ page }) => {
    await navigateToExplorePage(page);

    await page.getByTestId('export-search-results-button').click();

    const dropdown = page.locator('.ant-dropdown:visible');
    await expect(dropdown).toBeVisible();

    await dropdown.getByText('Current Tab').click();

    // Dropdown should close after selection
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
