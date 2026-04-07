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
import { expect, Page } from '@playwright/test';
import { GlobalSettingOptions } from '../constant/settings';
import { redirectToHomePage } from './common';
import { getEncodedFqn, waitForAllLoadersToDisappear } from './entity';
import { settingClick } from './sidebar';

export const updatePersonaDisplayName = async ({
  page,
  displayName,
}: {
  page: Page;
  displayName: string;
}) => {
  await page.click('[data-testid="manage-button"]');

  await page.click(
    '[data-testid="manage-dropdown-list-container"] [data-testid="rename-button"]'
  );

  await page.locator('#name').waitFor({ state: 'visible' });

  await expect(page.locator('#name')).toBeDisabled();

  await page.locator('#displayName').waitFor({ state: 'visible' });
  await page.fill('#displayName', displayName);

  await page.click('[data-testid="save-button"]');
};

/**
 * Navigate to persona settings as admin
 */
export const navigateToPersonaSettings = async (page: Page) => {
  await redirectToHomePage(page);
  const listPersonas = page.waitForResponse('/api/v1/personas?*');
  await settingClick(page, GlobalSettingOptions.PERSONA);
  await listPersonas;
  await waitForAllLoadersToDisappear(page, 'skeleton-loader');
};

/**
 * Check if persona is present/absent in profile dropdown
 */
export const checkPersonaInProfile = async (
  page: Page,
  expectedPersonaName?: string
) => {
  await page.locator('[data-testid="dropdown-profile"] svg').click();
  await page.locator('[role="menu"].profile-dropdown').waitFor({
    state: 'visible',
  });
  await page.getByTestId('user-name').click();

  if (expectedPersonaName) {
    // Expect persona to be visible with specific name
    await expect(page.getByTestId('default-persona-chip')).toBeVisible();
    await expect(page.getByTestId('default-persona-chip')).toContainText(
      expectedPersonaName
    );
  } else {
    // Expect no persona to be visible
    await expect(page.getByText('No default persona')).toBeVisible();
  }
};

/**
 * Set a persona as default through the admin UI
 */
export const setPersonaAsDefault = async (page: Page) => {
  await page.getByTestId('manage-button').click();
  await page.getByTestId('set-as-default-button').click();

  const setAsDefaultResponse = page.waitForResponse('/api/v1/personas/*');
  const setAsDefaultConfirmationModal = page.getByTestId(
    'default-persona-confirmation-modal'
  );

  await setAsDefaultConfirmationModal.getByText('Yes').click();
  await setAsDefaultResponse;
};

export const navigateToPersonaWithPagination = async (
  page: Page,
  personaName: string,
  click = true,
  maxPages = 50
) => {
  let resolvedPersonaName = personaName;

  try {
    resolvedPersonaName = decodeURIComponent(personaName);
  } catch {
    resolvedPersonaName = personaName;
  }

  const personaDetailsPath = `/settings/${
    GlobalSettingOptions.PERSONA
  }/${getEncodedFqn(resolvedPersonaName)}#customize-ui`;

  if (click && resolvedPersonaName) {
    await page.goto(personaDetailsPath, { waitUntil: 'domcontentloaded' });
    await waitForAllLoadersToDisappear(page).catch(() => undefined);

    if (
      await page
        .getByRole('tab', { name: 'Customize UI' })
        .isVisible()
        .catch(() => false)
    ) {
      return;
    }

    await redirectToHomePage(page);
    const listPersonas = page.waitForResponse('/api/v1/personas?*');
    await settingClick(page, GlobalSettingOptions.PERSONA);
    await listPersonas.catch(() => undefined);
  }

  for (let currentPage = 0; currentPage < maxPages; currentPage++) {
    // Wait for the skeleton card loader to disappear first
    await waitForAllLoadersToDisappear(page, 'skeleton-card-loader');

    const locator = page.getByTestId(
      `persona-details-card-${resolvedPersonaName}`
    );

    // Check if element is visible on current page
    if (await locator.isVisible()) {
      if (click) {
        await locator.click();
        await page
          .waitForURL(`**${personaDetailsPath}`, { timeout: 30000 })
          .catch(() => undefined);
        await expect(
          page.getByRole('tab', { name: 'Customize UI' })
        ).toBeVisible();
      }

      return;
    }

    const nextBtn = page.locator('[data-testid="next"]');
    await nextBtn.waitFor({ state: 'visible' });

    const isDisabled =
      (await nextBtn.isDisabled().catch(() => true)) ||
      (await nextBtn.getAttribute('aria-disabled')) === 'true';

    if (isDisabled) {
      break;
    }

    const getPersonas = page
      .waitForResponse('/api/v1/personas*')
      .catch(() => undefined);
    const clickResult = await nextBtn
      .click({ timeout: 5000 })
      .then(() => 'clicked')
      .catch(async (error) => {
        const becameDisabled =
          (await nextBtn.isDisabled().catch(() => true)) ||
          (await nextBtn.getAttribute('aria-disabled')) === 'true';

        if (becameDisabled) {
          return 'disabled';
        }

        throw error;
      });

    if (clickResult === 'disabled') {
      break;
    }

    await getPersonas;
  }

  if (click && resolvedPersonaName) {
    await page.goto(personaDetailsPath, { waitUntil: 'domcontentloaded' });
    await waitForAllLoadersToDisappear(page).catch(() => undefined);
    await expect(page.getByRole('tab', { name: 'Customize UI' })).toBeVisible();

    return;
  }

  throw new Error(
    `Persona "${resolvedPersonaName}" was not found within ${maxPages} pages of the personas list.`
  );
};

/**
 * Remove persona default through the admin UI
 */
export const removePersonaDefault = async (
  page: Page,
  personaName?: string
) => {
  await navigateToPersonaWithPagination(page, personaName ?? '');

  await page.getByTestId('manage-button').click();
  await page.getByTestId('remove-default-button').click();

  const removeDefaultResponse = page.waitForResponse('/api/v1/personas/*');
  const removeDefaultConfirmationModal = page.getByTestId(
    'default-persona-confirmation-modal'
  );

  await removeDefaultConfirmationModal.getByText('Yes').click();
  await removeDefaultResponse;
};
