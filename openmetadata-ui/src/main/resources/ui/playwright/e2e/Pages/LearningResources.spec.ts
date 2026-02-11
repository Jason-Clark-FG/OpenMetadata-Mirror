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
import { expect, Page, test } from '@playwright/test';
import { GlobalSettingOptions } from '../../constant/settings';
import { SidebarItem } from '../../constant/sidebar';
import { Glossary } from '../../support/glossary/Glossary';
import { LearningResourceClass } from '../../support/learning/LearningResourceClass';
import {
  createNewPage,
  getApiContext,
  redirectToHomePage,
  uuid,
} from '../../utils/common';
import { waitForAllLoadersToDisappear } from '../../utils/entity';
import { settingClick, sidebarClick } from '../../utils/sidebar';

test.use({ storageState: 'playwright/.auth/admin.json' });

const LEARNING_RESOURCES_LIST_URL = /\/api\/v1\/learning\/resources(?:\?|$)/;

function waitForLearningResourcesList(page: Page, timeout = 15000) {
  return page.waitForResponse(
    (r) =>
      r.request().method() === 'GET' &&
      LEARNING_RESOURCES_LIST_URL.test(r.url()),
    { timeout }
  );
}

async function confirmDeleteInModal(page: Page) {
  const confirmDialog = page.getByRole('dialog');
  await expect(confirmDialog).toBeVisible({ timeout: 5000 });
  const deleteButton = confirmDialog
    .getByRole('button')
    .filter({ hasText: /delete|ok/i });
  await expect(deleteButton).toBeVisible();
  await expect(deleteButton).toBeEnabled();
  await deleteButton.click();
  await expect(confirmDialog).not.toBeVisible({ timeout: 5000 });
}

async function goToLearningResourcesAdmin(page: Page) {
  await redirectToHomePage(page);
  await settingClick(page, GlobalSettingOptions.LEARNING_RESOURCES);
  await waitForAllLoadersToDisappear(page);
  await expect(page.getByTestId('learning-resources-page')).toBeVisible();
  await expect(page.getByTestId('learning-resources-table-body')).toBeVisible();
}

async function selectDropdownOption(page: Page, optionText: string) {
  const option = page
    .locator('.ant-select-dropdown:visible')
    .locator('.ant-select-item-option')
    .filter({ hasText: new RegExp(`^${optionText}$`, 'i') });

  await expect(option).toBeVisible({ timeout: 3000 });
  await option.click();
  await expect(page.locator('.ant-select-dropdown:visible')).not.toBeVisible({ timeout: 3000 });
}

async function scrollDrawerToShowResource(page: Page, resourceText: string) {
  const drawer = page.getByRole('complementary');
  await expect(drawer).toBeVisible();

  const targetElement = drawer.getByText(resourceText, { exact: false });
  await targetElement.scrollIntoViewIfNeeded();
  await expect(targetElement).toBeVisible();
}

async function searchResource(page: Page, searchText: string) {
  const searchInput = page.getByPlaceholder(/search.*resource/i);
  await expect(searchInput).toBeVisible();
  await searchInput.clear();
  await searchInput.fill(searchText);
  await waitForLearningResourcesList(page);
}

async function selectSearchDropdownFilter(
  page: Page,
  filterKey: 'type' | 'category' | 'context' | 'status',
  optionText: string
) {
  const trigger = page.getByTestId(filterKey).getByRole('button');
  await expect(trigger).toBeVisible();
  await expect(trigger).toBeEnabled();
  await trigger.click();

  const menu = page.locator('[data-testid="drop-down-menu"]');
  await expect(menu).toBeVisible({ timeout: 3000 });

  const menuItem = menu
    .locator('.ant-dropdown-menu-item, .ant-select-item')
    .filter({ hasText: optionText });
  await expect(menuItem).toBeVisible({ timeout: 3000 });
  await menuItem.click();

  const updateBtn = page.getByTestId('update-btn');
  await expect(updateBtn).toBeVisible();
  await expect(updateBtn).toBeEnabled();
  await updateBtn.click();
  await waitForLearningResourcesList(page);
}

