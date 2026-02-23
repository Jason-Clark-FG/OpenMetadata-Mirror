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
import test, { expect } from '@playwright/test';
import { SidebarItem } from '../../../constant/sidebar';
import { Glossary } from '../../../support/glossary/Glossary';
import { GlossaryTerm } from '../../../support/glossary/GlossaryTerm';
import { getApiContext, redirectToHomePage } from '../../../utils/common';
import { waitForAllLoadersToDisappear } from '../../../utils/entity';
import {
  addRelatedTerms,
  selectActiveGlossary,
  selectActiveGlossaryTerm,
} from '../../../utils/glossary';
import { sidebarClick } from '../../../utils/sidebar';

test.use({
  storageState: 'playwright/.auth/admin.json',
});

test.describe(
  'Glossary Related Terms with Relation Types',
  { tag: ['@Features', '@Governance'] },
  () => {
    test.beforeEach(async ({ page }) => {
      await redirectToHomePage(page);
    });

    test('should add related term with default relatedTo type', async ({
      page,
    }) => {
      test.slow();
      const { apiContext, afterAction } = await getApiContext(page);
      const glossary = new Glossary();
      const term1 = new GlossaryTerm(glossary);
      const term2 = new GlossaryTerm(glossary);

      try {
        await glossary.create(apiContext);
        await term1.create(apiContext);
        await term2.create(apiContext);

        const term1Name =
          term1.responseData?.displayName ?? term1.data.displayName;

        await test.step('Navigate to glossary term', async () => {
          await sidebarClick(page, SidebarItem.GLOSSARY);
          await selectActiveGlossary(page, glossary.data.displayName);
          await selectActiveGlossaryTerm(page, term1Name);
        });

        await test.step('Add related term with relatedTo type and verify label', async () => {
          await addRelatedTerms(page, [term2]);

          const relatedContainer = page.getByTestId('related-term-container');
          await expect(relatedContainer).toBeVisible();
          await expect(relatedContainer.getByText('Related To')).toBeVisible();
        });
      } finally {
        await term1.delete(apiContext);
        await term2.delete(apiContext);
        await glossary.delete(apiContext);
        await afterAction();
      }
    });

    test('should add related term with synonym type', async ({ page }) => {
      test.slow();
      const { apiContext, afterAction } = await getApiContext(page);
      const glossary = new Glossary();
      const term1 = new GlossaryTerm(glossary);
      const term2 = new GlossaryTerm(glossary);

      try {
        await glossary.create(apiContext);
        await term1.create(apiContext);
        await term2.create(apiContext);

        const term1Name =
          term1.responseData?.displayName ?? term1.data.displayName;

        await test.step('Navigate to glossary term', async () => {
          await sidebarClick(page, SidebarItem.GLOSSARY);
          await selectActiveGlossary(page, glossary.data.displayName);
          await selectActiveGlossaryTerm(page, term1Name);
        });

        await test.step('Add related term with synonym type and verify label', async () => {
          await addRelatedTerms(page, [term2], 'Synonym');

          const relatedContainer = page.getByTestId('related-term-container');
          await expect(relatedContainer).toBeVisible();
          await expect(relatedContainer.getByText('Synonym')).toBeVisible();
        });
      } finally {
        await term1.delete(apiContext);
        await term2.delete(apiContext);
        await glossary.delete(apiContext);
        await afterAction();
      }
    });

    test('should add related term with broader type', async ({ page }) => {
      test.slow();
      const { apiContext, afterAction } = await getApiContext(page);
      const glossary = new Glossary();
      const term1 = new GlossaryTerm(glossary);
      const term2 = new GlossaryTerm(glossary);

      try {
        await glossary.create(apiContext);
        await term1.create(apiContext);
        await term2.create(apiContext);

        const term1Name =
          term1.responseData?.displayName ?? term1.data.displayName;

        await test.step('Navigate to glossary term', async () => {
          await sidebarClick(page, SidebarItem.GLOSSARY);
          await selectActiveGlossary(page, glossary.data.displayName);
          await selectActiveGlossaryTerm(page, term1Name);
        });

        await test.step('Add related term with broader type and verify label', async () => {
          await addRelatedTerms(page, [term2], 'Broader');

          const relatedContainer = page.getByTestId('related-term-container');
          await expect(relatedContainer).toBeVisible();
          await expect(relatedContainer.getByText('Broader')).toBeVisible();
        });
      } finally {
        await term1.delete(apiContext);
        await term2.delete(apiContext);
        await glossary.delete(apiContext);
        await afterAction();
      }
    });

    test('should show relation type selector when adding related terms', async ({
      page,
    }) => {
      test.slow();
      const { apiContext, afterAction } = await getApiContext(page);
      const glossary = new Glossary();
      const term1 = new GlossaryTerm(glossary);

      try {
        await glossary.create(apiContext);
        await term1.create(apiContext);

        const term1Name =
          term1.responseData?.displayName ?? term1.data.displayName;

        await test.step('Navigate to glossary term', async () => {
          await sidebarClick(page, SidebarItem.GLOSSARY);
          await selectActiveGlossary(page, glossary.data.displayName);
          await selectActiveGlossaryTerm(page, term1Name);
        });

        await test.step('Open relation type selector and verify all options', async () => {
          await page.getByTestId('related-term-add-button').click();

          const relationTypeSelect = page.getByTestId('relation-type-select');
          await expect(relationTypeSelect).toBeVisible();

          const openTreeDropdowns = page.locator(
            '.async-tree-select-list-dropdown'
          );
          if (await openTreeDropdowns.isVisible()) {
            await page.keyboard.press('Escape');
            await expect(openTreeDropdowns).not.toBeVisible();
          }

          await relationTypeSelect.locator('.ant-select-selector').click();

          for (const optionText of [
            'Related To',
            'Synonym',
            'Broader',
            'Narrower',
          ]) {
            await expect(
              page
                .locator('.ant-select-dropdown:visible')
                .locator('.ant-select-item-option-content')
                .filter({ hasText: optionText })
            ).toBeVisible();
          }

          await page.keyboard.press('Escape');
          await expect(
            page.locator('.ant-select-dropdown:visible')
          ).not.toBeVisible();
        });
      } finally {
        await term1.delete(apiContext);
        await glossary.delete(apiContext);
        await afterAction();
      }
    });

    test('should verify bidirectional relation for symmetric type (synonym)', async ({
      page,
    }) => {
      test.slow();
      const { apiContext, afterAction } = await getApiContext(page);
      const glossary = new Glossary();
      const term1 = new GlossaryTerm(glossary);
      const term2 = new GlossaryTerm(glossary);

      try {
        await glossary.create(apiContext);
        await term1.create(apiContext);
        await term2.create(apiContext);

        const term1Name =
          term1.responseData?.displayName ?? term1.data.displayName;
        const term2Name =
          term2.responseData?.displayName ?? term2.data.displayName;

        await test.step('Add synonym relation from term1 to term2', async () => {
          await sidebarClick(page, SidebarItem.GLOSSARY);
          await selectActiveGlossary(page, glossary.data.displayName);
          await selectActiveGlossaryTerm(page, term1Name);
          await addRelatedTerms(page, [term2], 'Synonym');
        });

        await test.step('Verify term2 shows term1 as synonym (bidirectional)', async () => {
          await selectActiveGlossaryTerm(page, term2Name);
          await waitForAllLoadersToDisappear(page);

          const relatedContainer = page.getByTestId('related-term-container');
          await expect(relatedContainer).toBeVisible();
          await expect(relatedContainer.getByText(term1Name)).toBeVisible();
          await expect(relatedContainer.getByText('Synonym')).toBeVisible();
        });
      } finally {
        await term1.delete(apiContext);
        await term2.delete(apiContext);
        await glossary.delete(apiContext);
        await afterAction();
      }
    });

    test('should verify inverse relation for asymmetric type (broader/narrower)', async ({
      page,
    }) => {
      test.slow();
      const { apiContext, afterAction } = await getApiContext(page);
      const glossary = new Glossary();
      const term1 = new GlossaryTerm(glossary);
      const term2 = new GlossaryTerm(glossary);

      try {
        await glossary.create(apiContext);
        await term1.create(apiContext);
        await term2.create(apiContext);

        const term1Name =
          term1.responseData?.displayName ?? term1.data.displayName;
        const term2Name =
          term2.responseData?.displayName ?? term2.data.displayName;

        await test.step('Add broader relation from term1 to term2', async () => {
          await sidebarClick(page, SidebarItem.GLOSSARY);
          await selectActiveGlossary(page, glossary.data.displayName);
          await selectActiveGlossaryTerm(page, term1Name);
          await addRelatedTerms(page, [term2], 'Broader');

          const relatedContainer = page.getByTestId('related-term-container');
          await expect(relatedContainer).toBeVisible();
          await expect(relatedContainer.getByText('Broader')).toBeVisible();
        });

        await test.step('Verify term2 shows term1 as narrower (inverse)', async () => {
          await selectActiveGlossaryTerm(page, term2Name);
          await waitForAllLoadersToDisappear(page);

          const relatedContainer = page.getByTestId('related-term-container');
          await expect(relatedContainer).toBeVisible();
          await expect(relatedContainer.getByText(term1Name)).toBeVisible();
          await expect(relatedContainer.getByText('Narrower')).toBeVisible();
        });
      } finally {
        await term1.delete(apiContext);
        await term2.delete(apiContext);
        await glossary.delete(apiContext);
        await afterAction();
      }
    });

    test('should display relations grouped by type', async ({ page }) => {
      test.slow();
      const { apiContext, afterAction } = await getApiContext(page);
      const glossary = new Glossary();
      const term1 = new GlossaryTerm(glossary);
      const term2 = new GlossaryTerm(glossary);
      const term3 = new GlossaryTerm(glossary);
      const term4 = new GlossaryTerm(glossary);

      try {
        await glossary.create(apiContext);
        await term1.create(apiContext);
        await term2.create(apiContext);
        await term3.create(apiContext);
        await term4.create(apiContext);

        const term1Name =
          term1.responseData?.displayName ?? term1.data.displayName;
        const term2Name =
          term2.responseData?.displayName ?? term2.data.displayName;
        const term3Name =
          term3.responseData?.displayName ?? term3.data.displayName;
        const term4Name =
          term4.responseData?.displayName ?? term4.data.displayName;

        await test.step('Navigate to term1', async () => {
          await sidebarClick(page, SidebarItem.GLOSSARY);
          await selectActiveGlossary(page, glossary.data.displayName);
          await selectActiveGlossaryTerm(page, term1Name);
        });

        await test.step('Add relations of three different types', async () => {
          await addRelatedTerms(page, [term2], 'Synonym');
          await addRelatedTerms(page, [term3], 'Broader');
          await addRelatedTerms(page, [term4]);
        });

        await test.step('Verify all relation type labels and terms are displayed', async () => {
          await waitForAllLoadersToDisappear(page);

          const relatedContainer = page.getByTestId('related-term-container');
          await expect(relatedContainer).toBeVisible();

          await expect(relatedContainer.getByText('Synonym')).toBeVisible();
          await expect(relatedContainer.getByText('Broader')).toBeVisible();
          await expect(relatedContainer.getByText('Related To')).toBeVisible();

          await expect(relatedContainer.getByText(term2Name)).toBeVisible();
          await expect(relatedContainer.getByText(term3Name)).toBeVisible();
          await expect(relatedContainer.getByText(term4Name)).toBeVisible();
        });
      } finally {
        await term1.delete(apiContext);
        await term2.delete(apiContext);
        await term3.delete(apiContext);
        await term4.delete(apiContext);
        await glossary.delete(apiContext);
        await afterAction();
      }
    });

    test('should remove relation and verify both directions are removed', async ({
      page,
    }) => {
      test.slow();
      const { apiContext, afterAction } = await getApiContext(page);
      const glossary = new Glossary();
      const term1 = new GlossaryTerm(glossary);
      const term2 = new GlossaryTerm(glossary);

      try {
        await glossary.create(apiContext);
        await term1.create(apiContext);
        await term2.create(apiContext);

        const term1Name =
          term1.responseData?.displayName ?? term1.data.displayName;
        const term2Name =
          term2.responseData?.displayName ?? term2.data.displayName;

        await test.step('Add synonym relation from term1 to term2', async () => {
          await sidebarClick(page, SidebarItem.GLOSSARY);
          await selectActiveGlossary(page, glossary.data.displayName);
          await selectActiveGlossaryTerm(page, term1Name);
          await addRelatedTerms(page, [term2], 'Synonym');
        });

        await test.step('Remove the synonym relation from term1', async () => {
          const relatedContainer = page.getByTestId('related-term-container');
          await expect(relatedContainer).toBeVisible();
          await expect(relatedContainer.getByText(term2Name)).toBeVisible();

          await relatedContainer.getByTestId('edit-button').click();

          const relationTypeSelect = page.getByTestId('relation-type-select');
          await expect(relationTypeSelect).toBeVisible();
          await relationTypeSelect.locator('.ant-select-selector').click();

          await page
            .locator('.ant-select-dropdown:visible')
            .locator('.ant-select-item-option-content')
            .filter({ hasText: 'Synonym' })
            .click();

          await expect(
            page.locator('.ant-select-dropdown:visible')
          ).not.toBeVisible();

          const term2Tag = page
            .getByTestId('tag-selector')
            .locator('.ant-select-selection-item')
            .filter({ hasText: term2Name });
          await expect(term2Tag).toBeVisible();
          await term2Tag.locator('.ant-select-selection-item-remove').click();

          const saveButton = page.getByTestId('saveAssociatedTag');
          await expect(saveButton).toBeEnabled();
          const saveResponse = page.waitForResponse(
            (response) =>
              response.url().includes('/api/v1/glossaryTerms') &&
              response.status() === 200
          );
          await saveButton.click();
          await saveResponse;
          await waitForAllLoadersToDisappear(page);

          await expect(relatedContainer.getByText(term2Name)).not.toBeVisible();
        });

        await test.step('Verify relation is also removed from term2 (bidirectional removal)', async () => {
          await selectActiveGlossaryTerm(page, term2Name);
          await waitForAllLoadersToDisappear(page);

          await expect(
            page.getByTestId('related-term-container').getByText(term1Name)
          ).not.toBeVisible();
        });
      } finally {
        await term1.delete(apiContext);
        await term2.delete(apiContext);
        await glossary.delete(apiContext);
        await afterAction();
      }
    });
  }
);
