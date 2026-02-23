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
import test, { expect, Page } from '@playwright/test';
import { Glossary } from '../../support/glossary/Glossary';
import { GlossaryTerm } from '../../support/glossary/GlossaryTerm';
import {
  getApiContext,
  redirectToHomePage,
  uuid,
} from '../../utils/common';
import { waitForAllLoadersToDisappear } from '../../utils/entity';

test.use({
  storageState: 'playwright/.auth/admin.json',
});

test.describe('Glossary Term Relation Settings', () => {
  const navigateToRelationSettings = async (page: Page) => {
    await page.goto('/settings/governance/glossary-term-relations');
    await waitForAllLoadersToDisappear(page);
    await expect(
      page.getByTestId('relation-types-table')
    ).toBeVisible();
  };

  test.beforeEach(async ({ page }) => {
    await redirectToHomePage(page);
  });

  test('should display default relation types', async ({ page }) => {
    test.slow();
    await navigateToRelationSettings(page);

    await expect(page.getByTestId('relation-types-table')).toBeVisible();

    const defaultTypes = [
      'relatedTo',
      'synonym',
      'antonym',
      'broader',
      'narrower',
    ];
    for (const typeName of defaultTypes) {
      await expect(page.getByTestId(`relation-name-${typeName}`)).toBeVisible();
    }
  });

  test('should show system-defined lock icon for default types', async ({
    page,
  }) => {
    test.slow();
    await navigateToRelationSettings(page);

    await expect(
      page.getByTestId('system-defined-relatedTo')
    ).toBeVisible();

    await expect(page.getByTestId('edit-relatedTo-btn')).toBeDisabled();
  });

  test('should display usage counts for relation types', async ({ page }) => {
    test.slow();
    await navigateToRelationSettings(page);

    await expect(
      page.getByRole('columnheader', { name: 'Usage' })
    ).toBeVisible();

    await expect(page.getByTestId('usage-count-relatedTo')).toBeVisible();
  });

  test('should create a custom relation type', async ({ page }) => {
    test.slow();
    await navigateToRelationSettings(page);

    const customTypeName = `customType${uuid()}`;

    await page.getByTestId('add-relation-type-btn').click();

    await expect(page.getByTestId('relation-type-drawer')).toBeVisible();

    await page.getByTestId('name-input').fill(customTypeName);
    await page.getByTestId('display-name-input').fill('Custom Type Display');
    await page.getByTestId('description-input').fill('A custom relation type');

    await page.getByTestId('symmetric-switch').click();

    const saveResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/system/settings') &&
        response.request().method() === 'PUT'
    );
    await page.getByTestId('save-btn').click();
    const savedRes = await saveResponse;
    expect(savedRes.status()).toBe(200);

    await expect(page.getByTestId('relation-type-drawer')).not.toBeVisible();

    await expect(
      page.getByTestId(`relation-name-${customTypeName}`)
    ).toBeVisible();

    const deleteResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/system/settings') &&
        response.request().method() === 'PUT'
    );
    await page.getByTestId(`delete-${customTypeName}-btn`).click();
    const deletedRes = await deleteResponse;
    expect(deletedRes.status()).toBe(200);

    await expect(
      page.getByTestId(`relation-name-${customTypeName}`)
    ).not.toBeVisible();
  });

  test('should edit a custom relation type', async ({ page }) => {
    test.slow();
    await navigateToRelationSettings(page);

    const customTypeName = `editType${uuid()}`;

    await page.getByTestId('add-relation-type-btn').click();
    await expect(page.getByTestId('relation-type-drawer')).toBeVisible();

    await page.getByTestId('name-input').fill(customTypeName);
    await page.getByTestId('display-name-input').fill('Original Display');

    const createResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/system/settings') &&
        response.request().method() === 'PUT'
    );
    await page.getByTestId('save-btn').click();
    const createdRes = await createResponse;
    expect(createdRes.status()).toBe(200);

    await expect(page.getByTestId('relation-type-drawer')).not.toBeVisible();

    await page.getByTestId(`edit-${customTypeName}-btn`).click();

    await expect(page.getByTestId('relation-type-drawer')).toBeVisible();
    await expect(page.getByTestId('name-input')).toBeDisabled();
    await expect(page.getByTestId('display-name-input')).toHaveValue(
      'Original Display'
    );

    await page.getByTestId('display-name-input').clear();
    await page.getByTestId('display-name-input').fill('Updated Display');

    const updateResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/system/settings') &&
        response.request().method() === 'PUT'
    );
    await page.getByTestId('save-btn').click();
    const updatedRes = await updateResponse;
    expect(updatedRes.status()).toBe(200);

    await expect(page.getByTestId('relation-type-drawer')).not.toBeVisible();

    await expect(
      page.getByTestId(`relation-name-${customTypeName}`)
    ).toBeVisible();

    const deleteResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/system/settings') &&
        response.request().method() === 'PUT'
    );
    await page.getByTestId(`delete-${customTypeName}-btn`).click();
    await deleteResponse;
  });

  test('should prevent deletion of relation type in use', async ({ page }) => {
    test.slow();
    const { apiContext, afterAction } = await getApiContext(page);
    const glossary = new Glossary();
    const term1 = new GlossaryTerm(glossary);
    const term2 = new GlossaryTerm(glossary);

    try {
      await glossary.create(apiContext);
      await term1.create(apiContext);
      await term2.create(apiContext);

      await term1.patch(apiContext, [
        {
          op: 'add',
          path: '/relatedTerms/0',
          value: {
            id: term2.responseData.id,
            type: 'glossaryTerm',
            fullyQualifiedName: term2.responseData.fullyQualifiedName,
            relationType: 'relatedTo',
          },
        },
      ]);

      await navigateToRelationSettings(page);

      await expect(
        page.getByRole('columnheader', { name: 'Usage' })
      ).toBeVisible();

      await expect(page.getByTestId('edit-relatedTo-btn')).toBeDisabled();
    } finally {
      await term1.delete(apiContext);
      await term2.delete(apiContext);
      await glossary.delete(apiContext);
      await afterAction();
    }
  });

  test('should validate form fields when creating relation type', async ({
    page,
  }) => {
    test.slow();
    await navigateToRelationSettings(page);

    await page.getByTestId('add-relation-type-btn').click();

    await expect(page.getByTestId('relation-type-drawer')).toBeVisible();

    await page.getByTestId('save-btn').click();

    await expect(
      page.locator('.ant-form-item-explain-error').first()
    ).toBeVisible();

    await page.getByTestId('name-input').fill('123invalid');
    await page.getByTestId('display-name-input').fill('Display Name');

    await page.getByTestId('save-btn').click();

    await expect(
      page.locator('.ant-form-item-explain-error').first()
    ).toBeVisible();

    await page.getByTestId('cancel-btn').click();

    await expect(page.getByTestId('relation-type-drawer')).not.toBeVisible();
  });

  test('should cancel drawer without saving changes', async ({ page }) => {
    test.slow();
    await navigateToRelationSettings(page);

    const customTypeName = `cancelType${uuid()}`;

    await page.getByTestId('add-relation-type-btn').click();
    await page.getByTestId('name-input').fill(customTypeName);
    await page.getByTestId('display-name-input').fill('Cancel Test');

    await page.getByTestId('cancel-btn').click();

    await expect(page.getByTestId('relation-type-drawer')).not.toBeVisible();
    await expect(
      page.getByTestId(`relation-name-${customTypeName}`)
    ).not.toBeVisible();
  });
});
