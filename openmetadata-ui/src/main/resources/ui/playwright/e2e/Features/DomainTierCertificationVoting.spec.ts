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
import { test as base, expect, Page } from '@playwright/test';
import { DataProduct } from '../../support/domain/DataProduct';
import { Domain } from '../../support/domain/Domain';
import { TagClass } from '../../support/tag/TagClass';
import { UserClass } from '../../support/user/UserClass';
import { performAdminLogin } from '../../utils/admin';
import {
  clickOutside,
  readElementInListWithScroll,
  redirectToHomePage,
} from '../../utils/common';
import {
  assignTier,
  downVote,
  getEncodedFqn,
  upVote,
} from '../../utils/entity';

const adminUser = new UserClass();
const testUser = new UserClass();
const domain = new Domain();
const dataProduct = new DataProduct([domain]);
const certTag1 = new TagClass({ classification: 'Certification' });
const certTag2 = new TagClass({ classification: 'Certification' });

const test = base.extend<{
  page: Page;
  userPage: Page;
}>({
  page: async ({ browser }, use) => {
    const adminPage = await browser.newPage();
    try {
      await adminUser.login(adminPage);
      await use(adminPage);
    } finally {
      await adminPage.close();
    }
  },
  userPage: async ({ browser }, use) => {
    const page = await browser.newPage();
    try {
      await testUser.login(page);
      await use(page);
    } finally {
      await page.close();
    }
  },
});

const assignCertificationForWidget = async (
  page: Page,
  certification: TagClass,
  endpoint: string
) => {
  await page.getByTestId('edit-certification').click();

  await page.waitForSelector('.certification-card-popover', {
    state: 'visible',
  });
  await page.waitForSelector('[data-testid="loader"]', { state: 'detached' });

  await readElementInListWithScroll(
    page,
    page.getByTestId(
      `radio-btn-${certification.responseData.fullyQualifiedName}`
    ),
    page.locator('[data-testid="certification-cards"] .ant-radio-group')
  );

  await page
    .getByTestId(`radio-btn-${certification.responseData.fullyQualifiedName}`)
    .click();

  const patchRequest = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/v1/${endpoint}`) &&
      response.request().method() === 'PATCH'
  );
  await page.getByTestId('update-certification').click();

  const patchResponse = await patchRequest;
  expect(patchResponse.status()).toBe(200);

  await page.waitForSelector('[data-testid="loader"]', { state: 'detached' });
  await clickOutside(page);

  await expect(page.getByTestId('certification-label')).toContainText(
    certification.responseData.displayName
  );
};

const visitDomainPage = async (page: Page) => {
  await page.goto(
    `/domain/${getEncodedFqn(domain.responseData.fullyQualifiedName ?? '')}`
  );
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('[data-testid="loader"]', { state: 'detached' });
};

const visitDataProductPage = async (page: Page) => {
  await page.goto(
    `/dataProduct/${getEncodedFqn(dataProduct.responseData.fullyQualifiedName ?? '')}`
  );
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('[data-testid="loader"]', { state: 'detached' });
};

/**
 * Custom removeTier that asserts the no-data placeholder instead of '--'.
 * The built-in removeTier helper asserts '--' but our Domain/DataProduct
 * widgets show descriptive placeholder text.
 */
const removeTierFromWidget = async (page: Page, endpoint: string) => {
  await page.getByTestId('edit-tier').click();
  await page.waitForSelector('[data-testid="loader"]', { state: 'detached' });

  const patchRequest = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/v1/${endpoint}`) &&
      response.request().method() === 'PATCH'
  );
  await page.getByTestId('clear-tier').click();

  const response = await patchRequest;
  expect(response.status()).toBe(200);

  await page.waitForSelector('[data-testid="loader"]', { state: 'detached' });
  await clickOutside(page);

  await expect(
    page.locator('[data-testid="Tier"].no-data-placeholder')
  ).toBeVisible();
};

/**
 * Custom removeCertification that asserts the no-data placeholder instead of '--'.
 */
