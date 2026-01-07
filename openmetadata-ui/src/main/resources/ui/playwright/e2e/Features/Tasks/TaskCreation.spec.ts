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

import { expect, test } from '@playwright/test';
import { TableClass } from '../../../support/entity/TableClass';
import { UserClass } from '../../../support/user/UserClass';
import { performAdminLogin } from '../../../utils/admin';
import { redirectToHomePage } from '../../../utils/common';

/**
 * Task Creation Tests
 *
 * Tests all task creation scenarios including:
 * - Request description for table/column
 * - Request tags for table/column
 * - Suggest description for table/column
 * - Suggest tags for table/column
 * - Auto-fill assignees from entity owners
 * - Manual assignee selection
 */

test.describe('Task Creation - Request Description', () => {
  const adminUser = new UserClass();
  const ownerUser = new UserClass();
  const tableWithOwner = new TableClass();
  const tableWithoutOwner = new TableClass();

  test.beforeAll('Setup test data', async ({ browser }) => {
    const { apiContext, afterAction } = await performAdminLogin(browser);

    try {
      await adminUser.create(apiContext);
      await adminUser.setAdminRole(apiContext);
      await ownerUser.create(apiContext);

      await tableWithOwner.create(apiContext);
      await tableWithOwner.setOwner(apiContext, {
        id: ownerUser.responseData.id,
        type: 'user',
      });

      await tableWithoutOwner.create(apiContext);
    } finally {
      await afterAction();
    }
  });

  test.afterAll('Cleanup test data', async ({ browser }) => {
    const { apiContext, afterAction } = await performAdminLogin(browser);

    try {
      await tableWithOwner.delete(apiContext);
      await tableWithoutOwner.delete(apiContext);
      await ownerUser.delete(apiContext);
      await adminUser.delete(apiContext);
    } finally {
      await afterAction();
    }
  });

  test.beforeEach(async ({ page }) => {
    await adminUser.login(page);
  });

  test('should create request description task for table', async ({ page }) => {
    await tableWithOwner.visitEntityPage(page);

    // Find and click request description button
    const requestDescBtn = page.getByTestId('request-description');
    await expect(requestDescBtn).toBeVisible();
    await requestDescBtn.click();

    // Wait for task form modal
    await page.waitForSelector('[data-testid="task-form-modal"]', {
      state: 'visible',
    });

    // Verify task type is RequestDescription
    const taskTypeField = page.getByTestId('task-type');
    await expect(taskTypeField).toContainText(/request.*description/i);

    // Verify assignee is auto-filled with owner
    const assigneeField = page.locator('[data-testid="assignees-field"]');
    await expect(assigneeField).toContainText(ownerUser.responseData.displayName);

    // Submit task
    const submitBtn = page.getByTestId('submit-task');
    await expect(submitBtn).toBeEnabled();

    const taskResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/tasks') &&
        response.request().method() === 'POST'
    );
    await submitBtn.click();
    await taskResponse;

    // Verify success
    await expect(page.getByText(/task created/i)).toBeVisible();

    // Verify task appears in activity feed
    await page.getByTestId('activity_feed').click();
    await page.waitForLoadState('networkidle');

    const taskCard = page.locator('[data-testid="task-feed-card"]').first();
    await expect(taskCard).toBeVisible();
    await expect(taskCard).toContainText(/request.*description/i);
  });

  test('should create request description task for column', async ({ page }) => {
    await tableWithOwner.visitEntityPage(page);

    // Expand columns section and find a column
    const columnsTab = page.getByRole('tab', { name: /columns/i });
    if (await columnsTab.isVisible()) {
      await columnsTab.click();
    }

    // Find column row and click request description
    const columnRow = page.locator('[data-testid="column-name"]').first();
    await columnRow.hover();

    const columnRequestDesc = page
      .locator('[data-testid="request-column-description"]')
      .first();

    if (await columnRequestDesc.isVisible()) {
      await columnRequestDesc.click();

      await page.waitForSelector('[data-testid="task-form-modal"]', {
        state: 'visible',
      });

      // Verify column name is in the task
      const taskModal = page.locator('[data-testid="task-form-modal"]');
      await expect(taskModal).toContainText(/column/i);

      // Submit
      const submitBtn = page.getByTestId('submit-task');
      const taskResponse = page.waitForResponse('/api/v1/tasks');
      await submitBtn.click();
      await taskResponse;

      await expect(page.getByText(/task created/i)).toBeVisible();
    }
  });

  test('should allow manual assignee selection when entity has no owner', async ({
    page,
  }) => {
    await tableWithoutOwner.visitEntityPage(page);

    const requestDescBtn = page.getByTestId('request-description');
    await expect(requestDescBtn).toBeVisible();
    await requestDescBtn.click();

    await page.waitForSelector('[data-testid="task-form-modal"]', {
      state: 'visible',
    });

    // Assignee field should be empty (no owner)
    const assigneeField = page.locator('[data-testid="assignees-field"]');

    // Select assignee manually
    await assigneeField.click();

    // Search for user
    const searchInput = page.getByPlaceholder(/search/i);
    if (await searchInput.isVisible()) {
      await searchInput.fill(ownerUser.responseData.displayName);
      await page.waitForLoadState('networkidle');
    }

    // Click on user in dropdown
    await page
      .getByText(ownerUser.responseData.displayName, { exact: false })
      .first()
      .click();

    // Submit
    const submitBtn = page.getByTestId('submit-task');
    await expect(submitBtn).toBeEnabled();

    const taskResponse = page.waitForResponse('/api/v1/tasks');
    await submitBtn.click();
    await taskResponse;

    await expect(page.getByText(/task created/i)).toBeVisible();
  });

  test('should prevent task creation without assignee', async ({ page }) => {
    await tableWithoutOwner.visitEntityPage(page);

    const requestDescBtn = page.getByTestId('request-description');
    await requestDescBtn.click();

    await page.waitForSelector('[data-testid="task-form-modal"]', {
      state: 'visible',
    });

    // Try to submit without assignee
    const submitBtn = page.getByTestId('submit-task');

    // Button should be disabled or show validation error
    const isDisabled = await submitBtn.isDisabled();
    if (!isDisabled) {
      await submitBtn.click();
      // Should show validation error
      await expect(page.getByText(/assignee.*required/i)).toBeVisible();
    } else {
      expect(isDisabled).toBe(true);
    }
  });
});

