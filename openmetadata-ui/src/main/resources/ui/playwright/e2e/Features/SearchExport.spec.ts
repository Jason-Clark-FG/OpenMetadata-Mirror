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

import { expect, test } from '@playwright/test';
import { redirectToHomePage } from '../../utils/common';

test.use({ storageState: 'playwright/.auth/admin.json' });

test.describe('Search Export', () => {
  test('Export button shows dropdown with Current Tab and All Data Assets options', async ({
    page,
  }) => {
    await redirectToHomePage(page);

    // Navigate to Explore page
    await page.getByTestId('app-bar-item-explore').click();
    await page.waitForSelector('[data-testid="explore-page"]');

    // Verify export button is present
    const exportButton = page.getByTestId('export-search-results-button');
    await expect(exportButton).toBeVisible();

    // Click export button to show dropdown
    await exportButton.click();

    // Verify dropdown menu items are displayed
    const dropdown = page.locator('.ant-dropdown');
    await expect(dropdown).toBeVisible();
    await expect(dropdown.getByText('Current Tab')).toBeVisible();
    await expect(dropdown.getByText('All Data Assets')).toBeVisible();

    // Click "Current Tab" to trigger export modal
    await dropdown.getByText('Current Tab').click();

    // Verify export modal is displayed
    const modal = page.locator('.ant-modal');
    await expect(modal).toBeVisible();

    // Verify CSV export option is available
    await expect(modal.getByText('CSV')).toBeVisible();

    // Close modal
    await modal.getByRole('button', { name: /cancel/i }).click();
    await expect(modal).not.toBeVisible();
  });
});