test.describe(
  'Learning Resources Admin Page',
  { tag: ['@Features', '@Platform'] },
  () => {
    test.beforeEach(async ({ page }) => {
      await goToLearningResourcesAdmin(page);
    });

    test('should validate required fields', async ({ page }) => {
      await test.step('Open create resource drawer', async () => {
        await page.getByTestId('create-resource').click();
        const drawer = page.getByRole('complementary');
        await expect(drawer).toBeVisible();
      });

      await test.step('Attempt to save without required fields', async () => {
        await page.getByTestId('save-resource').click();
        const errorMessage = page.getByText(/name.*required|field.*required.*name/i);
        await expect(errorMessage).toBeVisible();
      });

      await test.step('Close drawer', async () => {
        const closeButton = page.getByRole('button', { name: /close/i });
        await closeButton.click();
        const drawer = page.getByRole('complementary');
        await expect(drawer).not.toBeVisible();
      });
    });

    test('should create new resource via UI and see it in table', async ({
      page,
    }) => {
      const uniqueId = uuid();
      const resourceName = `PW_Add_UI_${uniqueId}`;

      await test.step('Open add drawer and fill form', async () => {
        await page.getByTestId('create-resource').click();
        const drawer = page.getByRole('complementary');
        await expect(drawer).toBeVisible();

        const nameInput = drawer.getByPlaceholder(/enter.*name|name/i);
        await expect(nameInput).toBeVisible();
        await nameInput.fill(resourceName);

        const descriptionTextarea = drawer.getByRole('textbox', { name: /description/i });
        await expect(descriptionTextarea).toBeVisible();
        await descriptionTextarea.fill('Created via UI test');

        const typeSelector = page.getByTestId('resource-type-form-item').locator('.ant-select-selector');
        await expect(typeSelector).toBeVisible();
        await typeSelector.click();
        await selectDropdownOption(page, 'Video');

        const categorySelector = page.getByTestId('categories-form-item').locator('.ant-select-selector');
        await expect(categorySelector).toBeVisible();
        await categorySelector.click();
        await selectDropdownOption(page, 'Discovery');

        const contextSelector = page.getByTestId('contexts-form-item').locator('.ant-select-selector');
        await expect(contextSelector).toBeVisible();
        await contextSelector.click();
        await selectDropdownOption(page, 'Glossary');

        const statusSelector = drawer.locator('[name="status"]').locator('.ant-select-selector');
        await expect(statusSelector).toBeVisible();
        await statusSelector.click();
        await selectDropdownOption(page, 'Active');
      });

      await test.step('Save and wait for drawer to close', async () => {
        const createResponse = page.waitForResponse(
          (r) =>
            r.url().includes('/api/v1/learning/resources') &&
            r.request().method() === 'POST',
          { timeout: 10000 }
        );
        await page.getByTestId('save-resource').click();
        const response = await createResponse;
        expect([200, 201]).toContain(response.status());

        const drawer = page.getByRole('complementary');
        await expect(drawer).not.toBeVisible({ timeout: 5000 });
        await waitForAllLoadersToDisappear(page);
      });

      await test.step('Verify resource in table', async () => {
        await waitForLearningResourcesList(page);
        await searchResource(page, uniqueId);
        await expect(page.getByText(resourceName)).toBeVisible();
      });

      await test.step('Cleanup - delete the resource', async () => {
        const deleteResponse = page.waitForResponse(
          (r) =>
            r.url().includes('/api/v1/learning/resources') &&
            r.request().method() === 'DELETE',
          { timeout: 10000 }
        );
        await page.getByTestId(`delete-${resourceName}`).click();
        await confirmDeleteInModal(page);
        const response = await deleteResponse;
        expect([200, 204]).toContain(response.status());
        await waitForLearningResourcesList(page);
      });
    });

    test('should edit an existing learning resource', async ({ page }) => {
      const { apiContext, afterAction } = await getApiContext(page);
      const uniqueId = uuid();
      const resource = new LearningResourceClass({
        name: `PW_Edit_Resource_${uniqueId}`,
        displayName: `PW Edit Resource ${uniqueId}`,
        description: 'Resource to be edited',
      });

      await resource.create(apiContext);

      await test.step('Navigate to resource and open edit drawer', async () => {
        await page.reload();
        await waitForLearningResourcesList(page);
        await waitForAllLoadersToDisappear(page);

        await searchResource(page, uniqueId);
        await expect(page.getByText(resource.data.displayName ?? '')).toBeVisible();

        await page.getByTestId(`edit-${resource.data.name}`).click();
        const drawer = page.getByRole('complementary');
        await expect(drawer).toBeVisible();
      });

      await test.step('Verify form shows existing data', async () => {
        const drawer = page.getByRole('complementary');
        const nameInput = drawer.getByPlaceholder(/enter.*name|name/i);
        await expect(nameInput).toHaveValue(resource.data.name);

        const descriptionTextarea = drawer.getByRole('textbox', { name: /description/i });
        await expect(descriptionTextarea).toHaveValue(resource.data.description ?? '');
      });

      await test.step('Close drawer', async () => {
        const closeButton = page.getByRole('button', { name: /close/i });
        await closeButton.click();
        const drawer = page.getByRole('complementary');
        await expect(drawer).not.toBeVisible();
      });

      await resource.delete(apiContext);
      await afterAction();
    });

    test('should delete a learning resource', async ({ page }) => {
      const { apiContext, afterAction } = await getApiContext(page);
      const uniqueId = uuid();
      const resource = new LearningResourceClass({
        name: `PW_Delete_Resource_${uniqueId}`,
        displayName: `PW Delete Resource ${uniqueId}`,
      });

      await resource.create(apiContext);

      await test.step('Navigate to resource', async () => {
        await page.reload();
        await waitForLearningResourcesList(page);
        await waitForAllLoadersToDisappear(page);

        await searchResource(page, uniqueId);
        await expect(page.getByText(resource.data.displayName ?? '')).toBeVisible();
      });

      await test.step('Delete resource and verify API response', async () => {
        const deleteResponse = page.waitForResponse(
          (r) =>
            r.url().includes('/api/v1/learning/resources') &&
            r.request().method() === 'DELETE',
          { timeout: 10000 }
        );
        await page.getByTestId(`delete-${resource.data.name}`).click();
        await confirmDeleteInModal(page);
        const response = await deleteResponse;
        expect([200, 204]).toContain(response.status());
        await waitForLearningResourcesList(page);
      });

      await test.step('Verify resource is removed from list', async () => {
        await expect(page.getByText(resource.data.displayName ?? '')).not.toBeVisible();
      });

      await afterAction();
    });

    test('should preview a learning resource by clicking on name', async ({
      page,
    }) => {
      const { apiContext, afterAction } = await getApiContext(page);
      const uniqueId = uuid();
      const resource = new LearningResourceClass({
        name: `PW_Preview_Resource_${uniqueId}`,
        displayName: `PW Preview Resource ${uniqueId}`,
        source: {
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          provider: 'YouTube',
        },
      });

      await resource.create(apiContext);

      await test.step('Navigate to resource', async () => {
        await page.reload();
        await waitForLearningResourcesList(page);
        await waitForAllLoadersToDisappear(page);

        await searchResource(page, uniqueId);
        await expect(page.getByText(resource.data.displayName ?? '')).toBeVisible();
      });

      await test.step('Open preview and verify resource data in modal', async () => {
        await page.getByText(resource.data.displayName ?? '').click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible({ timeout: 5000 });
        await expect(dialog.getByText(resource.data.displayName ?? '')).toBeVisible();
      });

      await test.step('Close preview modal', async () => {
        await page.getByTestId('close-resource-player').click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).not.toBeVisible({ timeout: 3000 });
      });

      await resource.delete(apiContext);
      await afterAction();
    });

    test('should search resources by name', async ({ page }) => {
      const { apiContext, afterAction } = await getApiContext(page);
      const uniqueId = uuid();
      const resource = new LearningResourceClass({
        name: `PW_Search_Resource_${uniqueId}`,
        displayName: `PW Search Resource ${uniqueId}`,
      });

      await resource.create(apiContext);

      await test.step('Reload page and search for resource', async () => {
        await page.reload();
        await waitForLearningResourcesList(page);
        await waitForAllLoadersToDisappear(page);

        await searchResource(page, uniqueId);
        await expect(page.getByText(`PW Search Resource ${uniqueId}`)).toBeVisible();
      });

      await resource.delete(apiContext);
      await afterAction();
    });
  }
);