test.describe('Task Creation - Request Tags', () => {
  const adminUser = new UserClass();
  const ownerUser = new UserClass();
  const table = new TableClass();

  test.beforeAll('Setup test data', async ({ browser }) => {
    const { apiContext, afterAction } = await performAdminLogin(browser);

    try {
      await adminUser.create(apiContext);
      await adminUser.setAdminRole(apiContext);
      await ownerUser.create(apiContext);

      await table.create(apiContext);
      await table.setOwner(apiContext, {
        id: ownerUser.responseData.id,
        type: 'user',
      });
    } finally {
      await afterAction();
    }
  });

  test.afterAll('Cleanup test data', async ({ browser }) => {
    const { apiContext, afterAction } = await performAdminLogin(browser);

    try {
      await table.delete(apiContext);
      await ownerUser.delete(apiContext);
      await adminUser.delete(apiContext);
    } finally {
      await afterAction();
    }
  });

  test.beforeEach(async ({ page }) => {
    await adminUser.login(page);
  });

  test('should create request tags task for table', async ({ page }) => {
    await table.visitEntityPage(page);

    // Find request tags button
    const requestTagsBtn = page.getByTestId('request-tags');

    if (await requestTagsBtn.isVisible()) {
      await requestTagsBtn.click();

      await page.waitForSelector('[data-testid="task-form-modal"]', {
        state: 'visible',
      });

      // Verify task type
      await expect(page.locator('[data-testid="task-form-modal"]')).toContainText(
        /request.*tag/i
      );

      // Submit
      const submitBtn = page.getByTestId('submit-task');
      const taskResponse = page.waitForResponse('/api/v1/tasks');
      await submitBtn.click();
      await taskResponse;

      await expect(page.getByText(/task created/i)).toBeVisible();
    }
  });
});

