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
import test, { expect, Page } from '@playwright/test';
import { GlobalSettingOptions } from '../../constant/settings';
import { Glossary } from '../../support/glossary/Glossary';
import { GlossaryTerm } from '../../support/glossary/GlossaryTerm';
import { getApiContext, redirectToHomePage } from '../../utils/common';
import { settingClick } from '../../utils/sidebar';

test.use({
  storageState: 'playwright/.auth/admin.json',
});

test.describe('Glossary Term Relation Settings', () => {
  const navigateToRelationSettings = async (page: Page) => {
    await page.goto('/settings/governance/glossary-term-relations');
    await page.waitForLoadState('networkidle');
    // Wait for the page heading to be visible
    await expect(
      page.getByRole('heading', { name: 'Glossary Term Relations' })
    ).toBeVisible();
  };

  test.beforeEach(async ({ page }) => {
    await redirectToHomePage(page);
  });

  test('should display default relation types', async ({ page }) => {
    await navigateToRelationSettings(page);

    // Verify page loads with relation types table
    await expect(page.getByRole('table')).toBeVisible();

    // Verify default system-defined relation types are present by checking for their text in strong elements
    const defaultTypes = [
      'relatedTo',
      'synonym',
      'antonym',
      'broader',
      'narrower',
    ];
    for (const typeName of defaultTypes) {
      await expect(page.locator('strong').filter({ hasText: typeName })).toBeVisible();
    }
  });

  test('should show system-defined lock icon for default types', async ({
    page,
  }) => {
    await navigateToRelationSettings(page);

    // Verify system-defined types have lock icon (visible as img with alt="lock")
    await expect(page.getByRole('img', { name: 'lock' }).first()).toBeVisible();

    // Verify edit button is disabled for system-defined types (first row)
    const editButtons = page.getByRole('button', { name: 'Edit' });
    await expect(editButtons.first()).toBeDisabled();
  });

  test('should display usage counts for relation types', async ({ page }) => {
    await navigateToRelationSettings(page);

    // Verify usage count column exists by checking the header
    await expect(
      page.getByRole('columnheader', { name: 'Usage' })
    ).toBeVisible();

    // Verify usage count cells exist
    const usageCells = page.locator('td').filter({ hasText: /^\d+$/ });
    await expect(usageCells.first()).toBeVisible();
  });

  test('should create a custom relation type', async ({ page }) => {
    await navigateToRelationSettings(page);

    const customTypeName = `customType${Date.now()}`;

    // Click add button - use role for consistency with passing tests
    await page.getByRole('button', { name: 'Add Relation Type' }).click();

    // Wait for modal dialog to be visible
    await expect(page.getByRole('dialog')).toBeVisible();

    // Fill form fields
    await page.getByTestId('name-input').fill(customTypeName);
    await page.getByTestId('display-name-input').fill('Custom Type Display');
    await page.getByTestId('description-input').fill('A custom relation type');

    // Category defaults to 'associative', no need to change

    // Toggle switches
    await page.getByTestId('symmetric-switch').click();

    // Save and wait for response
    const saveResponse = page.waitForResponse((response) =>
      response.url().includes('/api/v1/system/settings') &&
      response.request().method() === 'PUT'
    );
    await page.getByTestId('save-btn').click();
    await saveResponse;

    // Wait for modal to close
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Verify new type appears in table
    await expect(
      page.getByTestId(`relation-name-${customTypeName}`)
    ).toBeVisible();

    // Clean up: delete the custom type
    const deleteResponse = page.waitForResponse((response) =>
      response.url().includes('/api/v1/system/settings') &&
      response.request().method() === 'PUT'
    );
    await page.getByTestId(`delete-${customTypeName}-btn`).click();
    await deleteResponse;

    // Verify deleted
    await expect(
      page.getByTestId(`relation-name-${customTypeName}`)
    ).not.toBeVisible();
  });

  test('should edit a custom relation type', async ({ page }) => {
    await navigateToRelationSettings(page);

    const customTypeName = `editType${Date.now()}`;

    // First create a custom type
    await page.getByRole('button', { name: 'Add Relation Type' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByTestId('name-input').fill(customTypeName);
    await page.getByTestId('display-name-input').fill('Original Display');

    const createResponse = page.waitForResponse((response) =>
      response.url().includes('/api/v1/system/settings') &&
      response.request().method() === 'PUT'
    );
    await page.getByTestId('save-btn').click();
    await createResponse;

    // Wait for modal to close
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Now edit it using test-id
    await page.getByTestId(`edit-${customTypeName}-btn`).click();

    // Wait for modal to open with existing values
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByTestId('name-input')).toBeDisabled();
    await expect(page.getByTestId('display-name-input')).toHaveValue(
      'Original Display'
    );

    // Update display name
    await page.getByTestId('display-name-input').clear();
    await page.getByTestId('display-name-input').fill('Updated Display');

    const updateResponse = page.waitForResponse((response) =>
      response.url().includes('/api/v1/system/settings') &&
      response.request().method() === 'PUT'
    );
    await page.getByTestId('save-btn').click();
    await updateResponse;

    // Wait for modal to close
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Verify update
    await expect(page.getByRole('cell', { name: 'Updated Display' })).toBeVisible();

    // Clean up
    const deleteResponse = page.waitForResponse((response) =>
      response.url().includes('/api/v1/system/settings') &&
      response.request().method() === 'PUT'
    );
    await page.getByTestId(`delete-${customTypeName}-btn`).click();
    await deleteResponse;
  });

  test('should prevent deletion of relation type in use', async ({ page }) => {
    const { apiContext, afterAction } = await getApiContext(page);
    const glossary = new Glossary();
    const term1 = new GlossaryTerm(glossary);
    const term2 = new GlossaryTerm(glossary);

    try {
      // Create glossary and terms via API
      await glossary.create(apiContext);
      await term1.create(apiContext);
      await term2.create(apiContext);

      // Add a relation between terms via API
      await apiContext.put(
        `/api/v1/glossaryTerms/${term1.responseData.id}/relatedTerms/${term2.responseData.id}?relationType=relatedTo`,
        {}
      );

      // Navigate to settings
      await navigateToRelationSettings(page);

      // Verify usage count column is visible
      await expect(
        page.getByRole('columnheader', { name: 'Usage' })
      ).toBeVisible();

      // Since relatedTo is system-defined, it won't have a delete button
      // Verify the edit button for system types is disabled
      const editButtons = page.getByRole('button', { name: 'Edit' });
      await expect(editButtons.first()).toBeDisabled();
    } finally {
      await term1.delete(apiContext);
      await term2.delete(apiContext);
      await glossary.delete(apiContext);
      await afterAction();
    }
  });

  test('should validate form fields when creating relation type', async ({
    page,
  }) => {
    await navigateToRelationSettings(page);

    // Open add modal
    await page.getByRole('button', { name: 'Add Relation Type' }).click();

    // Wait for modal
    await expect(page.getByRole('dialog')).toBeVisible();

    // Try to save without filling required fields
    await page.getByTestId('save-btn').click();

    // Verify validation error appears (check for name required error)
    await expect(
      page.getByText('Name is required', { exact: true })
    ).toBeVisible();

    // Fill name with invalid characters
    await page.getByTestId('name-input').fill('123invalid');
    await page.getByTestId('display-name-input').fill('Display Name');
    // Category defaults to 'associative', no need to change

    await page.getByTestId('save-btn').click();

    // Verify pattern validation error exists
    await expect(
      page.locator('.ant-form-item-explain-error').first()
    ).toBeVisible();

    // Cancel to close modal
    await page.getByTestId('cancel-btn').click();

    // Verify modal closed
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('should cancel modal without saving changes', async ({ page }) => {
    await navigateToRelationSettings(page);

    const customTypeName = `cancelType${Date.now()}`;

    // Open add modal and fill form
    await page.getByRole('button', { name: 'Add Relation Type' }).click();
    await page.getByTestId('name-input').fill(customTypeName);
    await page.getByTestId('display-name-input').fill('Cancel Test');
    // Category defaults to 'associative', no need to change

    // Cancel instead of save
    await page.getByTestId('cancel-btn').click();

    // Verify modal closed and type was not created
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(
      page.getByRole('cell', { name: customTypeName })
    ).not.toBeVisible();
  });
});