test.describe(
  'Learning Resources Admin Page - Filters and CRUD',
  { tag: ['@Features', '@Platform'] },
  () => {
    test.beforeEach(async ({ page }) => {
      await goToLearningResourcesAdmin(page);
    });

    test('should filter resources by type', async ({ page }) => {
      const { apiContext, afterAction } = await getApiContext(page);
      const uniqueId = uuid();
      const resource = new LearningResourceClass({
        name: `PW_Type_Resource_${uniqueId}`,
        displayName: `PW Type Resource ${uniqueId}`,
        resourceType: 'Video',
      });

      await resource.create(apiContext);

      await test.step('Reload page', async () => {
        await page.reload();
        await waitForLearningResourcesList(page);
        await waitForAllLoadersToDisappear(page);
      });

      await test.step('Apply type filter and verify resource appears', async () => {
        await selectSearchDropdownFilter(page, 'type', 'Video');
        await searchResource(page, uniqueId);
        await expect(page.getByText(`PW Type Resource ${uniqueId}`)).toBeVisible();
      });

      await resource.delete(apiContext);
      await afterAction();
    });

    test('should filter resources by category', async ({ page }) => {
      const { apiContext, afterAction } = await getApiContext(page);
      const uniqueId = uuid();
      const resource = new LearningResourceClass({
        name: `PW_Category_Resource_${uniqueId}`,
        displayName: `PW Category Resource ${uniqueId}`,
        categories: ['DataGovernance'],
      });

      await resource.create(apiContext);

      await test.step('Reload page', async () => {
        await page.reload();
        await waitForLearningResourcesList(page);
        await waitForAllLoadersToDisappear(page);
      });

      await test.step('Apply category filter and verify resource appears', async () => {
        await selectSearchDropdownFilter(page, 'category', 'Governance');
        await searchResource(page, uniqueId);
        await expect(page.getByText(`PW Category Resource ${uniqueId}`)).toBeVisible();
      });

      await resource.delete(apiContext);
      await afterAction();
    });

    test('should filter resources by context', async ({ page }) => {
      const { apiContext, afterAction } = await getApiContext(page);
      const uniqueId = uuid();
      const resource = new LearningResourceClass({
        name: `PW_Context_Resource_${uniqueId}`,
        displayName: `PW Context Resource ${uniqueId}`,
        contexts: [{ pageId: 'glossary' }],
      });

      await resource.create(apiContext);

      await test.step('Reload page', async () => {
        await page.reload();
        await waitForLearningResourcesList(page);
        await waitForAllLoadersToDisappear(page);
      });

      await test.step('Apply context filter and verify resource appears', async () => {
        await selectSearchDropdownFilter(page, 'context', 'Glossary');
        await searchResource(page, uniqueId);
        await expect(page.getByText(`PW Context Resource ${uniqueId}`)).toBeVisible();
      });

      await resource.delete(apiContext);
      await afterAction();
    });

    test('should filter resources by status', async ({ page }) => {
      const { apiContext, afterAction } = await getApiContext(page);
      const uniqueId = uuid();
      const resource = new LearningResourceClass({
        name: `PW_Status_Resource_${uniqueId}`,
        displayName: `PW Status Resource ${uniqueId}`,
        status: 'Draft',
      });

      await resource.create(apiContext);

      await test.step('Reload page', async () => {
        await page.reload();
        await waitForLearningResourcesList(page);
        await waitForAllLoadersToDisappear(page);
      });

      await test.step('Apply status filter and verify resource appears', async () => {
        await selectSearchDropdownFilter(page, 'status', 'Draft');
        await searchResource(page, uniqueId);
        await expect(page.getByText(`PW Status Resource ${uniqueId}`)).toBeVisible();
      });

      await resource.delete(apiContext);
      await afterAction();
    });

    test('should edit and save resource changes via UI', async ({ page }) => {
      test.slow();

      const { apiContext, afterAction } = await getApiContext(page);
      const uniqueId = uuid();
      const resource = new LearningResourceClass({
        name: `PW_Edit_Save_Resource_${uniqueId}`,
        displayName: `PW Edit Save Resource ${uniqueId}`,
        description: 'Original description',
      });

      await resource.create(apiContext);

      await test.step('Navigate to resource', async () => {
        await page.reload();
        await waitForLearningResourcesList(page);
        await waitForAllLoadersToDisappear(page);

        await searchResource(page, uniqueId);
        await expect(page.getByText(resource.data.displayName ?? '')).toBeVisible();
      });

      await test.step('Open edit drawer and modify description', async () => {
        await page.getByTestId(`edit-${resource.data.name}`).click();
        const drawer = page.getByRole('complementary');
        await expect(drawer).toBeVisible();

        const descriptionField = drawer.getByRole('textbox', { name: /description/i });
        await expect(descriptionField).toBeVisible();
        await descriptionField.fill(`Updated description ${uniqueId}`);
      });

      await test.step('Save changes and verify API response', async () => {
        const updateResponse = page.waitForResponse(
          (r) =>
            r.url().includes('/api/v1/learning/resources') &&
            (r.request().method() === 'PUT' || r.request().method() === 'PATCH'),
          { timeout: 10000 }
        );
        await page.getByTestId('save-resource').click();
        const response = await updateResponse;
        expect(response.status()).toBe(200);

        const drawer = page.getByRole('complementary');
        await expect(drawer).not.toBeVisible({ timeout: 5000 });
        await waitForAllLoadersToDisappear(page);
      });

      await test.step('Verify resource still in list after edit', async () => {
        await page.reload();
        await waitForLearningResourcesList(page);
        await waitForAllLoadersToDisappear(page);
        await searchResource(page, uniqueId);
        await expect(
          page.getByTestId('learning-resources-table-body').getByText(new RegExp(uniqueId))
        ).toBeVisible();
      });

      await resource.delete(apiContext);
      await afterAction();
    });
  }
);

