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

test.describe('Glossary Related Terms with Relation Types', () => {
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

      await sidebarClick(page, SidebarItem.GLOSSARY);
      await selectActiveGlossary(page, glossary.data.displayName);
      await selectActiveGlossaryTerm(
        page,
        term1.responseData?.displayName ?? term1.data.displayName
      );

      await addRelatedTerms(page, [term2]);

      const relatedTermName =
        term2.responseData?.displayName ?? term2.data.displayName;
      const relatedContainer = page.getByTestId('related-term-container');
      await expect(relatedContainer).toBeVisible();
      await expect(relatedContainer.getByText(relatedTermName)).toBeVisible();
      await expect(relatedContainer.getByText('Related To')).toBeVisible();
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

      await sidebarClick(page, SidebarItem.GLOSSARY);
      await selectActiveGlossary(page, glossary.data.displayName);
      await selectActiveGlossaryTerm(
        page,
        term1.responseData?.displayName ?? term1.data.displayName
      );

      await addRelatedTerms(page, [term2], 'Synonym');

      const relatedTermName =
        term2.responseData?.displayName ?? term2.data.displayName;
      const relatedContainer = page.getByTestId('related-term-container');
      await expect(relatedContainer).toBeVisible();
      await expect(relatedContainer.getByText(relatedTermName)).toBeVisible();
      await expect(relatedContainer.getByText('Synonym')).toBeVisible();
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

      await sidebarClick(page, SidebarItem.GLOSSARY);
      await selectActiveGlossary(page, glossary.data.displayName);
      await selectActiveGlossaryTerm(
        page,
        term1.responseData?.displayName ?? term1.data.displayName
      );

      await addRelatedTerms(page, [term2], 'Broader');

      const relatedTermName =
        term2.responseData?.displayName ?? term2.data.displayName;
      const relatedContainer = page.getByTestId('related-term-container');
      await expect(relatedContainer).toBeVisible();
      await expect(relatedContainer.getByText(relatedTermName)).toBeVisible();
      await expect(relatedContainer.getByText('Broader')).toBeVisible();
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

      await sidebarClick(page, SidebarItem.GLOSSARY);
      await selectActiveGlossary(page, glossary.data.displayName);
      await selectActiveGlossaryTerm(
        page,
        term1.responseData?.displayName ?? term1.data.displayName
      );

      await page.getByTestId('related-term-add-button').click();

      const relationTypeSelect = page.getByTestId('relation-type-select');
      await expect(relationTypeSelect).toBeVisible();

      // Close any auto-opened tree dropdowns
      const openTreeDropdowns = page.locator('.async-tree-select-list-dropdown');
      if (await openTreeDropdowns.isVisible()) {
        await page.keyboard.press('Escape');
        await expect(openTreeDropdowns).not.toBeVisible();
      }

      await relationTypeSelect.locator('.ant-select-selector').click();

      // Use :visible chain pattern (never store :visible locators!)
      await expect(
        page
          .locator('.ant-select-dropdown:visible')
          .locator('.ant-select-item-option-content')
          .filter({ hasText: 'Related To' })
      ).toBeVisible();
      await expect(
        page
          .locator('.ant-select-dropdown:visible')
          .locator('.ant-select-item-option-content')
          .filter({ hasText: 'Synonym' })
      ).toBeVisible();
      await expect(
        page
          .locator('.ant-select-dropdown:visible')
          .locator('.ant-select-item-option-content')
          .filter({ hasText: 'Broader' })
      ).toBeVisible();
      await expect(
        page
          .locator('.ant-select-dropdown:visible')
          .locator('.ant-select-item-option-content')
          .filter({ hasText: 'Narrower' })
      ).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(page.locator('.ant-select-dropdown:visible')).not.toBeVisible();
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

      await sidebarClick(page, SidebarItem.GLOSSARY);
      await selectActiveGlossary(page, glossary.data.displayName);
      await selectActiveGlossaryTerm(
        page,
        term1.responseData?.displayName ?? term1.data.displayName
      );

      await addRelatedTerms(page, [term2], 'Synonym');

      await selectActiveGlossaryTerm(
        page,
        term2.responseData?.displayName ?? term2.data.displayName
      );
      await waitForAllLoadersToDisappear(page);

      const term1Name =
        term1.responseData?.displayName ?? term1.data.displayName;
      const relatedContainer = page.getByTestId('related-term-container');
      await expect(relatedContainer).toBeVisible();
      await expect(relatedContainer.getByText(term1Name)).toBeVisible();
      await expect(relatedContainer.getByText('Synonym')).toBeVisible();
    } finally {
      await term1.delete(apiContext);
      await term2.delete(apiContext);
      await glossary.delete(apiContext);
      await afterAction();
    }
  });

  test.skip('should verify inverse relation for asymmetric type (broader/narrower)', async ({
    page,
  }) => {
    const { apiContext, afterAction } = await getApiContext(page);
    const glossary = new Glossary();
    const term1 = new GlossaryTerm(glossary);
    const term2 = new GlossaryTerm(glossary);

    try {
      await glossary.create(apiContext);
      await term1.create(apiContext);
      await term2.create(apiContext);

      await sidebarClick(page, SidebarItem.GLOSSARY);
      await selectActiveGlossary(page, glossary.data.displayName);
      await selectActiveGlossaryTerm(page, term1.data.displayName);

      await addRelatedTerms(page, [term2], 'Broader');

      const relatedContainer1 = page.getByTestId('related-term-container');
      await expect(relatedContainer1.getByText('Broader')).toBeVisible();

      await selectActiveGlossaryTerm(page, term2.data.displayName);
      await waitForAllLoadersToDisappear(page);

      const term1Name = term1.responseData?.displayName;
      const relatedContainer2 = page.getByTestId('related-term-container');
      await expect(relatedContainer2.getByText(term1Name)).toBeVisible();
      await expect(relatedContainer2.getByText('Narrower')).toBeVisible();
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

      await sidebarClick(page, SidebarItem.GLOSSARY);
      await selectActiveGlossary(page, glossary.data.displayName);
      await selectActiveGlossaryTerm(
        page,
        term1.responseData?.displayName ?? term1.data.displayName
      );

      await addRelatedTerms(page, [term2], 'Synonym');
      await addRelatedTerms(page, [term3], 'Broader');
      await addRelatedTerms(page, [term4]);

      await waitForAllLoadersToDisappear(page);

      const relatedContainer = page.getByTestId('related-term-container');
      await expect(relatedContainer).toBeVisible();

      await expect(relatedContainer.getByText('Synonym')).toBeVisible();
      await expect(relatedContainer.getByText('Broader')).toBeVisible();
      await expect(relatedContainer.getByText('Related To')).toBeVisible();

      const term2Name =
        term2.responseData?.displayName ?? term2.data.displayName;
      const term3Name =
        term3.responseData?.displayName ?? term3.data.displayName;
      const term4Name =
        term4.responseData?.displayName ?? term4.data.displayName;
      await expect(relatedContainer.getByText(term2Name)).toBeVisible();
      await expect(relatedContainer.getByText(term3Name)).toBeVisible();
      await expect(relatedContainer.getByText(term4Name)).toBeVisible();
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

      await sidebarClick(page, SidebarItem.GLOSSARY);
      await selectActiveGlossary(page, glossary.data.displayName);
      await selectActiveGlossaryTerm(
        page,
        term1.responseData?.displayName ?? term1.data.displayName
      );

      await addRelatedTerms(page, [term2], 'Synonym');

      const term2Name =
        term2.responseData?.displayName ?? term2.data.displayName;
      const relatedContainer = page.getByTestId('related-term-container');
      await expect(relatedContainer).toBeVisible();
      await expect(relatedContainer.getByText(term2Name)).toBeVisible();

      await relatedContainer.getByTestId('edit-button').click();

      const relationTypeSelect = page.getByTestId('relation-type-select');
      await expect(relationTypeSelect).toBeVisible();
      await relationTypeSelect.locator('.ant-select-selector').click();

      // Use :visible chain pattern
      const synonymOption = page
        .locator('.ant-select-dropdown:visible')
        .locator('.ant-select-item-option-content')
        .filter({ hasText: 'Synonym' });
      await expect(synonymOption).toBeVisible();
      await synonymOption.click();
      await expect(page.locator('.ant-select-dropdown:visible')).not.toBeVisible();

      const removeIcon = relatedContainer
        .locator('.ant-tag-close-icon, .ant-select-selection-item-remove')
        .first();
      await expect(removeIcon).toBeVisible();
      await removeIcon.click();

      const saveRes = page.waitForResponse('/api/v1/glossaryTerms/*');
      await page.getByTestId('saveAssociatedTag').click();
      await saveRes;

      await expect(relatedContainer.getByText(term2Name)).not.toBeVisible();

      await selectActiveGlossaryTerm(
        page,
        term2.responseData?.displayName ?? term2.data.displayName
      );
      await waitForAllLoadersToDisappear(page);

      const term1Name =
        term1.responseData?.displayName ?? term1.data.displayName;
      const term2RelatedContainer = page.getByTestId('related-term-container');
      await expect(term2RelatedContainer.getByText(term1Name)).not.toBeVisible();
    } finally {
      await term1.delete(apiContext);
      await term2.delete(apiContext);
      await glossary.delete(apiContext);
      await afterAction();
    }
  });
});
