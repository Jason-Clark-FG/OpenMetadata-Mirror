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
import { Glossary } from '../../../support/glossary/Glossary';
import { GlossaryTerm } from '../../../support/glossary/GlossaryTerm';
import { performAdminLogin } from '../../../utils/admin';
import { redirectToHomePage } from '../../../utils/common';
import { waitForAllLoadersToDisappear } from '../../../utils/entity';

test.use({
  storageState: 'playwright/.auth/admin.json',
});

const glossary1 = new Glossary();
const glossary2 = new Glossary();
const term1 = new GlossaryTerm(glossary1);
const term2 = new GlossaryTerm(glossary2);

test.describe(
  'Ontology Explorer',
  { tag: ['@Governance', '@Glossary'] },
  () => {
    test.beforeAll('Setup glossaries and terms', async ({ browser }) => {
      const { apiContext, afterAction } = await performAdminLogin(browser);

      await glossary1.create(apiContext);
      await term1.create(apiContext);
      await glossary2.create(apiContext);
      await term2.create(apiContext);

      await afterAction();
    });

    test.afterAll('Cleanup glossaries and terms', async ({ browser }) => {
      const { apiContext, afterAction } = await performAdminLogin(browser);

      await term1.delete(apiContext);
      await glossary1.delete(apiContext);
      await term2.delete(apiContext);
      await glossary2.delete(apiContext);

      await afterAction();
    });

    test.beforeEach(async ({ page }) => {
      await redirectToHomePage(page);
    });

    test('should load the Ontology Explorer page with header and toolbar', async ({
      page,
    }) => {
      test.slow();

      const graphDataResponse = page.waitForResponse(
        (r) =>
          r.url().includes('/api/v1/glossaryTerms') ||
          r.url().includes('/api/v1/rdf')
      );

      await page.goto('/governance/ontology');
      await graphDataResponse;
      await waitForAllLoadersToDisappear(page);

      await test.step('Verify page header', async () => {
        await expect(
          page.getByTestId('ontology-explorer-header')
        ).toBeVisible();
        await expect(
          page.getByTestId('ontology-explorer-header')
        ).toContainText('Ontology Explorer');
      });

      await test.step('Verify filter toolbar is rendered', async () => {
        await expect(
          page.getByTestId('ontology-filter-toolbar')
        ).toBeVisible();
      });

      await test.step('Verify control buttons are rendered', async () => {
        await expect(page.getByTestId('zoom-in')).toBeVisible();
        await expect(page.getByTestId('zoom-out')).toBeVisible();
        await expect(page.getByTestId('refresh')).toBeVisible();
        await expect(page.getByTestId('toggle-minimap')).toBeVisible();
        await expect(page.getByTestId('view-options')).toBeVisible();
      });

      await test.step('Verify graph settings button is rendered', async () => {
        await expect(
          page.getByTestId('ontology-graph-settings')
        ).toBeVisible();
      });

      await test.step('Verify Quick Add button is rendered', async () => {
        await expect(
          page.getByTestId('ontology-quick-add-button')
        ).toBeVisible();
      });
    });

    test('should display graph with glossary nodes after loading', async ({
      page,
    }) => {
      test.slow();

      await page.goto('/governance/ontology');

      await expect(page.getByTestId('ontology-graph-loading')).toBeVisible();

      const glossaryTermsResponse = page.waitForResponse(
        (r) =>
          (r.url().includes('/api/v1/glossaryTerms') ||
            r.url().includes('/api/v1/glossaries')) &&
          r.status() === 200
      );
      await glossaryTermsResponse;
      await waitForAllLoadersToDisappear(page);

      await expect(
        page.getByTestId('ontology-graph-loading')
      ).not.toBeVisible();

      await expect(
        page.getByTestId('ontology-explorer-stats')
      ).toBeVisible();
    });

    test('should filter graph by view modes in the toolbar', async ({
      page,
    }) => {
      test.slow();

      const graphResponse = page.waitForResponse(
        (r) =>
          (r.url().includes('/api/v1/glossaryTerms') ||
            r.url().includes('/api/v1/glossaries')) &&
          r.status() === 200
      );
      await page.goto('/governance/ontology');
      await graphResponse;
      await waitForAllLoadersToDisappear(page);

      await test.step('Switch to Hierarchy view mode', async () => {
        await page
          .getByTestId('ontology-view-mode-tabs')
          .getByRole('button', { name: 'Hierarchy' })
          .click();

        await expect(
          page
            .getByTestId('ontology-view-mode-tabs')
            .getByRole('button', { name: 'Hierarchy' })
        ).toHaveAttribute('aria-pressed', 'true');
      });

      await test.step('Switch to Related view mode', async () => {
        await page
          .getByTestId('ontology-view-mode-tabs')
          .getByRole('button', { name: 'Related' })
          .click();

        await expect(
          page
            .getByTestId('ontology-view-mode-tabs')
            .getByRole('button', { name: 'Related' })
        ).toHaveAttribute('aria-pressed', 'true');
      });

      await test.step('Switch back to Overview view mode', async () => {
        await page
          .getByTestId('ontology-view-mode-tabs')
          .getByRole('button', { name: 'Overview' })
          .click();

        await expect(
          page
            .getByTestId('ontology-view-mode-tabs')
            .getByRole('button', { name: 'Overview' })
        ).toHaveAttribute('aria-pressed', 'true');
      });
    });

    test('should toggle isolated nodes and cross-glossary filters', async ({
      page,
    }) => {
      test.slow();

      const graphResponse = page.waitForResponse(
        (r) =>
          (r.url().includes('/api/v1/glossaryTerms') ||
            r.url().includes('/api/v1/glossaries')) &&
          r.status() === 200
      );
      await page.goto('/governance/ontology');
      await graphResponse;
      await waitForAllLoadersToDisappear(page);

      await test.step('Toggle isolated nodes off', async () => {
        const isolatedToggle = page.getByTestId('ontology-isolated-toggle');
        await expect(isolatedToggle).toBeVisible();
        await isolatedToggle.click();
      });

      await test.step('Toggle cross-glossary filter on', async () => {
        const crossGlossaryToggle = page.getByTestId(
          'ontology-cross-glossary-toggle'
        );
        await expect(crossGlossaryToggle).toBeVisible();
        await crossGlossaryToggle.click();
      });

      await test.step('Clear filters button appears and resets filters', async () => {
        const clearFiltersBtn = page.getByTestId('ontology-clear-filters');
        await expect(clearFiltersBtn).toBeVisible();
        await clearFiltersBtn.click();

        await expect(clearFiltersBtn).not.toBeVisible();
      });
    });

    test('should open and close the graph settings panel', async ({ page }) => {
      test.slow();

      const graphResponse = page.waitForResponse(
        (r) =>
          (r.url().includes('/api/v1/glossaryTerms') ||
            r.url().includes('/api/v1/glossaries')) &&
          r.status() === 200
      );
      await page.goto('/governance/ontology');
      await graphResponse;
      await waitForAllLoadersToDisappear(page);

      const settingsButton = page.getByTestId('ontology-graph-settings');
      await expect(settingsButton).toBeVisible();
      await settingsButton.click();

      await expect(page.getByText('Force Directed')).toBeVisible();
      await expect(page.getByText('By Glossary')).toBeVisible();

      await page.keyboard.press('Escape');
    });

    test('should toggle minimap visibility', async ({ page }) => {
      test.slow();

      const graphResponse = page.waitForResponse(
        (r) =>
          (r.url().includes('/api/v1/glossaryTerms') ||
            r.url().includes('/api/v1/glossaries')) &&
          r.status() === 200
      );
      await page.goto('/governance/ontology');
      await graphResponse;
      await waitForAllLoadersToDisappear(page);

      const minimapButton = page.getByTestId('toggle-minimap');
      await expect(minimapButton).toBeVisible();
      await minimapButton.click();

      await expect(page.locator('.react-flow__minimap')).toBeVisible();

      await minimapButton.click();

      await expect(
        page.locator('.react-flow__minimap')
      ).not.toBeVisible();
    });

    test('should click a node and show the details panel', async ({ page }) => {
      test.slow();

      const graphResponse = page.waitForResponse(
        (r) =>
          (r.url().includes('/api/v1/glossaryTerms') ||
            r.url().includes('/api/v1/glossaries')) &&
          r.status() === 200
      );
      await page.goto('/governance/ontology');
      await graphResponse;
      await waitForAllLoadersToDisappear(page);

      await page.waitForSelector(
        `[data-testid="ontology-node-${term1.responseData.id}"]`,
        { state: 'visible', timeout: 15000 }
      );

      await page
        .getByTestId(`ontology-node-${term1.responseData.id}`)
        .click();

      await expect(
        page.getByTestId('ontology-details-panel')
      ).toBeVisible();

      await expect(
        page.getByTestId('details-panel-title')
      ).toContainText(term1.data.displayName);

      await test.step('Verify details panel has close button', async () => {
        const closeButton = page.getByTestId('details-panel-close-button');
        await expect(closeButton).toBeVisible();
        await closeButton.click();

        await expect(
          page.getByTestId('ontology-details-panel')
        ).not.toBeVisible();
      });
    });

    test('should filter by glossary scope and show only selected glossary terms', async ({
      page,
    }) => {
      test.slow();

      const graphResponse = page.waitForResponse(
        (r) =>
          (r.url().includes('/api/v1/glossaryTerms') ||
            r.url().includes('/api/v1/glossaries')) &&
          r.status() === 200
      );
      await page.goto('/governance/ontology');
      await graphResponse;
      await waitForAllLoadersToDisappear(page);

      const scopeSelect = page.getByTestId('ontology-glossary-scope-select');
      await expect(scopeSelect).toBeVisible();

      await scopeSelect.click();

      const glossaryOption = page
        .locator('.ant-select-dropdown:visible')
        .getByText(glossary1.data.displayName);
      await expect(glossaryOption).toBeVisible();
      await glossaryOption.click();

      await expect(page.locator('.ant-select-dropdown:visible')).not.toBeVisible();

      await waitForAllLoadersToDisappear(page);

      await expect(
        page.getByTestId(`ontology-node-${term1.responseData.id}`)
      ).toBeVisible();
    });

    test('should add a relation between glossary terms using Quick Add', async ({
      page,
    }) => {
      test.slow();

      const graphResponse = page.waitForResponse(
        (r) =>
          (r.url().includes('/api/v1/glossaryTerms') ||
            r.url().includes('/api/v1/glossaries')) &&
          r.status() === 200
      );
      await page.goto('/governance/ontology');
      await graphResponse;
      await waitForAllLoadersToDisappear(page);

      await page.waitForSelector(
        `[data-testid="ontology-node-${term1.responseData.id}"]`,
        { state: 'visible', timeout: 15000 }
      );

      await page
        .getByTestId(`ontology-node-${term1.responseData.id}`)
        .click();

      await expect(
        page.getByTestId('ontology-details-panel')
      ).toBeVisible();

      const addRelationButton = page.getByTestId(
        'details-panel-add-relation-button'
      );
      await expect(addRelationButton).toBeVisible();
      await addRelationButton.click();

      await expect(page.locator('.ant-modal')).toBeVisible();

      await page.keyboard.press('Escape');
    });

    test('should refresh the graph when refresh button is clicked', async ({
      page,
    }) => {
      test.slow();

      const graphResponse = page.waitForResponse(
        (r) =>
          (r.url().includes('/api/v1/glossaryTerms') ||
            r.url().includes('/api/v1/glossaries')) &&
          r.status() === 200
      );
      await page.goto('/governance/ontology');
      await graphResponse;
      await waitForAllLoadersToDisappear(page);

      const refreshButton = page.getByTestId('refresh');
      await expect(refreshButton).toBeVisible();

      const refreshResponse = page.waitForResponse(
        (r) =>
          (r.url().includes('/api/v1/glossaryTerms') ||
            r.url().includes('/api/v1/glossaries')) &&
          r.status() === 200
      );
      await refreshButton.click();
      await refreshResponse;
      await waitForAllLoadersToDisappear(page);

      await expect(
        page.getByTestId('ontology-filter-toolbar')
      ).toBeVisible();
    });
  }
);
