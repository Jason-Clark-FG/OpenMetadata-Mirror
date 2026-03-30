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
import { Domain } from '../../support/domain/Domain';
import { Glossary } from '../../support/glossary/Glossary';
import { GlossaryTerm } from '../../support/glossary/GlossaryTerm';
import { ClassificationClass } from '../../support/tag/ClassificationClass';
import { TagClass } from '../../support/tag/TagClass';
import { UserClass } from '../../support/user/UserClass';
import {
  createNewPage,
  redirectToHomePage,
  uuid,
  visitGlossaryPage,
} from '../../utils/common';
import { selectDomain } from '../../utils/domain';
import { waitForAllLoadersToDisappear } from '../../utils/entity';
import { selectActiveGlossaryTerm } from '../../utils/glossary';
import { sidebarClick } from '../../utils/sidebar';

const adminUser = new UserClass();

test.use({ storageState: 'playwright/.auth/admin.json' });

/**
 * These tests verify that when an entity is renamed and then another field is updated
 * within the same session, the entity relationships are preserved.
 *
 * Background: The system consolidates changes made by the same user within a session timeout.
 * When a rename occurs, consolidation could revert to the previous version which has the old FQN,
 * potentially breaking relationships. The fix skips consolidation when the name has changed.
 */

/**
 * Helper to perform rename via UI
 */
async function performRename(
  page: Page,
  newName: string,
  apiEndpoint: string
): Promise<void> {
  const renameInput = page.locator('#name');
  const renameActions = [
    page.locator('.glossary-manage-dropdown-list-container [data-testid="rename-button"]'),
    page.locator('[data-testid="manage-dropdown-list-container"] [data-testid="rename-button"]'),
    page.locator('[data-testid="rename-button-title"]'),
    page.getByRole('menuitem', { name: /Rename.*Name/i }).getByTestId('rename-button'),
  ];

  const openRenameModal = async () => {
    await expect(page.getByTestId('manage-button')).toBeVisible();
    await page.getByTestId('manage-button').click();

    for (const action of renameActions) {
      if (await action.count()) {
        const candidate = action.first();
        await candidate.evaluate((node) => {
          (node as HTMLElement).click();
        });

        return;
      }
    }
  };

  await openRenameModal();

  if (!(await renameInput.isVisible().catch(() => false))) {
    await page.waitForTimeout(500);
    await openRenameModal();
  }

  await renameInput.clear();
  await renameInput.fill(newName);

  const patchResponse = page.waitForResponse(
    (response) =>
      response.url().includes(apiEndpoint) &&
      response.request().method() === 'PATCH'
  );
  await page.getByTestId('save-button').click();
  await patchResponse;

  await expect(renameInput).toBeHidden();
  await expect(page.getByTestId('entity-header-name')).toContainText(newName);
  await expect(page.getByTestId('manage-button')).toBeVisible();
}

/**
 * Helper to update description via UI
 */
async function updateDescription(
  page: Page,
  description: string,
  apiEndpoint: string
): Promise<void> {
  const descriptionContainer = page.getByTestId('asset-description-container');
  const editDescriptionButton =
    descriptionContainer.getByTestId('edit-description');
  const visibleEditButton = editDescriptionButton
    .filter({ visible: true })
    .first();

  await visibleEditButton.scrollIntoViewIfNeeded();
  await visibleEditButton.click({ force: true }).catch(async () =>
    visibleEditButton.evaluate((node) => {
      (node as HTMLElement).click();
    })
  );

  const editorSelector =
    '.ProseMirror[contenteditable="true"], .om-block-editor[contenteditable="true"]';
  const dialog = page.getByRole('dialog').filter({ visible: true }).last();
  const inlineEditor = descriptionContainer.locator(editorSelector).first();

  const ensureMarkdownEditorOpen = async () => {
    if (
      (await dialog.isVisible().catch(() => false)) ||
      (await inlineEditor.isVisible().catch(() => false))
    ) {
      return;
    }

    await visibleEditButton.evaluate((node) => {
      (node as HTMLElement).click();
    });
    await expect
      .poll(
        async () =>
          (await dialog.isVisible().catch(() => false)) ||
          (await inlineEditor.isVisible().catch(() => false)),
        { timeout: 10000 }
      )
      .toBe(true);
  };

  await ensureMarkdownEditorOpen();

  const modalDescriptionBox = dialog.locator(editorSelector).first();
  const hasModalEditor = await modalDescriptionBox
    .isVisible({ timeout: 2000 })
    .catch(() => false);
  const descriptionBox = hasModalEditor
    ? modalDescriptionBox
    : inlineEditor;
  if (hasModalEditor) {
    await expect(dialog).toBeVisible();
  }
  await expect(descriptionBox).toBeVisible();
  await descriptionBox.click({ force: true });
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  await descriptionBox.fill(description);

  const patchResponse = page.waitForResponse(
    (response) =>
      response.url().includes(apiEndpoint) &&
      response.request().method() === 'PATCH'
  );
  const saveButton = hasModalEditor
    ? dialog.getByRole('button', { name: 'Save' })
    : page.getByTestId('save');
  await expect(saveButton).toBeVisible();
  await saveButton.scrollIntoViewIfNeeded().catch(() => undefined);
  await saveButton
    .click({ force: true })
    .catch(async () =>
      saveButton.evaluate((node) => {
        (node as HTMLElement).click();
      })
    );
  await patchResponse;
  if (hasModalEditor) {
    await expect(dialog).toBeHidden();
  }
}