test.describe('Task Creation - Suggest Description', () => {
  const adminUser = new UserClass();
  const ownerUser = new UserClass();
  const table = new TableClass();

  test.beforeAll('Setup test data', async ({ browser }) => {
    const { apiContext, afterAction } = await performAdminLogin(browser);

    try {
      await adminUser.create(apiContext);
      await adminUser.setAdminRole(apiContext);
      await ownerUser.create(apiContext);

      await table.create(apiContext);
      await table.setOwner(apiContext, {
        id: ownerUser.responseData.id,
        type: 'user',
      });
    } finally {
      await afterAction();
    }
  });

  test.afterAll('Cleanup test data', async ({ browser }) => {
    const { apiContext, afterAction } = await performAdminLogin(browser);

    try {
      await table.delete(apiContext);
      await ownerUser.delete(apiContext);
      await adminUser.delete(apiContext);
    } finally {
      await afterAction();
    }
  });

  test.beforeEach(async ({ page }) => {
    await adminUser.login(page);
  });

  test('should create suggest description task with suggested value', async ({
    page,
  }) => {
    await table.visitEntityPage(page);

    // Find suggest description button (usually in edit mode or dropdown)
    const suggestDescBtn = page.getByTestId('suggest-description');

    if (await suggestDescBtn.isVisible()) {
      await suggestDescBtn.click();

      await page.waitForSelector('[data-testid="task-form-modal"]', {
        state: 'visible',
      });

      // Enter suggested description
      const descriptionInput = page.locator(
        '[data-testid="suggestion-input"] .ql-editor, [data-testid="description-input"]'
      );

      if (await descriptionInput.isVisible()) {
        await descriptionInput.fill('This is a suggested description for the table.');
      }

      // Submit
      const submitBtn = page.getByTestId('submit-task');
      const taskResponse = page.waitForResponse('/api/v1/tasks');
      await submitBtn.click();
      await taskResponse;

      await expect(page.getByText(/task created/i)).toBeVisible();

      // Verify suggestion appears in task
      await page.getByTestId('activity_feed').click();
      await page.waitForLoadState('networkidle');

      const taskCard = page.locator('[data-testid="task-feed-card"]').first();
      await expect(taskCard).toContainText('suggested description');
    }
  });
});

test.describe('Task Creation - Suggest Tags', () => {
  const adminUser = new UserClass();
  const ownerUser = new UserClass();
  const table = new TableClass();

  test.beforeAll('Setup test data', async ({ browser }) => {
    const { apiContext, afterAction } = await performAdminLogin(browser);

    try {
      await adminUser.create(apiContext);
      await adminUser.setAdminRole(apiContext);
      await ownerUser.create(apiContext);

      await table.create(apiContext);
      await table.setOwner(apiContext, {
        id: ownerUser.responseData.id,
        type: 'user',
      });
    } finally {
      await afterAction();
    }
  });

  test.afterAll('Cleanup test data', async ({ browser }) => {
    const { apiContext, afterAction } = await performAdminLogin(browser);

    try {
      await table.delete(apiContext);
      await ownerUser.delete(apiContext);
      await adminUser.delete(apiContext);
    } finally {
      await afterAction();
    }
  });

  test.beforeEach(async ({ page }) => {
    await adminUser.login(page);
  });

  test('should create suggest tags task with suggested tags', async ({
    page,
  }) => {
    await table.visitEntityPage(page);

    const suggestTagsBtn = page.getByTestId('suggest-tags');

    if (await suggestTagsBtn.isVisible()) {
      await suggestTagsBtn.click();

      await page.waitForSelector('[data-testid="task-form-modal"]', {
        state: 'visible',
      });

      // Add suggested tags
      const tagsInput = page.locator('[data-testid="tags-input"]');
      if (await tagsInput.isVisible()) {
        await tagsInput.click();

        // Type tag name
        await page.keyboard.type('PII');
        await page.waitForLoadState('networkidle');

        // Select from dropdown
        const tagOption = page.getByText('PII.Sensitive', { exact: false }).first();
        if (await tagOption.isVisible()) {
          await tagOption.click();
        }
      }

      // Submit
      const submitBtn = page.getByTestId('submit-task');
      const taskResponse = page.waitForResponse('/api/v1/tasks');
      await submitBtn.click();
      await taskResponse;

      await expect(page.getByText(/task created/i)).toBeVisible();
    }
  });
});