const removeCertificationFromWidget = async (
  page: Page,
  endpoint: string
) => {
  await page.getByTestId('edit-certification').click();
  await page.waitForSelector('.certification-card-popover', {
    state: 'visible',
  });
  await page.waitForSelector('[data-testid="loader"]', { state: 'detached' });

  const patchRequest = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/v1/${endpoint}`) &&
      response.request().method() === 'PATCH'
  );
  await page.getByTestId('clear-certification').click();

  const response = await patchRequest;
  expect(response.status()).toBe(200);

  await page.waitForSelector('[data-testid="loader"]', { state: 'detached' });
  await clickOutside(page);

  await expect(
    page.locator('[data-testid="certification-label"] .no-data-placeholder')
  ).toBeVisible();
};

test.describe('Domain & DataProduct - Tier, Certification, and Voting', () => {
  test.beforeAll('Setup pre-requests', async ({ browser }) => {
    const { apiContext, afterAction } = await performAdminLogin(browser);
    await adminUser.create(apiContext);
    await adminUser.setAdminRole(apiContext);
    await testUser.create(apiContext);
    await domain.create(apiContext);
    await dataProduct.create(apiContext);
    await certTag1.create(apiContext);
    await certTag2.create(apiContext);
    await afterAction();
  });

  test.afterAll('Cleanup', async ({ browser }) => {
    const { apiContext, afterAction } = await performAdminLogin(browser);
    await domain.delete(apiContext);
    await certTag1.delete(apiContext);
    await certTag2.delete(apiContext);
    await adminUser.delete(apiContext);
    await testUser.delete(apiContext);
    await afterAction();
  });

  test.describe('Admin operations', () => {
    test.beforeEach(async ({ page }) => {
      await redirectToHomePage(page);
    });

    test('Domain - Tier assign, update, and remove', async ({ page }) => {
      await visitDomainPage(page);
      await assignTier(page, 'Tier1', domain.endpoint);
      await assignTier(page, 'Tier3', domain.endpoint);
      await removeTierFromWidget(page, domain.endpoint);
    });

    test('Domain - Certification assign, update, and remove', async ({
      page,
    }) => {
      await visitDomainPage(page);
      await assignCertificationForWidget(page, certTag1, domain.endpoint);
      await assignCertificationForWidget(page, certTag2, domain.endpoint);
      await removeCertificationFromWidget(page, domain.endpoint);
    });

    test('Domain - UpVote and DownVote', async ({ page }) => {
      await visitDomainPage(page);
      await upVote(page, domain.endpoint);
      await downVote(page, domain.endpoint);
    });

    test('DataProduct - Tier assign, update, and remove', async ({ page }) => {
      await visitDataProductPage(page);
      await assignTier(page, 'Tier1', dataProduct.endpoint);
      await assignTier(page, 'Tier3', dataProduct.endpoint);
      await removeTierFromWidget(page, dataProduct.endpoint);
    });

    test('DataProduct - Certification assign, update, and remove', async ({
      page,
    }) => {
      await visitDataProductPage(page);
      await assignCertificationForWidget(page, certTag1, dataProduct.endpoint);
      await assignCertificationForWidget(page, certTag2, dataProduct.endpoint);
      await removeCertificationFromWidget(page, dataProduct.endpoint);
    });

    test('DataProduct - UpVote and DownVote', async ({ page }) => {
      await visitDataProductPage(page);
      await upVote(page, dataProduct.endpoint);
      await downVote(page, dataProduct.endpoint);
    });
  });

  test.describe('Non-admin permissions', () => {
    test.beforeEach(async ({ userPage }) => {
      await redirectToHomePage(userPage);
    });

    test('Non-admin cannot edit tier and certification on Domain', async ({
      userPage,
    }) => {
      await visitDomainPage(userPage);
      await userPage.waitForLoadState('networkidle');

      await expect(
        userPage.getByTestId('edit-tier')
      ).not.toBeVisible();
      await expect(
        userPage.getByTestId('edit-certification')
      ).not.toBeVisible();
    });

    test('Non-admin can vote on Domain', async ({ userPage }) => {
      await visitDomainPage(userPage);
      await userPage.waitForLoadState('networkidle');

      await expect(userPage.getByTestId('up-vote-btn')).toBeVisible();
      await expect(userPage.getByTestId('down-vote-btn')).toBeVisible();
    });

    test('Non-admin cannot edit tier and certification on DataProduct', async ({
      userPage,
    }) => {
      await visitDataProductPage(userPage);
      await userPage.waitForLoadState('networkidle');

      await expect(
        userPage.getByTestId('edit-tier')
      ).not.toBeVisible();
      await expect(
        userPage.getByTestId('edit-certification')
      ).not.toBeVisible();
    });

    test('Non-admin can vote on DataProduct', async ({ userPage }) => {
      await visitDataProductPage(userPage);
      await userPage.waitForLoadState('networkidle');

      await expect(userPage.getByTestId('up-vote-btn')).toBeVisible();
      await expect(userPage.getByTestId('down-vote-btn')).toBeVisible();
    });
  });
});
