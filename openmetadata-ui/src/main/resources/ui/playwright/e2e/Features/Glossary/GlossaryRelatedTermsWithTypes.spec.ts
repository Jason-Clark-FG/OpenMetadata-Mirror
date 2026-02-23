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

      // Add related term without specifying type (defaults to relatedTo)
      await addRelatedTerms(page, [term2]);

      // Verify related term is visible
      const relatedTermName =
        term2.responseData?.displayName ?? term2.data.displayName;
      const relatedContainer = page.getByTestId('related-term-container');
      await relatedContainer.waitFor({ state: 'visible' });
      await expect(relatedContainer.getByText(relatedTermName)).toBeVisible();

      // Verify relation type label is shown
      await expect(relatedContainer.getByText('Related To')).toBeVisible();
    } finally {
      await term1.delete(apiContext);
      await term2.delete(apiContext);
      await glossary.delete(apiContext);
      await afterAction();
    }
  });

  test('should add related term with synonym type', async ({ page }) => {
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

      // Add related term with synonym type
      await addRelatedTerms(page, [term2], 'Synonym');

      // Verify related term is visible
      const relatedTermName =
        term2.responseData?.displayName ?? term2.data.displayName;
      const relatedContainer = page.getByTestId('related-term-container');
      await relatedContainer.waitFor({ state: 'visible' });
      await expect(relatedContainer.getByText(relatedTermName)).toBeVisible();

      // Verify relation type label is shown
      await expect(relatedContainer.getByText('Synonym')).toBeVisible();
    } finally {
      await term1.delete(apiContext);
      await term2.delete(apiContext);
      await glossary.delete(apiContext);
      await afterAction();
    }
  });

  test('should add related term with broader type', async ({ page }) => {
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

      // Add related term with broader type
      await addRelatedTerms(page, [term2], 'Broader');

      // Verify related term is visible
      const relatedTermName =
        term2.responseData?.displayName ?? term2.data.displayName;
      const relatedContainer = page.getByTestId('related-term-container');
      await relatedContainer.waitFor({ state: 'visible' });
      await expect(relatedContainer.getByText(relatedTermName)).toBeVisible();

      // Verify relation type label is shown
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

      // Click add related term button
      await page.getByTestId('related-term-add-button').click();

      // Wait for the editing form to appear
      await page.waitForSelector('text=Relation Type', { timeout: 10000 });

      // Close any auto-opened tree dropdowns
      const openTreeDropdowns = page.locator('.async-tree-select-list-dropdown');
      if (await openTreeDropdowns.isVisible()) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
      }

      // Verify relation type selector is visible
      const relationTypeSelect = page.getByTestId('relation-type-select');
      await expect(relationTypeSelect).toBeVisible();

      // Click selector to open dropdown
      await relationTypeSelect.locator('.ant-select-selector').click({ force: true });

      // Wait for dropdown to appear
      const dropdown = page.locator('.ant-select-dropdown').last();
      await dropdown.waitFor({ state: 'visible', timeout: 5000 });

      // Verify options in dropdown (display names from API/settings)
      await expect(
        dropdown.locator('.ant-select-item-option-content').filter({ hasText: 'Related To' })
      ).toBeVisible();
      await expect(
        dropdown.locator('.ant-select-item-option-content').filter({ hasText: 'Synonym' })
      ).toBeVisible();
      await expect(
        dropdown.locator('.ant-select-item-option-content').filter({ hasText: 'Broader' })
      ).toBeVisible();
      await expect(
        dropdown.locator('.ant-select-item-option-content').filter({ hasText: 'Narrower' })
      ).toBeVisible();

      // Close dropdown and cancel
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
    } finally {
      await term1.delete(apiContext);
      await glossary.delete(apiContext);
      await afterAction();
    }
  });

  test('should verify bidirectional relation for symmetric type (synonym)', async ({
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
      await selectActiveGlossaryTerm(
        page,
        term1.responseData?.displayName ?? term1.data.displayName
      );

      // Add synonym relation from term1 to term2
      await addRelatedTerms(page, [term2], 'Synonym');

      // Navigate to term2 and verify term1 is shown as synonym
      await selectActiveGlossaryTerm(
        page,
        term2.responseData?.displayName ?? term2.data.displayName
      );

      // Wait for page to load
      const term1Name =
        term1.responseData?.displayName ?? term1.data.displayName;
      const relatedContainer = page.getByTestId('related-term-container');
      await relatedContainer.waitFor({ state: 'visible' });
      await expect(relatedContainer.getByText(term1Name)).toBeVisible();

      // Verify the relation type is Synonym on term2's page too
      await expect(relatedContainer.getByText('Synonym')).toBeVisible();
    } finally {
      await term1.delete(apiContext);
      await term2.delete(apiContext);
      await glossary.delete(apiContext);
      await afterAction();
    }
  });

  // Skip: Inverse relation display is not yet implemented in the backend/UI
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

      // Add broader relation from term1 to term2
      // This means term2 is broader than term1
      await addRelatedTerms(page, [term2], 'Broader');

      // Verify on term1's page it shows "Broader" with term2
      const relatedContainer1 = page.getByTestId('related-term-container');
      await expect(relatedContainer1.getByText('Broader')).toBeVisible();

      // Navigate to term2 and verify term1 is shown with "Narrower"
      await selectActiveGlossaryTerm(page, term2.data.displayName);
      await page.waitForLoadState('networkidle');

      const term1Name = term1.responseData?.displayName;
      const relatedContainer2 = page.getByTestId('related-term-container');
      await expect(relatedContainer2.getByText(term1Name)).toBeVisible();

      // Verify the inverse relation type "Narrower" is shown on term2's page
      await expect(relatedContainer2.getByText('Narrower')).toBeVisible();
    } finally {
      await term1.delete(apiContext);
      await term2.delete(apiContext);
      await glossary.delete(apiContext);
      await afterAction();
    }
  });

  test('should display relations grouped by type', async ({ page }) => {
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

      // Add relations via UI since the API endpoint may not exist yet
      await sidebarClick(page, SidebarItem.GLOSSARY);
      await selectActiveGlossary(page, glossary.data.displayName);
      await selectActiveGlossaryTerm(
        page,
        term1.responseData?.displayName ?? term1.data.displayName
      );

      // Add synonym relation
      await addRelatedTerms(page, [term2], 'Synonym');

      // Add broader relation
      await addRelatedTerms(page, [term3], 'Broader');

      // Add relatedTo relation (default type)
      await addRelatedTerms(page, [term4]);

      // Wait for page to stabilize
      await page.waitForLoadState('networkidle');

      // Verify relations are grouped by type in the related terms container
      const relatedContainer = page.getByTestId('related-term-container');
      await relatedContainer.waitFor({ state: 'visible' });

      // Check for relation type labels
      await expect(relatedContainer.getByText('Synonym')).toBeVisible();
      await expect(relatedContainer.getByText('Broader')).toBeVisible();
      await expect(relatedContainer.getByText('Related To')).toBeVisible();

      // Verify terms are visible (by their display names in the UI)
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

      // Add synonym relation
      await addRelatedTerms(page, [term2], 'Synonym');

      // Verify relation exists
      const term2Name =
        term2.responseData?.displayName ?? term2.data.displayName;
      const relatedContainer = page.getByTestId('related-term-container');
      await relatedContainer.waitFor({ state: 'visible' });
      await expect(relatedContainer.getByText(term2Name)).toBeVisible();

      // Click edit button to enter edit mode
      await relatedContainer.getByTestId('edit-button').click();

      // Wait for edit form; relation type defaults to 'relatedTo' - switch to Synonym to see term2
      const relationTypeSelect = page.getByTestId('relation-type-select');
      await relationTypeSelect.waitFor({ state: 'visible', timeout: 5000 });
      await relationTypeSelect.locator('.ant-select-selector').click({ force: true });
      await page.locator('.ant-select-dropdown').last().waitFor({ state: 'visible' });
      await page
        .locator('.ant-select-item-option-content')
        .filter({ hasText: 'Synonym' })
        .first()
        .click();

      // Remove the selected term tag (Ant Design Select/TreeSelect remove icon)
      const removeIcon = relatedContainer
        .locator('.ant-tag-close-icon')
        .or(relatedContainer.locator('.ant-select-selection-item-remove'))
        .first();
      await removeIcon.click();

      // Save the changes
      const saveRes = page.waitForResponse('/api/v1/glossaryTerms/*');
      await page.getByTestId('saveAssociatedTag').click();
      await saveRes;

      // Verify relation removed from term1's page - the term should no longer appear
      await expect(relatedContainer.getByText(term2Name)).not.toBeVisible();

      // Navigate to term2 and verify term1 is also removed
      await selectActiveGlossaryTerm(
        page,
        term2.responseData?.displayName ?? term2.data.displayName
      );
      await page.waitForLoadState('networkidle');

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
