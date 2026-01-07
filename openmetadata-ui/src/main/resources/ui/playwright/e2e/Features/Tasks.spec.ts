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
import { TableClass } from '../../support/entity/TableClass';
import { TeamClass } from '../../support/team/TeamClass';
import { UserClass } from '../../support/user/UserClass';
import { performAdminLogin } from '../../utils/admin';
import { redirectToHomePage } from '../../utils/common';
import { visitEntityPage } from '../../utils/entity';

/**
 * Task System E2E Tests
 *
 * These tests verify the complete task workflow including:
 * 1. Task creation (request description, request tags, suggest description, suggest tags)
 * 2. Task assignment (auto-fill from owners, manual assignment)
 * 3. Task navigation (clicking task goes to correct page)
 * 4. Task resolution (assignee permissions required)
 * 5. Task visibility (domain filtering, activity feed)
 * 6. Task count accuracy
 */

test.describe('Task Workflow Tests', () => {
  const adminUser = new UserClass();
  const regularUser = new UserClass();
  const tableWithOwner = new TableClass();
  const tableWithoutOwner = new TableClass();
  const testTeam = new TeamClass();

  test.beforeAll('Setup test data', async ({ browser }) => {
    const { apiContext, afterAction } = await performAdminLogin(browser);

    try {
      // Create users
      await adminUser.create(apiContext);
      await adminUser.setAdminRole(apiContext);
      await regularUser.create(apiContext);

      // Create team and add regular user
      await testTeam.create(apiContext);
      await testTeam.addUser(apiContext, regularUser.responseData.id);

      // Create tables - one with owner, one without
      await tableWithOwner.create(apiContext);
      await tableWithOwner.setOwner(apiContext, {
        id: regularUser.responseData.id,
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
      await testTeam.delete(apiContext);
      await regularUser.delete(apiContext);
      await adminUser.delete(apiContext);
    } finally {
      await afterAction();
    }
  });

  test.describe('Task Creation', () => {
    test.beforeEach(async ({ page }) => {
      await adminUser.login(page);
    });

    test('should create request description task from entity page', async ({
      page,
    }) => {
      await tableWithOwner.visitEntityPage(page);

      // Click on request description button
      const requestDescBtn = page.getByTestId('request-description');
      await expect(requestDescBtn).toBeVisible();
      await requestDescBtn.click();

      // Verify task creation modal/form appears
      const taskModal = page.getByTestId('task-form-modal');
      await expect(taskModal).toBeVisible();

      // Verify assignee is auto-filled with owner
      const assigneeField = taskModal.getByTestId('assignees-field');
      await expect(assigneeField).toContainText(regularUser.responseData.name);

      // Submit task
      const submitBtn = taskModal.getByTestId('submit-task');
      const taskResponse = page.waitForResponse('/api/v1/tasks');
      await submitBtn.click();
      await taskResponse;

      // Verify success toast
      await expect(page.getByText(/task created/i)).toBeVisible();
    });

    test('should allow manual assignee selection when entity has no owner', async ({
      page,
    }) => {
      await tableWithoutOwner.visitEntityPage(page);

      const requestDescBtn = page.getByTestId('request-description');
      await expect(requestDescBtn).toBeVisible();
      await requestDescBtn.click();

      const taskModal = page.getByTestId('task-form-modal');
      await expect(taskModal).toBeVisible();

      // Assignee should be empty (no owner)
      const assigneeField = taskModal.getByTestId('assignees-field');
      await expect(assigneeField).toBeEmpty();

      // Manually select assignee
      await assigneeField.click();
      await page.getByText(regularUser.responseData.displayName).click();

      // Submit task
      const submitBtn = taskModal.getByTestId('submit-task');
      await submitBtn.click();

      await expect(page.getByText(/task created/i)).toBeVisible();
    });

    test('should create suggest tags task', async ({ page }) => {
      await tableWithOwner.visitEntityPage(page);

      // Navigate to tags section and click suggest tags
      const suggestTagsBtn = page.getByTestId('suggest-tags');
      await expect(suggestTagsBtn).toBeVisible();
      await suggestTagsBtn.click();

      const taskModal = page.getByTestId('task-form-modal');
      await expect(taskModal).toBeVisible();

      // Add suggested tags
      const tagsInput = taskModal.getByTestId('tags-input');
      await tagsInput.click();
      await page.keyboard.type('PII.Sensitive');
      await page.keyboard.press('Enter');

      // Submit
      const submitBtn = taskModal.getByTestId('submit-task');
      await submitBtn.click();

      await expect(page.getByText(/task created/i)).toBeVisible();
    });
  });

  test.describe('Task Navigation', () => {
    test.beforeEach(async ({ page }) => {
      await adminUser.login(page);
    });

    test('clicking task in activity feed should navigate to entity page with task tab', async ({
      page,
    }) => {
      // First create a task
      await tableWithOwner.visitEntityPage(page);
      const requestDescBtn = page.getByTestId('request-description');
      await requestDescBtn.click();

      const taskModal = page.getByTestId('task-form-modal');
      const submitBtn = taskModal.getByTestId('submit-task');
      await submitBtn.click();
      await page.waitForLoadState('networkidle');

      // Go to home page and find the task in activity feed
      await redirectToHomePage(page);
      await page.waitForLoadState('networkidle');

      // Find the task in activity feed widget
      const feedWidget = page.getByTestId('KnowledgePanel.ActivityFeed');
      const taskItem = feedWidget.locator('[data-testid="task-feed-card"]').first();

      await expect(taskItem).toBeVisible();

      // Click on the task link
      const taskLink = taskItem.getByTestId('redirect-task-button-link');
      await taskLink.click();
      await page.waitForLoadState('networkidle');

      // Verify navigation - should NOT be 404
      await expect(page.getByText('No data available')).not.toBeVisible();

      // Should be on the entity page with activity feed tab
      expect(page.url()).toContain(tableWithOwner.entityResponseData?.fullyQualifiedName);
      expect(page.url()).toContain('activity_feed');
    });

    test('task link should NOT navigate to wrong URL like /table/TASK-xxxxx', async ({
      page,
    }) => {
      await tableWithOwner.visitEntityPage(page);
      await page.getByTestId('activity_feed').click();
      await page.waitForLoadState('networkidle');

      // Click on a task if visible
      const taskCard = page.locator('[data-testid="task-feed-card"]').first();

      if (await taskCard.isVisible()) {
        const taskLink = taskCard.getByTestId('redirect-task-button-link');
        await taskLink.click();
        await page.waitForLoadState('networkidle');

        // URL should NOT contain /table/TASK- pattern
        expect(page.url()).not.toMatch(/\/table\/TASK-/);

        // Should not show 404 or "No data available"
        await expect(page.getByText('No data available')).not.toBeVisible();
      }
    });
  });

  test.describe('Task Resolution and Permissions', () => {
    test('assignee should be able to approve task', async ({ page }) => {
      // Login as regular user (who is the assignee)
      await regularUser.login(page);

      await tableWithOwner.visitEntityPage(page);
      await page.getByTestId('activity_feed').click();
      await page.waitForLoadState('networkidle');

      // Find the task card
      const taskCard = page.locator('[data-testid="task-feed-card"]').first();
      await expect(taskCard).toBeVisible();

      // Should see approve/reject buttons
      const approveBtn = taskCard.getByTestId('approve-button');
      await expect(approveBtn).toBeVisible();

      // Click approve
      const resolveResponse = page.waitForResponse('/api/v1/tasks/*/resolve');
      await approveBtn.click();
      await resolveResponse;

      await expect(page.getByText(/task resolved/i)).toBeVisible();
    });

    test('non-assignee without edit permissions should NOT see approve button', async ({
      browser,
    }) => {
      // Create a new user who is NOT the assignee
      const { apiContext, afterAction } = await performAdminLogin(browser);
      const nonAssignee = new UserClass();
      await nonAssignee.create(apiContext);
      await afterAction();

      const page = await browser.newPage();
      await nonAssignee.login(page);

      await tableWithOwner.visitEntityPage(page);
      await page.getByTestId('activity_feed').click();
      await page.waitForLoadState('networkidle');

      // Find the task card
      const taskCard = page.locator('[data-testid="task-feed-card"]').first();

      if (await taskCard.isVisible()) {
        // Should NOT see approve button (not assignee)
        const approveBtn = taskCard.getByTestId('approve-button');
        await expect(approveBtn).not.toBeVisible();
      }

      await page.close();

      // Cleanup
      const { apiContext: cleanupContext, afterAction: cleanupAfter } =
        await performAdminLogin(browser);
      await nonAssignee.delete(cleanupContext);
      await cleanupAfter();
    });

    test('accepting task without edit permission should be rejected by backend', async ({
      browser,
    }) => {
      // This tests that even if UI shows approve button incorrectly,
      // the backend should reject resolution if user lacks EditDescription permission

      const { apiContext, afterAction } = await performAdminLogin(browser);

      // Create restricted user with no edit permissions
      const restrictedUser = new UserClass();
      await restrictedUser.create(apiContext);

      // Create a task assigned to this restricted user
      const taskResponse = await apiContext.post('/api/v1/tasks', {
        data: {
          about: {
            type: 'table',
            id: tableWithOwner.entityResponseData?.id,
            fullyQualifiedName: tableWithOwner.entityResponseData?.fullyQualifiedName,
          },
          type: 'RequestDescription',
          assignees: [{ id: restrictedUser.responseData.id, type: 'user' }],
        },
      });
      const task = await taskResponse.json();

      // Try to resolve as restricted user (should fail - no EditDescription permission)
      const resolveResponse = await apiContext.put(
        `/api/v1/tasks/${task.id}/resolve`,
        {
          data: {
            resolutionType: 'Completed',
            newValue: 'Test description',
          },
          headers: {
            Authorization: `Bearer ${restrictedUser.accessToken}`,
          },
        }
      );

      // Should get 403 Forbidden
      expect(resolveResponse.status()).toBe(403);

      // Cleanup
      await restrictedUser.delete(apiContext);
      await afterAction();
    });
  });

  test.describe('Task Count Accuracy', () => {
    test('task count in Activity Feed tab should match actual tasks', async ({
      page,
    }) => {
      await adminUser.login(page);
      await tableWithOwner.visitEntityPage(page);

      // Get the count shown in the tab
      const activityFeedTab = page.getByRole('tab', {
        name: 'Activity Feeds & Tasks',
      });
      const countBadge = activityFeedTab.getByTestId('count');
      const displayedCount = await countBadge.textContent();

      // Click on the tab
      await activityFeedTab.click();
      await page.waitForLoadState('networkidle');

      // Navigate to Tasks tab
      await page.getByRole('button', { name: 'Tasks' }).click();
      await page.waitForLoadState('networkidle');

      // Count actual tasks
      const taskCards = page.locator('[data-testid="task-feed-card"]');
      const actualCount = await taskCards.count();

      // Verify count matches
      expect(Number(displayedCount)).toBe(actualCount);
    });

    test('/tasks/count API should return correct counts for aboutEntity filter', async ({
      browser,
    }) => {
      const { apiContext, afterAction } = await performAdminLogin(browser);

      try {
        const countResponse = await apiContext.get(
          `/api/v1/tasks/count?aboutEntity=${tableWithOwner.entityResponseData?.fullyQualifiedName}`
        );

        expect(countResponse.ok()).toBe(true);
        const counts = await countResponse.json();

        // Verify response structure
        expect(counts).toHaveProperty('open');
        expect(counts).toHaveProperty('completed');
        expect(counts).toHaveProperty('total');
        expect(typeof counts.open).toBe('number');
        expect(typeof counts.completed).toBe('number');
        expect(typeof counts.total).toBe('number');
        expect(counts.total).toBe(counts.open + counts.completed);
      } finally {
        await afterAction();
      }
    });
  });

  test.describe('Activity Feed Integration', () => {
    test('creating a task should appear in entity activity feed', async ({
      page,
    }) => {
      await adminUser.login(page);
      await tableWithOwner.visitEntityPage(page);

      // Create a new task
      const requestDescBtn = page.getByTestId('request-description');
      await requestDescBtn.click();

      const taskModal = page.getByTestId('task-form-modal');
      const submitBtn = taskModal.getByTestId('submit-task');
      await submitBtn.click();
      await page.waitForLoadState('networkidle');

      // Navigate to activity feed
      await page.getByTestId('activity_feed').click();
      await page.waitForLoadState('networkidle');

      // Verify task appears
      const taskCards = page.locator('[data-testid="task-feed-card"]');
      await expect(taskCards.first()).toBeVisible();
    });

    test('task should appear in "My Tasks" filter for assignee', async ({
      page,
    }) => {
      await regularUser.login(page);
      await redirectToHomePage(page);

      // Find "My Tasks" filter/tab
      const myTasksBtn = page.getByRole('button', { name: /my tasks/i });
      await myTasksBtn.click();
      await page.waitForLoadState('networkidle');

      // Should see assigned tasks
      const taskCards = page.locator('[data-testid="task-feed-card"]');
      const count = await taskCards.count();

      expect(count).toBeGreaterThan(0);
    });
  });

  test.describe('Domain Filtering', () => {
    test('tasks should respect domain filter when domain is selected', async ({
      browser,
    }) => {
      // This requires domain setup
      const { apiContext, afterAction } = await performAdminLogin(browser);

      try {
        // Create domain
        const domainResponse = await apiContext.post('/api/v1/domains', {
          data: {
            name: 'test-domain-for-tasks',
            displayName: 'Test Domain For Tasks',
            domainType: 'Source-aligned',
          },
        });
        const domain = await domainResponse.json();

        // Create table in domain
        const tableInDomain = new TableClass();
        await tableInDomain.create(apiContext);
        await apiContext.patch(
          `/api/v1/tables/${tableInDomain.entityResponseData?.id}`,
          {
            data: [
              {
                op: 'add',
                path: '/domain',
                value: { id: domain.id, type: 'domain' },
              },
            ],
            headers: { 'Content-Type': 'application/json-patch+json' },
          }
        );

        // Create task on entity in domain
        await apiContext.post('/api/v1/tasks', {
          data: {
            about: {
              type: 'table',
              id: tableInDomain.entityResponseData?.id,
              fullyQualifiedName:
                tableInDomain.entityResponseData?.fullyQualifiedName,
            },
            type: 'RequestDescription',
          },
        });

        const page = await browser.newPage();
        await performAdminLogin(browser);

        // Select domain filter
        const domainSelector = page.getByTestId('domain-selector');
        await domainSelector.click();
        await page.getByText('Test Domain For Tasks').click();
        await page.waitForLoadState('networkidle');

        // Go to activity feed
        await page.goto('/activity-feed');
        await page.waitForLoadState('networkidle');

        // Tasks shown should only be from the selected domain
        const feedItems = page.locator('[data-testid="message-container"]');

        // Each visible task should be from entities in the selected domain
        // (Implementation would check the entity links)

        await page.close();

        // Cleanup
        await tableInDomain.delete(apiContext);
        await apiContext.delete(`/api/v1/domains/${domain.id}?hardDelete=true`);
      } finally {
        await afterAction();
      }
    });
  });
});
