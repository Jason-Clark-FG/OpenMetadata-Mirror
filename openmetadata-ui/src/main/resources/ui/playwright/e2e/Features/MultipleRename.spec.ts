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

import { expect, Page, test } from '@playwright/test';
import { PLAYWRIGHT_BASIC_TEST_TAG_OBJ } from '../../constant/config';
import { SidebarItem } from '../../constant/sidebar';
import { Glossary } from '../../support/glossary/Glossary';
import { GlossaryTerm } from '../../support/glossary/GlossaryTerm';
import { ClassificationClass } from '../../support/tag/ClassificationClass';
import { TagClass } from '../../support/tag/TagClass';
import { UserClass } from '../../support/user/UserClass';
import { performAdminLogin } from '../../utils/admin';
import {
  redirectToHomePage,
  uuid,
  visitGlossaryPage,
} from '../../utils/common';
import { waitForAllLoadersToDisappear } from '../../utils/entity';
import { selectActiveGlossaryTerm } from '../../utils/glossary';
import { sidebarClick } from '../../utils/sidebar';
import { visitClassificationPage } from '../../utils/tag';

const adminUser = new UserClass();

const logRenameDebug = (...messages: Array<string | number>) => {
  if (process.env.PW_RENAME_DEBUG) {
    // eslint-disable-next-line no-console -- opt-in playwright debug logging
    console.log('[PW_RENAME_DEBUG]', ...messages);
  }
};

/**
 * Helper function to perform a rename operation via the UI
 */
async function performRename(
  page: Page,
  newName: string,
  apiEndpoint: string
): Promise<Record<string, unknown> | undefined> {
  logRenameDebug('performRename:start', apiEndpoint, newName);
  const renameModal = page.locator('.ant-modal').filter({
    has: page
      .getByTestId('header')
      .filter({ hasText: /Edit (Display )?Name/ }),
  });
  const modalHeader = renameModal.getByTestId('header');
  const nameInput = renameModal.locator('input#name');
  const displayNameInput = renameModal.locator('input#displayName');
  const saveButton = renameModal.getByTestId('save-button');
  const isDisplayNameEdit = apiEndpoint === '/api/v1/classifications/';
  const renameInput = isDisplayNameEdit ? displayNameInput : nameInput;
  const headerNameLocator = isDisplayNameEdit
    ? page.getByTestId('entity-header-display-name')
    : page.getByTestId('entity-header-name');
  const renameActions = [
    page
      .getByRole('menuitem', { name: /Rename.*Name/i })
      .getByTestId('rename-button'),
    page.locator('[data-testid="rename-button-title"]'),
    page.locator('.glossary-manage-dropdown-list-container [data-testid="rename-button"]'),
    page.locator('[data-testid="manage-dropdown-list-container"] [data-testid="rename-button"]'),
    page.getByTestId('rename-button'),
  ];

  const openRenameModal = async () => {
    logRenameDebug('performRename:openRenameModal');
    await expect(page.getByTestId('manage-button')).toBeVisible();
    await page.getByTestId('manage-button').click({ force: true });
    await page.waitForTimeout(250);
    logRenameDebug('performRename:manageClicked');

    const visibleDropdownContainers = [
      page
        .locator('.ant-dropdown:not(.ant-dropdown-hidden)')
        .filter({ has: page.getByTestId('rename-button') })
        .last(),
      page.locator('.glossary-manage-dropdown-list-container').last(),
      page.getByTestId('manage-dropdown-list-container').last(),
    ];

    for (const container of visibleDropdownContainers) {
      if (await container.isVisible().catch(() => false)) {
        const visibleRenameActions = [
          container.locator('[data-testid="rename-button-title"]').first(),
          container.getByRole('menuitem', { name: /Rename.*Name/i }).first(),
          container.getByTestId('rename-button').first(),
        ];

        for (const visibleRenameAction of visibleRenameActions) {
          if (await visibleRenameAction.isVisible().catch(() => false)) {
            try {
              await visibleRenameAction.click({ force: true });
            } catch {
              await visibleRenameAction.evaluate((node) => {
                (node as HTMLElement).click();
              });
            }
            logRenameDebug('performRename:visibleRenameActionClicked');

            if (await renameInput.isVisible().catch(() => false)) {
              logRenameDebug('performRename:renameInputVisible');

              return;
            }
          }
        }
      }
    }

    for (const action of renameActions) {
      if (await action.count()) {
        const candidate = action.first();
        if (await candidate.isVisible().catch(() => false)) {
          try {
            await candidate.click({ force: true });
          } catch {
            await candidate.evaluate((node) => {
              (node as HTMLElement).click();
            });
          }
          logRenameDebug('performRename:renameActionClicked');
        }

        if (await renameInput.isVisible().catch(() => false)) {
          logRenameDebug('performRename:renameInputVisible');
          return;
        }
      }
    }
  };

  if (apiEndpoint === '/api/v1/glossaryTerms/') {
    await expect(page.getByTestId('manage-button')).toBeVisible();
    await page.getByTestId('manage-button').click();
    await page.getByTestId('rename-button').click();
  } else {
    await openRenameModal();
  }

  if (!(await renameInput.isVisible().catch(() => false))) {
    await page.waitForTimeout(500);
    if (apiEndpoint === '/api/v1/glossaryTerms/') {
      await expect(page.getByTestId('manage-button')).toBeVisible();
      await page.getByTestId('manage-button').click();
      await page.getByTestId('rename-button').click();
    } else {
      await openRenameModal();
    }
  }

  await expect(modalHeader).toContainText(/Edit (Display )?Name/);
  await expect(renameInput).toBeVisible();
  logRenameDebug('performRename:modalReady');

  // Clear and enter new name
  await renameInput.clear();
  await renameInput.fill(newName);
  logRenameDebug('performRename:filled');

  // Save the rename
  const patchResponse = page.waitForResponse(
    (response) =>
      response.url().includes(apiEndpoint) &&
      response.request().method() === 'PATCH'
  );
  await expect(saveButton).toBeVisible();
  logRenameDebug('performRename:saveVisible');
  await saveButton
    .click({ force: true })
    .catch(async () =>
      saveButton.evaluate((node) => {
        (node as HTMLElement).click();
      })
    );
  logRenameDebug('performRename:saveClicked');
  const patchResult = await patchResponse;
  const patchData = (await patchResult.json()) as Record<string, unknown>;
  logRenameDebug('performRename:patchReceived');

  await expect(renameModal).toBeHidden();
  await page.waitForLoadState('domcontentloaded');
  await waitForAllLoadersToDisappear(page);
  await expect(headerNameLocator).toContainText(newName);
  await expect(page.getByTestId('manage-button')).toBeVisible();
  logRenameDebug('performRename:done', newName);

  return patchData;
}