test.describe(
  'Learning Icon on Pages',
  { tag: ['@Features', '@Platform'] },
  () => {
    const glossaryForLearningTests = new Glossary(
      `PW_Learning_Glossary_${uuid()}`,
      []
    );

    test.beforeAll(async ({ browser }) => {
      const { apiContext, afterAction } = await createNewPage(browser);
      await glossaryForLearningTests.create(apiContext);
      await afterAction();
    });

    test.afterAll(async ({ browser }) => {
      const { apiContext, afterAction } = await createNewPage(browser);
      await glossaryForLearningTests.delete(apiContext);
      await afterAction();
    });

    test('should NOT show draft resources on target pages', async ({ page }) => {
      await redirectToHomePage(page);

      const { apiContext, afterAction } = await getApiContext(page);
      const uniqueId = uuid();
      const draftResource = new LearningResourceClass({
        name: `PW_Draft_Resource_${uniqueId}`,
        displayName: `PW Draft Resource ${uniqueId}`,
        contexts: [{ pageId: 'glossary' }],
        status: 'Draft',
      });

      await draftResource.create(apiContext);

      await test.step('Navigate to glossary page', async () => {
        await sidebarClick(page, SidebarItem.GLOSSARY);
        await waitForAllLoadersToDisappear(page);
      });

      await test.step('Verify draft resource not shown in learning drawer', async () => {
        const learningIcon = page.getByTestId('learning-icon');
        const isIconVisible = await learningIcon.isVisible().catch(() => false);

        if (isIconVisible) {
          await learningIcon.click();
          const drawer = page.getByRole('complementary');
          await expect(drawer).toBeVisible();
          await expect(
            drawer.getByText(`PW Draft Resource ${uniqueId}`)
          ).not.toBeVisible();
          await page.keyboard.press('Escape');
        }
      });

      await draftResource.delete(apiContext);
      await afterAction();
    });

    test('should show correct learning resource in drawer on lineage page', async ({
      page,
    }) => {
      test.slow();
      await redirectToHomePage(page);

      const { apiContext, afterAction } = await getApiContext(page);
      const displayName = 'PW Lineage Resource';
      const resource = new LearningResourceClass({
        name: `PW_Lineage_Resource_${uuid()}`,
        displayName,
        contexts: [{ pageId: 'lineage' }],
        status: 'Active',
      });

      await resource.create(apiContext);

      await test.step('Navigate to lineage page', async () => {
        const lineageRes = page.waitForResponse(
          '/api/v1/lineage/getPlatformLineage?view=service*'
        );
        await sidebarClick(page, SidebarItem.LINEAGE);
        await lineageRes;
        await waitForAllLoadersToDisappear(page);
      });

      await test.step('Open learning drawer and verify resource', async () => {
        const learningIcon = page.getByTestId('learning-icon');
        await expect(learningIcon).toBeVisible({ timeout: 10000 });
        await learningIcon.scrollIntoViewIfNeeded();
        await learningIcon.click();

        const drawer = page.getByRole('complementary');
        await expect(drawer).toBeVisible();
        await scrollDrawerToShowResource(page, displayName);
        await expect(drawer.getByText(displayName)).toBeVisible();
      });

      await test.step('Close drawer', async () => {
        await page.keyboard.press('Escape');
      });

      await resource.delete(apiContext);
      await afterAction();
    });

    test('should open resource player when clicking on resource card in drawer', async ({
      page,
    }) => {
      await redirectToHomePage(page);

      const { apiContext, afterAction } = await getApiContext(page);
      const uniqueId = uuid();
      const resource = new LearningResourceClass({
        name: `PW_Player_Resource_${uniqueId}`,
        displayName: `PW Player Resource ${uniqueId}`,
        contexts: [{ pageId: 'glossary' }],
        status: 'Active',
        source: {
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          provider: 'YouTube',
        },
      });

      await resource.create(apiContext);

      await test.step('Navigate to glossary page', async () => {
        await sidebarClick(page, SidebarItem.GLOSSARY);
        await waitForAllLoadersToDisappear(page);
      });

      await test.step('Open learning drawer', async () => {
        const learningIcon = page.getByTestId('learning-icon');
        await expect(learningIcon).toBeVisible({ timeout: 10000 });
        await learningIcon.click();

        const drawer = page.getByRole('complementary');
        await expect(drawer).toBeVisible();
        await scrollDrawerToShowResource(page, `PW Player Resource ${uniqueId}`);
      });

      await test.step('Click resource card and verify player opens', async () => {
        const resourceCard = page.getByTestId(
          `learning-resource-card-PW_Player_Resource_${uniqueId}`
        );
        await expect(resourceCard).toBeVisible();
        await resourceCard.click();

        const playerDialog = page.getByRole('dialog');
        await expect(playerDialog).toBeVisible({ timeout: 5000 });
        await expect(
          playerDialog.getByText(`PW Player Resource ${uniqueId}`)
        ).toBeVisible();
      });

      await test.step('Close player and drawer', async () => {
        await page.getByTestId('close-resource-player').click();
        const playerDialog = page.getByRole('dialog');
        await expect(playerDialog).not.toBeVisible({ timeout: 3000 });
        await page.keyboard.press('Escape');
      });

      await resource.delete(apiContext);
      await afterAction();
    });
  }
);

