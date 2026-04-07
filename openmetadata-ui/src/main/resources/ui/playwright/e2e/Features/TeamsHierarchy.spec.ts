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
import { DELETE_TERM } from '../../constant/common';
import { PLAYWRIGHT_BASIC_TEST_TAG_OBJ } from '../../constant/config';
import { toastNotification, uuid } from '../../utils/common';
import { addTeamHierarchy, getNewTeamDetails } from '../../utils/team';

// use the admin user to login
test.use({ storageState: 'playwright/.auth/admin.json' });

test.describe.configure({ mode: 'serial' });

const businessTeamName = `business-${uuid()}`;
const divisionTeamName = `division-${uuid()}`;
const departmentTeamName = `department-${uuid()}`;
const groupTeamName = `group-${uuid()}`;
const teamNames = [
  businessTeamName,
  divisionTeamName,
  departmentTeamName,
  groupTeamName,
];

test.describe(
  'Add Nested Teams and Test TeamsSelectable',
  PLAYWRIGHT_BASIC_TEST_TAG_OBJ,
  () => {
    test.slow(true);

    test.beforeEach(async ({ page }) => {
      const getOrganizationResponse = page.waitForResponse(
        '/api/v1/teams/name/*'
      );
      const permissionResponse = page.waitForResponse(
        '/api/v1/permissions/team/name/*'
      );

      await page.goto('/settings/members/teams', {
        waitUntil: 'domcontentloaded',
      });
      await permissionResponse;
      await getOrganizationResponse;
      await expect(page.getByTestId('add-team')).toBeVisible();
    });

    test('Add teams in hierarchy', async ({ page }) => {
      for (const [index, teamName] of teamNames.entries()) {
        await addTeamHierarchy(page, getNewTeamDetails(teamName), index, true);
        const permissionResponse = page.waitForResponse(
          '/api/v1/permissions/team/name/*'
        );
        await page.goto(
          `/settings/members/teams/${encodeURIComponent(teamName)}`,
          {
            waitUntil: 'domcontentloaded',
          }
        );
        await permissionResponse;
        await expect(
          page.getByRole('heading', { name: teamName })
        ).toBeVisible();
      }
    });

    test('Check hierarchy in Add User page', async ({ page }) => {
      // Clicking on users
      await settingClick(page, GlobalSettingOptions.USERS);

      // Click on add user button
      const teamHierarchyResponse = page.waitForResponse(
        '/api/v1/teams/hierarchy?isJoinable=false'
      );
      await page.locator('[data-testid="add-user"]').click();
      await teamHierarchyResponse;

      // Enter team name
      await page.click('[data-testid="team-select"]');
      await page.keyboard.type(businessTeamName);

      for (const teamName of teamNames) {
        const dropdown = page.locator('.ant-tree-select-dropdown');

        await expect(dropdown).toContainText(teamName);
        await expect(dropdown.getByText(teamName)).toHaveCount(1);
      }

      for (const teamName of teamNames) {
        await expect(page.getByTestId('team-select')).toBeVisible();

        await page.click('[data-testid="team-select"]');
        await page.keyboard.type(teamName);

        await expect(page.locator('.ant-tree-select-dropdown')).toContainText(
          teamName
        );
      }
    });

    test('Delete Parent Team', async ({ page }) => {
      await page.goto('/settings/members/teams', {
        waitUntil: 'domcontentloaded',
      });
      await expect(page.getByTestId('add-team')).toBeVisible();

      await page.getByRole('link', { name: businessTeamName }).click();

      await page.click('[data-testid="manage-button"]');

      await page.click('[data-testid="delete-button-title"]');

      await expect(page.locator('.ant-modal-header')).toContainText(
        businessTeamName
      );

      await page.click(`[data-testid="hard-delete-option"]`);

      await expect(
        page.locator('[data-testid="confirm-button"]')
      ).toBeDisabled();

      await page
        .locator('[data-testid="confirmation-text-input"]')
        .fill(DELETE_TERM);

      const deleteResponse = page.waitForResponse(
        `/api/v1/teams/*?hardDelete=true&recursive=true`
      );

      await expect(
        page.locator('[data-testid="confirm-button"]')
      ).not.toBeDisabled();

      await page.click('[data-testid="confirm-button"]');
      await deleteResponse;

      await toastNotification(
        page,
        `"${businessTeamName}" deleted successfully!`
      );
    });
  }
);