test.describe('Multiple Rename Tests', PLAYWRIGHT_BASIC_TEST_TAG_OBJ, () => {
  test.beforeAll('Setup admin user', async ({ browser }) => {
    const { apiContext, afterAction } = await performAdminLogin(browser);
    await adminUser.create(apiContext);
    await adminUser.setAdminRole(apiContext);
    await afterAction();
  });

  test.afterAll('Cleanup admin user', async ({ browser }) => {
    const { apiContext, afterAction } = await performAdminLogin(browser);
    await adminUser.delete(apiContext);
    await afterAction();
  });

  test('Glossary - should handle multiple consecutive renames', async ({
    browser,
  }) => {
    test.slow();

    const { apiContext, afterAction } = await performAdminLogin(browser);

    // Create a glossary for this test
    const glossary = new Glossary();
    await glossary.create(apiContext);

    const page = await browser.newPage();
    let currentName = glossary.data.name;

    try {
      await adminUser.login(page);
      await redirectToHomePage(page);

      // Navigate to glossary using displayName
      await visitGlossaryPage(page, glossary.responseData.displayName);

      // Perform 3 consecutive renames
      for (let i = 1; i <= 3; i++) {
        const newName = `renamed-glossary-${i}-${uuid()}`;

        await performRename(page, newName, '/api/v1/glossaries/');

        // Verify the header shows the new name
        await expect(page.getByTestId('entity-header-name')).toContainText(
          newName
        );

        currentName = newName;
      }

      // Verify the glossary is still accessible
      await expect(page.getByTestId('entity-header-name')).toBeVisible();
    } finally {
      await page.close();

      // Cleanup
      try {
        await apiContext.delete(
          `/api/v1/glossaries/name/${encodeURIComponent(
            currentName
          )}?hardDelete=true&recursive=true`
        );
      } catch {
        try {
          await glossary.delete(apiContext);
        } catch {
          // Ignore cleanup errors
        }
      }
      await afterAction();
    }
  });

  test('GlossaryTerm - should handle multiple consecutive renames', async ({
    browser,
  }) => {
    test.slow();

    const { apiContext, afterAction } = await performAdminLogin(browser);

    // Create a glossary and term for this test
    const glossary = new Glossary();
    await glossary.create(apiContext);

    const glossaryTerm = new GlossaryTerm(glossary);
    await glossaryTerm.create(apiContext);

    const context = await browser.newContext({
      storageState: 'playwright/.auth/admin.json',
    });
    const page = await context.newPage();
    const openCurrentGlossaryTerm = async (
      termData: typeof glossaryTerm.responseData
    ) => {
      await visitGlossaryPage(page, glossary.responseData.displayName);

      const candidateNames = [termData.displayName, termData.name].filter(
        (value, index, names): value is string =>
          Boolean(value) && names.indexOf(value) === index
      );

      for (const candidateName of candidateNames) {
        const termEntry = page.getByTestId(candidateName).first();

        if (
          (await termEntry.count()) &&
          (await termEntry.isVisible().catch(() => false))
        ) {
          await selectActiveGlossaryTerm(page, candidateName);

          return;
        }
      }

      throw new Error(
        `Unable to locate glossary term after rename using candidates: ${candidateNames.join(
          ', '
        )}`
      );
    };

    try {
      await redirectToHomePage(page);
      await openCurrentGlossaryTerm(glossaryTerm.responseData);

      // Perform 3 consecutive renames
      for (let i = 1; i <= 3; i++) {
        const newName = `renamed-term-${i}-${uuid()}`;

        await performRename(page, newName, '/api/v1/glossaryTerms/');

        const glossaryTermResponse = await apiContext.get(
          `/api/v1/glossaryTerms/${glossaryTerm.responseData.id}`
        );
        const glossaryTermData =
          (await glossaryTermResponse.json()) as typeof glossaryTerm.responseData;
        await glossaryTerm.rename(
          glossaryTermData.name,
          glossaryTermData.fullyQualifiedName
        );
        await openCurrentGlossaryTerm(glossaryTermData);
        await waitForAllLoadersToDisappear(page);

        // Verify the header shows the new name
        await expect(page.getByTestId('entity-header-name')).toContainText(
          newName
        );
      }

      // Verify the term is still accessible
      await expect(page.getByTestId('entity-header-name')).toBeVisible();
    } finally {
      await context.close().catch(() => undefined);

      // Cleanup - delete the glossary which will cascade delete the term
      try {
        await glossary.delete(apiContext);
      } catch {
        // Ignore cleanup errors
      }
      await afterAction();
    }
  });

  test('Classification - should handle multiple consecutive renames', async ({
    browser,
  }) => {
    test.slow();
    test.setTimeout(300000);

    const { apiContext, afterAction } = await performAdminLogin(browser);

    // Create a classification for this test
    const classification = new ClassificationClass();
    await classification.create(apiContext);

    const context = await browser.newContext({
      storageState: 'playwright/.auth/admin.json',
    });
    let page = await context.newPage();
    let currentDisplayName =
      classification.responseData.displayName ?? classification.data.displayName;
    const openCurrentClassification = async () => {
      await visitClassificationPage(
        page,
        classification.responseData.name,
        classification.responseData.displayName ??
          classification.responseData.name
      );
    };

    try {
      await redirectToHomePage(page);
      await openCurrentClassification();
      logRenameDebug('classification:start', classification.responseData.name);

      // Perform 3 consecutive renames
      for (let i = 1; i <= 3; i++) {
        logRenameDebug('classification:cycle:start', i, classification.responseData.name);
        await openCurrentClassification();
        await waitForAllLoadersToDisappear(page);
        logRenameDebug('classification:cycle:visited', i, currentDisplayName);
        await expect(page.getByTestId('entity-header-display-name')).toContainText(
          currentDisplayName
        );

        const newName = `renamed-class-${i}-${uuid()}`;

        const renameModal = page.locator('.ant-modal').filter({
          has: page
            .getByTestId('header')
            .filter({ hasText: /Edit Display Name/ }),
        });
        const renameAction = page
          .locator('.ant-dropdown:not(.ant-dropdown-hidden)')
          .getByTestId('rename-button')
          .first();
        const patchResponse = page.waitForResponse(
          (response) =>
            response.url().includes('/api/v1/classifications/') &&
            response.request().method() === 'PATCH'
        );

        await expect(page.getByTestId('manage-button')).toBeVisible();
        await page.getByTestId('manage-button').click({ force: true });
        await expect(renameAction).toBeVisible();
        await renameAction.click({ force: true }).catch(async () =>
          renameAction.evaluate((node) => {
            (node as HTMLElement).click();
          })
        );
        await expect(renameModal.getByTestId('header')).toContainText(
          'Edit Display Name'
        );
        await renameModal.locator('input#displayName').fill(newName);
        await renameModal.getByTestId('save-button').click({ force: true });
        await patchResponse;
        await expect(renameModal).toBeHidden();
        await waitForAllLoadersToDisappear(page);
        await expect(page.getByTestId('entity-header-display-name')).toContainText(
          newName
        );
        logRenameDebug('classification:cycle:renamed', i, newName);

        const classificationResponse = await apiContext.get(
          `/api/v1/classifications/${classification.responseData.id}`
        );
        classification.responseData =
          (await classificationResponse.json()) as typeof classification.responseData;
        logRenameDebug(
          'classification:cycle:apiRefreshed',
          i,
          classification.responseData.name
        );
        await openCurrentClassification();
        logRenameDebug(
          'classification:cycle:revisited',
          i,
          classification.responseData.displayName ?? classification.responseData.name
        );
        // Verify the header shows the new name
        await expect(page.getByTestId('entity-header-display-name')).toContainText(
          newName
        );

        currentDisplayName =
          classification.responseData.displayName ??
          classification.responseData.name;

        // Wait for name to reflect in the header
        await expect(page.getByTestId('entity-header-name')).toBeVisible();
      }

      // Verify the classification is still accessible
      await expect(page.getByTestId('entity-header-name')).toBeVisible();
    } finally {
      await context.close().catch(() => undefined);

      // Cleanup
      try {
        await classification.delete(apiContext);
      } catch {
        try {
          await classification.delete(apiContext);
        } catch {
          // Ignore cleanup errors
        }
      }
      await afterAction();
    }
  });

  test('Tag - should handle multiple consecutive renames', async ({
    browser,
  }) => {
    test.slow();

    const { apiContext, afterAction } = await performAdminLogin(browser);

    // Create a classification and tag for this test
    const classification = new ClassificationClass();
    await classification.create(apiContext);

    const tag = new TagClass({ classification: classification.data.name });
    await tag.create(apiContext);

    const context = await browser.newContext({
      storageState: 'playwright/.auth/admin.json',
    });
    const page = await context.newPage();
    const openCurrentTag = async () => {
      tag.data.name = tag.responseData.name ?? tag.data.name;
      tag.data.displayName = tag.responseData.displayName ?? tag.data.displayName;

      await tag.visitPage(page);
    };

    try {
      await openCurrentTag();
      await expect(page.getByTestId('entity-header-name')).toBeVisible();

      // Perform 3 consecutive renames - Tag page has different menu structure
      for (let i = 1; i <= 3; i++) {
        const newName = `renamed-tag-${i}-${uuid()}`;
        await openCurrentTag();

        // Tag page has multiple rename-button elements (Rename and Style)
        // So we need to specifically target the Rename menu item
        await page.getByTestId('manage-button').click();
        await page
          .getByRole('menuitem', { name: /Rename.*Name/i })
          .getByTestId('rename-button')
          .click();

        // Wait for modal to appear
        await expect(page.locator('#name')).toBeVisible();

        // Clear and enter new name
        await page.locator('#name').clear();
        await page.locator('#name').fill(newName);

        // Save the rename
        const patchResponse = page.waitForResponse(
          (response) =>
            response.url().includes('/api/v1/tags/') &&
            response.request().method() === 'PATCH'
        );
        await page.getByTestId('save-button').click();
        await patchResponse;

        const tagResponse = await apiContext.get(`/api/v1/tags/${tag.responseData.id}`);
        tag.responseData = (await tagResponse.json()) as typeof tag.responseData;
        await openCurrentTag();
        await waitForAllLoadersToDisappear(page);

        // Wait for the UI to update

        // Verify the header shows the new name
        await expect(page.getByTestId('entity-header-name')).toContainText(
          newName
        );

        // Wait for name to reflect in the header
        await expect(page.getByTestId('entity-header-name')).toBeVisible();
      }

      // Verify the tag is still accessible
      await expect(page.getByTestId('entity-header-name')).toBeVisible();
    } finally {
      await context.close().catch(() => undefined);

      // Cleanup - delete the classification which will cascade delete the tag
      try {
        await classification.delete(apiContext);
      } catch {
        // Ignore cleanup errors
      }
      await afterAction();
    }
  });
});