test.describe.serial(
  'Learning Resources E2E Flow',
  { tag: ['@Flow', '@Platform'] },
  () => {
    test('should create resource via UI and verify learning icon appears on target page', async ({
      page,
    }) => {
      test.slow();
      const uniqueId = uuid();
      const resourceName = `PW_Create_E2E_${uniqueId}`;

      await test.step('Navigate to Learning Resources admin page', async () => {
        await goToLearningResourcesAdmin(page);
      });

      await test.step('Open add resource drawer and fill form', async () => {
        await page.getByTestId('create-resource').click();
        const drawer = page.getByRole('complementary');
        await expect(drawer).toBeVisible();

        const nameInput = drawer.getByPlaceholder(/enter.*name|name/i);
        await expect(nameInput).toBeVisible();
        await nameInput.fill(resourceName);

        const descriptionTextarea = drawer.getByRole('textbox', { name: /description/i });
        await expect(descriptionTextarea).toBeVisible();
        await descriptionTextarea.fill('E2E test learning resource');

        const typeSelector = page.getByTestId('resource-type-form-item').locator('.ant-select-selector');
        await expect(typeSelector).toBeVisible();
        await typeSelector.click();
        await selectDropdownOption(page, 'Video');

        const categorySelector = page.getByTestId('categories-form-item').locator('.ant-select-selector');
        await expect(categorySelector).toBeVisible();
        await categorySelector.click();
        await selectDropdownOption(page, 'Discovery');

        const contextSelector = page.getByTestId('contexts-form-item').locator('.ant-select-selector');
        await expect(contextSelector).toBeVisible();
        await contextSelector.click();
        await page
          .locator('.ant-select-dropdown:visible')
          .getByTitle('Glossary', { exact: true })
          .click();
        await expect(page.locator('.ant-select-dropdown:visible')).not.toBeVisible();

        const urlInput = drawer.getByPlaceholder(/youtube\.com/);
        await expect(urlInput).toBeVisible();
        await urlInput.fill('https://www.youtube.com/watch?v=test123');

        const statusSelector = drawer.locator('[name="status"]').locator('.ant-select-selector');
        await expect(statusSelector).toBeVisible();
        await statusSelector.click();
        await selectDropdownOption(page, 'Active');
      });

      await test.step('Save the resource and verify API response', async () => {
        const createResponse = page.waitForResponse(
          (r) =>
            r.url().includes('/api/v1/learning/resources') &&
            r.request().method() === 'POST',
          { timeout: 10000 }
        );
        await page.getByTestId('save-resource').click();
        const response = await createResponse;
        expect([200, 201]).toContain(response.status());

        const drawer = page.getByRole('complementary');
        await expect(drawer).not.toBeVisible({ timeout: 5000 });
        await waitForAllLoadersToDisappear(page);
      });

      await test.step('Navigate to Glossary and verify resource in learning drawer', async () => {
        await sidebarClick(page, SidebarItem.GLOSSARY);
        await waitForAllLoadersToDisappear(page);

        const learningIcon = page.getByTestId('learning-icon');
        await expect(learningIcon).toBeVisible({ timeout: 10000 });
        await learningIcon.click();

        const drawer = page.getByRole('complementary');
        await expect(drawer).toBeVisible();
        await scrollDrawerToShowResource(page, resourceName);
        await expect(drawer.getByText(resourceName)).toBeVisible();
        await page.keyboard.press('Escape');
      });

      await test.step('Cleanup - delete the created resource', async () => {
        await goToLearningResourcesAdmin(page);
        await searchResource(page, uniqueId);
        await expect(page.getByText(resourceName)).toBeVisible();

        const deleteResponse = page.waitForResponse(
          (r) =>
            r.url().includes('/api/v1/learning/resources') &&
            r.request().method() === 'DELETE',
          { timeout: 10000 }
        );
        await page.getByTestId(`delete-${resourceName}`).click();
        await confirmDeleteInModal(page);
        const response = await deleteResponse;
        expect([200, 204]).toContain(response.status());
      });
    });

    test('should update resource context and verify learning icon moves to new page', async ({
      page,
    }) => {
      test.slow();
      await redirectToHomePage(page);

      const { apiContext, afterAction } = await getApiContext(page);
      const uniqueId = uuid();
      const resource = new LearningResourceClass({
        name: `PW_Update_Context_${uniqueId}`,
        displayName: `Update Context Resource ${uniqueId}`,
        contexts: [{ pageId: 'glossary' }],
        status: 'Active',
      });

      const createdResource = await resource.create(apiContext);
      expect(createdResource).toBeDefined();
      expect(createdResource.id).toBeDefined();
      expect(createdResource.displayName).toBe(`Update Context Resource ${uniqueId}`);

      await test.step('Verify resource appears on Glossary page initially', async () => {
        await sidebarClick(page, SidebarItem.GLOSSARY);
        await waitForAllLoadersToDisappear(page);

        const learningIcon = page.getByTestId('learning-icon');
        await expect(learningIcon).toBeVisible({ timeout: 10000 });

        await learningIcon.click();
        const drawer = page.getByRole('complementary');
        await expect(drawer).toBeVisible();
        await scrollDrawerToShowResource(page, `Update Context Resource ${uniqueId}`);
        await expect(
          drawer.getByText(`Update Context Resource ${uniqueId}`)
        ).toBeVisible();
        await page.keyboard.press('Escape');
      });

      await test.step('Navigate to admin page and update resource context to Lineage', async () => {
        await goToLearningResourcesAdmin(page);

        await searchResource(page, uniqueId);
        await expect(page.getByText(`Update Context Resource ${uniqueId}`)).toBeVisible();

        await page.getByTestId(`edit-${resource.data.name}`).click();
        const drawer = page.getByRole('complementary');
        await expect(drawer).toBeVisible();

        const contextsFormItem = page.getByTestId('contexts-form-item');
        const contextSelector = contextsFormItem.locator('.ant-select-selector');
        await expect(contextSelector).toBeVisible();
        await contextSelector.click();

        await page
          .locator('.ant-select-dropdown:visible')
          .getByTitle('Glossary', { exact: true })
          .click();

        await contextSelector.click();
        const searchInput = contextsFormItem.locator('.ant-select-selection-search-input');
        await searchInput.fill('lineage');

        const lineageOption = page
          .locator('.ant-select-dropdown:visible')
          .getByTitle(/lineage/i);
        await expect(lineageOption).toBeVisible();
        await lineageOption.click();
        await expect(page.locator('.ant-select-dropdown:visible')).not.toBeVisible();

        const updateResponse = page.waitForResponse(
          (r) =>
            r.url().includes('/api/v1/learning/resources') &&
            (r.request().method() === 'PUT' || r.request().method() === 'PATCH'),
          { timeout: 10000 }
        );
        await page.getByTestId('save-resource').click();
        const response = await updateResponse;
        expect(response.status()).toBe(200);
        await expect(drawer).not.toBeVisible({ timeout: 5000 });
        await waitForAllLoadersToDisappear(page);
      });

      await test.step('Verify learning icon no longer appears on Glossary page', async () => {
        await sidebarClick(page, SidebarItem.GLOSSARY);
        await waitForAllLoadersToDisappear(page);

        const learningIcon = page.getByTestId('learning-icon');
        const isIconVisible = await learningIcon.isVisible().catch(() => false);

        if (isIconVisible) {
          await learningIcon.click();
          const drawer = page.getByRole('complementary');
          await expect(drawer).toBeVisible();
          await expect(
            drawer.getByText(`Update Context Resource ${uniqueId}`)
          ).not.toBeVisible();
          await page.keyboard.press('Escape');
        }
      });

      await test.step('Verify learning icon now appears on Lineage page', async () => {
        const lineageRes = page.waitForResponse(
          '/api/v1/lineage/getPlatformLineage?view=service*'
        );
        await sidebarClick(page, SidebarItem.LINEAGE);
        await lineageRes;
        await waitForAllLoadersToDisappear(page);

        const learningIcon = page.getByTestId('learning-icon');
        await expect(learningIcon).toBeVisible({ timeout: 10000 });

        await learningIcon.scrollIntoViewIfNeeded();
        await learningIcon.click();
        const drawer = page.getByRole('complementary');
        await expect(drawer).toBeVisible();

        const resourceCard = page.getByTestId(
          `learning-resource-card-PW_Update_Context_${uniqueId}`
        );
        await scrollDrawerToShowResource(page, resource.data.name);
        await expect(resourceCard).toBeVisible();
        await page.keyboard.press('Escape');
      });

      await resource.delete(apiContext);
      await afterAction();
    });

    test('should delete resource and verify learning icon disappears from target page', async ({
      page,
    }) => {
      await redirectToHomePage(page);

      const { apiContext, afterAction } = await getApiContext(page);
      const uniqueId = uuid();
      const resource = new LearningResourceClass({
        name: `PW_Delete_E2E_${uniqueId}`,
        displayName: `Delete E2E Resource ${uniqueId}`,
        contexts: [{ pageId: 'glossary' }],
        status: 'Active',
      });

      const createdResource = await resource.create(apiContext);
      expect(createdResource.id).toBeDefined();
      expect(createdResource.displayName).toBe(`Delete E2E Resource ${uniqueId}`);

      await test.step('Verify resource appears on Glossary page initially', async () => {
        await sidebarClick(page, SidebarItem.GLOSSARY);
        await waitForAllLoadersToDisappear(page);

        const learningIcon = page.getByTestId('learning-icon');
        await expect(learningIcon).toBeVisible({ timeout: 10000 });

        await learningIcon.click();
        const drawer = page.getByRole('complementary');
        await expect(drawer).toBeVisible();
        await scrollDrawerToShowResource(page, `Delete E2E Resource ${uniqueId}`);
        await expect(
          drawer.getByText(`Delete E2E Resource ${uniqueId}`)
        ).toBeVisible();
        await page.keyboard.press('Escape');
      });

      await test.step('Navigate to admin page and delete the resource', async () => {
        await goToLearningResourcesAdmin(page);

        await searchResource(page, uniqueId);
        await expect(page.getByText(`Delete E2E Resource ${uniqueId}`)).toBeVisible();

        const deleteResponse = page.waitForResponse(
          (r) =>
            r.url().includes('/api/v1/learning/resources') &&
            r.request().method() === 'DELETE',
          { timeout: 10000 }
        );
        await page.getByTestId(`delete-${resource.data.name}`).click();
        await confirmDeleteInModal(page);
        const response = await deleteResponse;
        expect([200, 204]).toContain(response.status());
      });

      await test.step('Verify learning icon no longer shows deleted resource on Glossary page', async () => {
        await sidebarClick(page, SidebarItem.GLOSSARY);
        await waitForAllLoadersToDisappear(page);

        const learningIcon = page.getByTestId('learning-icon');
        const isIconVisible = await learningIcon.isVisible().catch(() => false);

        if (isIconVisible) {
          await learningIcon.click();
          const drawer = page.getByRole('complementary');
          await expect(drawer).toBeVisible();
          await expect(
            drawer.getByText(`Delete E2E Resource ${uniqueId}`)
          ).not.toBeVisible();
          await page.keyboard.press('Escape');
        }
      });

      await afterAction();
    });
  }
);
