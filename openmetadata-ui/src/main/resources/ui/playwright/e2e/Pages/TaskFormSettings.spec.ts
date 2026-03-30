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
/*
 *  Copyright 2026 Collate.
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

import test, { expect } from '@playwright/test';
import { AdminClass } from '../../support/user/AdminClass';
import { getApiContext, redirectToHomePage, toastNotification, uuid } from '../../utils/common';

const TASK_FORM_SETTINGS_ROUTE = '/settings/governance/task-forms';

test.use({ storageState: 'playwright/.auth/admin.json' });

test.describe.serial('Task Form Settings', () => {
  test('creates and updates a task form schema from settings', async ({ page }) => {
    const admin = new AdminClass();
    const schemaName = `PlaywrightTaskForm${uuid()}`;
    const taskType = `PlaywrightType${uuid()}`;
    const updatedDisplayName = `Playwright Display ${uuid()}`;
    let schemaId: string | undefined;

    try {
      await admin.login(page);
      await redirectToHomePage(page);

      const listResponse = page.waitForResponse(
        (response) =>
          response.url().includes('/api/v1/taskFormSchemas') &&
          response.request().method() === 'GET'
      );

      await page.goto(TASK_FORM_SETTINGS_ROUTE);
      await listResponse;

      await expect(page.getByTestId('task-form-settings-page')).toBeVisible();

      await page.getByTestId('task-form-add-button').click();
      await page.getByTestId('task-form-name-input').fill(schemaName);
      await page.getByTestId('task-form-type-input').fill(taskType);
      await page.getByTestId('task-form-category-input').fill('Custom');

      const createResponse = page.waitForResponse(
        (response) =>
          response.url().includes('/api/v1/taskFormSchemas') &&
          response.request().method() === 'POST' &&
          response.ok()
      );

      await page.getByTestId('task-form-save-button').click();

      const createdSchema = await (await createResponse).json();
      schemaId = createdSchema.id;

      await toastNotification(page, 'Task form saved successfully');
      await expect(page.getByTestId(`task-form-list-item-${schemaName}`)).toBeVisible();
      await expect(page.getByTestId('task-form-name-input')).toHaveValue(schemaName);

      const updateResponse = page.waitForResponse(
        (response) =>
          response.url().includes('/api/v1/taskFormSchemas') &&
          response.request().method() === 'PUT' &&
          response.ok()
      );

      await page.getByTestId('task-form-display-name-input').fill(updatedDisplayName);
      await page.getByTestId('task-form-save-button').click();
      await updateResponse;

      await toastNotification(page, 'Task form saved successfully');
      await expect(page.getByTestId('task-form-display-name-input')).toHaveValue(
        updatedDisplayName
      );

      const reloadResponse = page.waitForResponse(
        (response) =>
          response.url().includes('/api/v1/taskFormSchemas') &&
          response.request().method() === 'GET'
      );

      await page.reload();
      await reloadResponse;

      await page.getByTestId(`task-form-list-item-${schemaName}`).click();
      await expect(page.getByTestId('task-form-display-name-input')).toHaveValue(
        updatedDisplayName
      );
    } finally {
      if (schemaId) {
        const { apiContext, afterAction } = await getApiContext(page);

        try {
          await apiContext.delete(
            `/api/v1/taskFormSchemas/${schemaId}?hardDelete=true&recursive=true`
          );
        } finally {
          await afterAction();
        }
      }
    }
  });
});
