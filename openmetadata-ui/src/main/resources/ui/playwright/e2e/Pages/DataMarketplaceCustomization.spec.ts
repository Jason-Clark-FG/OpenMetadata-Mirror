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
import { expect } from '@playwright/test';
import { DataProduct } from '../../support/domain/DataProduct';
import { Domain } from '../../support/domain/Domain';
import { PersonaClass } from '../../support/persona/PersonaClass';
import { test } from '../fixtures/pages';
import { performAdminLogin } from '../../utils/admin';
import { redirectToHomePage } from '../../utils/common';
import { setUserDefaultPersona } from '../../utils/customizeLandingPage';
import { navigateToMarketplace } from '../../utils/dataMarketplace';
import { waitForAllLoadersToDisappear } from '../../utils/entity';

const domain = new Domain();
const dp = new DataProduct([domain]);
const persona = new PersonaClass();
let adminUserId: string;
let personaSetOnServer = false;

test.describe(
  'Data Marketplace - Customization',
  { tag: ['@Pages', '@Discovery'] },
  () => {
    test.describe.configure({ mode: 'serial' });

    test.beforeAll('Setup entities', async ({ browser }) => {
      const { apiContext, afterAction } =
        await performAdminLogin(browser);

      await domain.create(apiContext);
      await dp.create(apiContext);

      const currentUserResponse = await apiContext.get(
        '/api/v1/users/loggedInUser'
      );
      const currentUser = await currentUserResponse.json();
      adminUserId = currentUser.id;

      await persona.create(apiContext, [adminUserId]);

      await afterAction();
    });

    test.afterAll('Cleanup entities', async ({ browser }) => {
      const { apiContext, afterAction } = await performAdminLogin(browser);

      await persona.delete(apiContext);
      await dp.delete(apiContext);
      await domain.delete(apiContext);

      await afterAction();
    });

    test('Set persona and verify customize button navigates to customization page', async ({
      page,
    }) => {
      test.slow();

      await test.step('Set default persona via UI', async () => {
        await redirectToHomePage(page);
        await setUserDefaultPersona(
          page,
          persona.responseData.displayName
        );
        personaSetOnServer = true;
      });

      await test.step('Navigate to marketplace', async () => {
        await navigateToMarketplace(page);
      });

      await test.step(
        'Click customize button and verify navigation',
        async () => {
          const customizeBtn = page.getByTestId(
            'customize-marketplace-btn'
          );
          await expect(customizeBtn).toBeVisible();
          await customizeBtn.click();
          await page.waitForURL('**/customize-page/**/DataMarketplace');
        }
      );

      await test.step('Verify customization page loaded', async () => {
        await expect(page.getByTestId('save-button')).toBeVisible();
        await expect(page.getByTestId('reset-button')).toBeVisible();
        await expect(
          page.getByTestId('customize-landing-page-header')
        ).toBeVisible();
      });
    });

    test('Default widget order is correct on customization page', async ({
      page,
    }) => {
      test.slow();

      await test.step('Set persona and navigate to customization page', async () => {
        await redirectToHomePage(page);
        if (!personaSetOnServer) {
          await setUserDefaultPersona(
            page,
            persona.responseData.displayName
          );
          personaSetOnServer = true;
        }
        await navigateToMarketplace(page);
        await page.getByTestId('customize-marketplace-btn').click();
        await page.waitForURL('**/customize-page/**/DataMarketplace');
        await waitForAllLoadersToDisappear(page);
      });

      await test.step('Verify widgets are present', async () => {
        await expect(
          page.getByTestId('marketplace-dp-widget')
        ).toBeVisible();
        await expect(
          page.getByTestId('marketplace-domains-widget')
        ).toBeVisible();
      });

      await test.step(
        'Verify Data Products widget appears before Domains widget',
        async () => {
          const dpWidget = page.getByTestId('marketplace-dp-widget');
          const domainsWidget = page.getByTestId(
            'marketplace-domains-widget'
          );

          const dpBox = await dpWidget.boundingBox();
          const domainsBox = await domainsWidget.boundingBox();

          expect(dpBox).not.toBeNull();
          expect(domainsBox).not.toBeNull();
          expect(dpBox!.y).toBeLessThan(domainsBox!.y);
        }
      );
    });

    test('Drag-and-drop reorders widgets and save persists', async ({
      page,
    }) => {
      test.slow();

      await test.step('Set persona and navigate to customization page', async () => {
        await redirectToHomePage(page);
        if (!personaSetOnServer) {
          await setUserDefaultPersona(
            page,
            persona.responseData.displayName
          );
          personaSetOnServer = true;
        }
        await navigateToMarketplace(page);
        await page.getByTestId('customize-marketplace-btn').click();
        await page.waitForURL('**/customize-page/**/DataMarketplace');
        await waitForAllLoadersToDisappear(page);
      });

      await test.step(
        'Drag Domains widget above Data Products widget',
        async () => {
          const widgets = page.locator('.marketplace-draggable-header');
          const firstWidget = widgets.nth(0);
          const secondWidget = widgets.nth(1);

          const firstBox = await firstWidget.boundingBox();
          const secondBox = await secondWidget.boundingBox();

          expect(firstBox).not.toBeNull();
          expect(secondBox).not.toBeNull();

          await secondWidget.dragTo(firstWidget);
        }
      );

      await test.step('Save the layout', async () => {
        const saveButton = page.getByTestId('save-button');
        await expect(saveButton).toBeEnabled();

        const saveResponse = page.waitForResponse(
          (response) =>
            response.url().includes('/api/v1/docStore') &&
            (response.status() === 200 || response.status() === 201)
        );
        await saveButton.click();
        await saveResponse;
      });

      await test.step(
        'Navigate to marketplace and verify order persisted',
        async () => {
          await navigateToMarketplace(page);

          const dpWidget = page.getByTestId('marketplace-dp-widget');
          const domainsWidget = page.getByTestId(
            'marketplace-domains-widget'
          );

          await expect(dpWidget).toBeVisible();
          await expect(domainsWidget).toBeVisible();

          const dpBox = await dpWidget.boundingBox();
          const domainsBox = await domainsWidget.boundingBox();

          expect(dpBox).not.toBeNull();
          expect(domainsBox).not.toBeNull();
          expect(domainsBox!.y).toBeLessThan(dpBox!.y);
        }
      );
    });

    test('Reset restores default widget order', async ({ page }) => {
      test.slow();

      await test.step('Set persona and navigate to customization page', async () => {
        await redirectToHomePage(page);
        if (!personaSetOnServer) {
          await setUserDefaultPersona(
            page,
            persona.responseData.displayName
          );
          personaSetOnServer = true;
        }
        await navigateToMarketplace(page);
        await page.getByTestId('customize-marketplace-btn').click();
        await page.waitForURL('**/customize-page/**/DataMarketplace');
        await waitForAllLoadersToDisappear(page);
      });

      await test.step('Click reset and confirm in modal', async () => {
        await page.getByTestId('reset-button').click();

        const modalConfirmBtn = page.getByTestId(
          'unsaved-changes-modal-save'
        );
        await expect(modalConfirmBtn).toBeVisible();

        const resetResponse = page.waitForResponse(
          (response) =>
            response.url().includes('/api/v1/docStore') &&
            (response.status() === 200 || response.status() === 201)
        );
        await modalConfirmBtn.click();
        await resetResponse;
      });

      await test.step(
        'Navigate to marketplace and verify default order restored',
        async () => {
          await navigateToMarketplace(page);

          const dpWidget = page.getByTestId('marketplace-dp-widget');
          const domainsWidget = page.getByTestId(
            'marketplace-domains-widget'
          );

          await expect(dpWidget).toBeVisible();
          await expect(domainsWidget).toBeVisible();

          const dpBox = await dpWidget.boundingBox();
          const domainsBox = await domainsWidget.boundingBox();

          expect(dpBox).not.toBeNull();
          expect(domainsBox).not.toBeNull();
          expect(dpBox!.y).toBeLessThan(domainsBox!.y);
        }
      );
    });
  }
);