test.describe(
  'Entity Rename + Field Update Consolidation',
  PLAYWRIGHT_BASIC_TEST_TAG_OBJ,
  () => {
    test.beforeAll('Setup admin user', async ({ browser }) => {
      const { apiContext, afterAction } = await createNewPage(browser);
      await adminUser.create(apiContext);
      await adminUser.setAdminRole(apiContext);
      await afterAction();
    });

    test.afterAll('Cleanup admin user', async ({ browser }) => {
      const { apiContext, afterAction } = await createNewPage(browser);
      await adminUser.delete(apiContext);
      await afterAction();
    });

    // ===================================================================
    // GLOSSARY TESTS
    // ===================================================================

    test('Glossary - rename then update description should preserve terms', async ({
      page,
      browser,
    }) => {
      test.slow();

      const { apiContext, afterAction } = await createNewPage(browser);

      // Create glossary with a term
      const glossary = new Glossary();
      await glossary.create(apiContext);

      const glossaryTerm = new GlossaryTerm(glossary);
      await glossaryTerm.create(apiContext);

      let currentName = glossary.data.name;

      try {
        await redirectToHomePage(page);

        // Navigate to glossary
        await visitGlossaryPage(page, glossary.responseData.displayName);
        await expect(page.getByTestId('entity-header-name')).toBeVisible();

        // Verify term exists using display name
        await expect(
          page.getByText(glossaryTerm.data.displayName)
        ).toBeVisible();

        // Step 1: Rename the glossary
        const newName = `renamed-glossary-${uuid()}`;
        await performRename(page, newName, '/api/v1/glossaries/');
        currentName = newName;

        // Step 2: Update description (triggers consolidation logic)
        await updateDescription(
          page,
          `Updated description after rename ${uuid()}`,
          '/api/v1/glossaries/'
        );

        // Step 3: Verify term is still associated using display name
        await expect(
          page.getByText(glossaryTerm.data.displayName)
        ).toBeVisible();
      } finally {
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
            // Ignore
          }
        }
        await afterAction();
      }
    });

    test('Glossary - multiple rename + update cycles should preserve terms', async ({
      page,
      browser,
    }) => {
      test.slow();

      const { apiContext, afterAction } = await createNewPage(browser);

      const glossary = new Glossary();
      await glossary.create(apiContext);

      const glossaryTerm = new GlossaryTerm(glossary);
      await glossaryTerm.create(apiContext);

      let currentName = glossary.data.name;

      try {
        await redirectToHomePage(page);

        await visitGlossaryPage(page, glossary.responseData.displayName);
        await expect(page.getByTestId('entity-header-name')).toBeVisible();

        // Perform 3 cycles of rename + update
        for (let i = 1; i <= 3; i++) {
          const newName = `renamed-glossary-cycle-${i}-${uuid()}`;
          await performRename(page, newName, '/api/v1/glossaries/');
          currentName = newName;

          await updateDescription(
            page,
            `Description after cycle ${i}`,
            '/api/v1/glossaries/'
          );

          // Verify term still exists after each cycle using display name
          await expect(
            page.getByText(glossaryTerm.data.displayName)
          ).toBeVisible();
        }
      } finally {
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
            // Ignore
          }
        }
        await afterAction();
      }
    });

    // ===================================================================
    // GLOSSARY TERM TESTS
    // ===================================================================

    test('GlossaryTerm - rename then update description should work', async ({
      page,
      browser,
    }) => {
      test.slow();

      const { apiContext, afterAction } = await createNewPage(browser);

      const glossary = new Glossary();
      await glossary.create(apiContext);

      const glossaryTerm = new GlossaryTerm(glossary);
      await glossaryTerm.create(apiContext);

      try {
        await redirectToHomePage(page);

        await visitGlossaryPage(page, glossary.responseData.displayName);
        await selectActiveGlossaryTerm(
          page,
          glossaryTerm.responseData.displayName
        );

        // Step 1: Rename the term
        const newName = `renamed-term-${uuid()}`;
        await performRename(page, newName, '/api/v1/glossaryTerms/');

        // Step 2: Update description (triggers consolidation logic)
        await updateDescription(
          page,
          `Updated term description ${uuid()}`,
          '/api/v1/glossaryTerms/'
        );

        // Step 3: Verify the term is still accessible with updated data
        await expect(page.getByTestId('entity-header-name')).toContainText(
          newName
        );
      } finally {
        try {
          await glossary.delete(apiContext);
        } catch {
          // Ignore
        }
        await afterAction();
      }
    });

    // ===================================================================
    // CLASSIFICATION TESTS
    // ===================================================================

    test('Classification - rename then update description should preserve tags', async ({
      page,
      browser,
    }) => {
      test.slow();

      const { apiContext, afterAction } = await createNewPage(browser);

      // Create classification with a tag
      const classification = new ClassificationClass();
      await classification.create(apiContext);

      const tag = new TagClass({ classification: classification.data.name });
      await tag.create(apiContext);

      let currentName = classification.data.name;

      try {
        await redirectToHomePage(page);

        await page.goto(`/tags/${encodeURIComponent(classification.data.name)}`);
        await waitForAllLoadersToDisappear(page);
        await expect(page.getByTestId('entity-header-name')).toContainText(
          classification.data.name
        );

        // Verify tag exists
        await expect(page.getByText(tag.data.name).first()).toBeVisible();

        // Step 1: Rename the classification
        const newName = `renamed-class-${uuid()}`;
        await performRename(page, newName, '/api/v1/classifications/');
        currentName = newName;

        // Step 2: Update description (triggers consolidation logic)
        await updateDescription(
          page,
          `Updated classification description ${uuid()}`,
          '/api/v1/classifications/'
        );

        // Step 3: Verify tag is still associated
        await expect(page.getByText(tag.data.name).first()).toBeVisible();
      } finally {
        try {
          await apiContext.delete(
            `/api/v1/classifications/name/${encodeURIComponent(
              currentName
            )}?hardDelete=true&recursive=true`
          );
        } catch {
          try {
            await classification.delete(apiContext);
          } catch {
            // Ignore
          }
        }
        await afterAction();
      }
    });

    test('Classification - multiple rename + update cycles should preserve tags', async ({
      page,
      browser,
    }) => {
      test.slow();

      const { apiContext, afterAction } = await createNewPage(browser);

      const classification = new ClassificationClass();
      await classification.create(apiContext);

      const tag = new TagClass({ classification: classification.data.name });
      await tag.create(apiContext);

      let currentName = classification.data.name;

      try {
        await redirectToHomePage(page);

        await page.goto(`/tags/${encodeURIComponent(classification.data.name)}`);
        await waitForAllLoadersToDisappear(page);
        await expect(page.getByTestId('entity-header-name')).toContainText(
          classification.data.name
        );

        // Perform 3 cycles of rename + update
        for (let i = 1; i <= 3; i++) {
          const newName = `renamed-class-cycle-${i}-${uuid()}`;
          await performRename(page, newName, '/api/v1/classifications/');
          currentName = newName;

          await updateDescription(
            page,
            `Description after cycle ${i}`,
            '/api/v1/classifications/'
          );

          // Verify tag still exists after each cycle
          await expect(page.getByText(tag.data.name).first()).toBeVisible();
        }
      } finally {
        try {
          await apiContext.delete(
            `/api/v1/classifications/name/${encodeURIComponent(
              currentName
            )}?hardDelete=true&recursive=true`
          );
        } catch {
          try {
            await classification.delete(apiContext);
          } catch {
            // Ignore
          }
        }
        await afterAction();
      }
    });

    // ===================================================================
    // TAG TESTS
    // ===================================================================

    test('Tag - rename then update description should work', async ({
      page,
      browser,
    }) => {
      test.slow();

      const { apiContext, afterAction } = await createNewPage(browser);

      const classification = new ClassificationClass();
      await classification.create(apiContext);

      const tag = new TagClass({ classification: classification.data.name });
      await tag.create(apiContext);

      try {
        await redirectToHomePage(page);

        await page.goto(`/tags/${encodeURIComponent(classification.data.name)}`);
        await waitForAllLoadersToDisappear(page);
        await page.getByText(tag.data.name).first().click();

        await expect(page.getByTestId('entity-header-name')).toBeVisible();

        // Step 1: Rename the tag
        const newName = `renamed-tag-${uuid()}`;
        await performRename(page, newName, '/api/v1/tags/');

        // Step 2: Update description (triggers consolidation logic)
        await updateDescription(
          page,
          `Updated tag description ${uuid()}`,
          '/api/v1/tags/'
        );

        // Step 3: Verify the tag is still accessible
        await expect(page.getByTestId('entity-header-name')).toContainText(
          newName
        );
      } finally {
        try {
          await classification.delete(apiContext);
        } catch {
          // Ignore
        }
        await afterAction();
      }
    });

    test('Tag - multiple rename + update cycles should work', async ({
      page,
      browser,
    }) => {
      test.slow();

      const { apiContext, afterAction } = await createNewPage(browser);

      const classification = new ClassificationClass();
      await classification.create(apiContext);

      const tag = new TagClass({ classification: classification.data.name });
      await tag.create(apiContext);

      try {
        await redirectToHomePage(page);

        await page.goto(`/tags/${encodeURIComponent(classification.data.name)}`);
        await waitForAllLoadersToDisappear(page);
        await page.getByText(tag.data.name).first().click();

        await expect(page.getByTestId('entity-header-name')).toBeVisible();

        // Perform 3 cycles of rename + update
        for (let i = 1; i <= 3; i++) {
          const newName = `renamed-tag-cycle-${i}-${uuid()}`;
          await performRename(page, newName, '/api/v1/tags/');

          await updateDescription(
            page,
            `Description after cycle ${i}`,
            '/api/v1/tags/'
          );

          await expect(page.getByTestId('entity-header-name')).toContainText(
            newName
          );
        }
      } finally {
        try {
          await classification.delete(apiContext);
        } catch {
          // Ignore
        }
        await afterAction();
      }
    });

    // // ===================================================================
    // // METRIC TESTS
    // // ===================================================================
    // // NOTE: Metrics do not support renaming, so these tests are disabled.

    // test('Metric - rename then update description should work', async ({ page, browser }) => {
    //   test.slow();

    //   const { apiContext, afterAction } = await createNewPage(browser);

    //   const metric = new MetricClass();
    //   await metric.create(apiContext);

    //   let currentName = metric.entity.name;

    //   try {
    //     await redirectToHomePage(page);

    //     // Navigate to metric
    //     await metric.visitEntityPage(page);
    //     await expect(page.getByTestId('entity-header-name')).toBeVisible();

    //     // Step 1: Rename the metric
    //     const newName = `renamed-metric-${uuid()}`;
    //     await performRename(page, newName, '/api/v1/metrics/');
    //     currentName = newName;

    //     // Step 2: Update description (triggers consolidation logic)
    //     await updateDescription(
    //       page,
    //       `Updated metric description ${uuid()}`,
    //       '/api/v1/metrics/'
    //     );

    //     // Step 3: Verify the metric is still accessible with updated data
    //     await expect(page.getByTestId('entity-header-name')).toContainText(
    //       newName
    //     );
    //   } finally {
    //     try {
    //       await apiContext.delete(
    //         `/api/v1/metrics/name/${encodeURIComponent(
    //           currentName
    //         )}?hardDelete=true`
    //       );
    //     } catch {
    //       try {
    //         await metric.delete(apiContext);
    //       } catch {
    //         // Ignore
    //       }
    //     }
    //     await afterAction();
    //   }
    // });

    // test('Metric - multiple rename + update cycles should work', async ({ page, browser }) => {
    //   test.slow();

    //   const { apiContext, afterAction } = await createNewPage(browser);

    //   const metric = new MetricClass();
    //   await metric.create(apiContext);

    //   let currentName = metric.entity.name;

    //   try {
    //     await redirectToHomePage(page);

    //     await metric.visitEntityPage(page);
    //     await expect(page.getByTestId('entity-header-name')).toBeVisible();

    //     // Perform 3 cycles of rename + update
    //     for (let i = 1; i <= 3; i++) {
    //       const newName = `renamed-metric-cycle-${i}-${uuid()}`;
    //       await performRename(page, newName, '/api/v1/metrics/');
    //       currentName = newName;

    //       await updateDescription(
    //         page,
    //         `Description after cycle ${i}`,
    //         '/api/v1/metrics/'
    //       );

    //       await expect(page.getByTestId('entity-header-name')).toContainText(
    //         newName
    //       );
    //     }
    //   } finally {
    //     try {
    //       await apiContext.delete(
    //         `/api/v1/metrics/name/${encodeURIComponent(
    //           currentName
    //         )}?hardDelete=true`
    //       );
    //     } catch {
    //       try {
    //         await metric.delete(apiContext);
    //       } catch {
    //         // Ignore
    //       }
    //     }
    //     await afterAction();
    //   }
    // });

    // ===================================================================
    // DOMAIN TESTS
    // ===================================================================

    // eslint-disable-next-line playwright/no-skipped-test -- domain rename consolidation not yet stable
    test.skip('Domain - rename then update description should work', async ({
      page,
      browser,
    }) => {
      test.slow();

      const { apiContext, afterAction } = await createNewPage(browser);

      const domain = new Domain();
      await domain.create(apiContext);

      let currentName = domain.data.name;

      try {
        await redirectToHomePage(page);

        // Navigate to domain
        await sidebarClick(page, SidebarItem.DOMAIN);
        await selectDomain(page, domain.responseData);
        await expect(page.getByTestId('entity-header-name')).toBeVisible();

        // Step 1: Rename the domain
        const newName = `renamed-domain-${uuid()}`;
        await performRename(page, newName, '/api/v1/domains/');
        currentName = newName;

        // Step 2: Update description (triggers consolidation logic)
        await updateDescription(
          page,
          `Updated domain description ${uuid()}`,
          '/api/v1/domains/'
        );

        // Step 3: Verify the domain is still accessible with updated data
        await expect(page.getByTestId('entity-header-name')).toContainText(
          newName
        );
      } finally {
        try {
          await apiContext.delete(
            `/api/v1/domains/name/${encodeURIComponent(
              currentName
            )}?hardDelete=true&recursive=true`
          );
        } catch {
          try {
            await domain.delete(apiContext);
          } catch {
            // Ignore
          }
        }
        await afterAction();
      }
    });

    // eslint-disable-next-line playwright/no-skipped-test -- domain rename consolidation not yet stable
    test.skip('Domain - multiple rename + update cycles should work', async ({
      page,
      browser,
    }) => {
      test.slow();

      const { apiContext, afterAction } = await createNewPage(browser);

      const domain = new Domain();
      await domain.create(apiContext);

      let currentName = domain.data.name;

      try {
        await redirectToHomePage(page);

        await sidebarClick(page, SidebarItem.DOMAIN);
        await selectDomain(page, domain.responseData);
        await expect(page.getByTestId('entity-header-name')).toBeVisible();

        // Perform 3 cycles of rename + update
        for (let i = 1; i <= 3; i++) {
          const newName = `renamed-domain-cycle-${i}-${uuid()}`;
          await performRename(page, newName, '/api/v1/domains/');
          currentName = newName;

          await updateDescription(
            page,
            `Description after cycle ${i}`,
            '/api/v1/domains/'
          );

          await expect(page.getByTestId('entity-header-name')).toContainText(
            newName
          );
        }
      } finally {
        try {
          await apiContext.delete(
            `/api/v1/domains/name/${encodeURIComponent(
              currentName
            )}?hardDelete=true&recursive=true`
          );
        } catch {
          try {
            await domain.delete(apiContext);
          } catch {
            // Ignore
          }
        }
        await afterAction();
      }
    });
  }
);
