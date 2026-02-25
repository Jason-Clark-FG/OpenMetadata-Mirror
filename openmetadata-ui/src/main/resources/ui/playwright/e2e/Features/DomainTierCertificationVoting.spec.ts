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
import { expect } from '@playwright/test';
import { DataProduct } from '../../support/domain/DataProduct';
import { Domain } from '../../support/domain/Domain';
import { TagClass } from '../../support/tag/TagClass';
import { performAdminLogin } from '../../utils/admin';
import { redirectToHomePage } from '../../utils/common';
import {
  assignCertificationForWidget,
  removeCertificationFromWidget,
  removeTierFromWidget,
} from '../../utils/domain';
import { assignTier, downVote, upVote } from '../../utils/entity';
import { test } from '../fixtures/pages';

const domain = new Domain();
const dataProduct = new DataProduct([domain]);
const certTag1 = new TagClass({ classification: 'Certification' });
const certTag2 = new TagClass({ classification: 'Certification' });

test.describe('Domain & DataProduct - Tier, Certification, and Voting', () => {
  test.beforeAll('Setup pre-requests', async ({ browser }) => {
    const { apiContext, afterAction } = await performAdminLogin(browser);
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
    await afterAction();
  });

  test.describe('Admin operations', () => {
    test.beforeEach(async ({ page }) => {
      await redirectToHomePage(page);
    });

    test('Domain - Tier assign, update, and remove', async ({ page }) => {
      await domain.visitEntityPage(page);
      await assignTier(page, 'Tier1', domain.endpoint);
      await assignTier(page, 'Tier3', domain.endpoint);
      await removeTierFromWidget(page, domain.endpoint);
    });

    test('Domain - Certification assign, update, and remove', async ({
      page,
    }) => {
      await domain.visitEntityPage(page);
      await assignCertificationForWidget(page, certTag1, domain.endpoint);
      await assignCertificationForWidget(page, certTag2, domain.endpoint);
      await removeCertificationFromWidget(page, domain.endpoint);
    });

    test('Domain - UpVote and DownVote', async ({ page }) => {
      await domain.visitEntityPage(page);
      await upVote(page, domain.endpoint);
      await downVote(page, domain.endpoint);
    });

    test('DataProduct - Tier assign, update, and remove', async ({ page }) => {
      await dataProduct.visitEntityPage(page);
      await assignTier(page, 'Tier1', dataProduct.endpoint);
      await assignTier(page, 'Tier3', dataProduct.endpoint);
      await removeTierFromWidget(page, dataProduct.endpoint);
    });

    test('DataProduct - Certification assign, update, and remove', async ({
      page,
    }) => {
      await dataProduct.visitEntityPage(page);
      await assignCertificationForWidget(page, certTag1, dataProduct.endpoint);
      await assignCertificationForWidget(page, certTag2, dataProduct.endpoint);
      await removeCertificationFromWidget(page, dataProduct.endpoint);
    });

    test('DataProduct - UpVote and DownVote', async ({ page }) => {
      await dataProduct.visitEntityPage(page);
      await upVote(page, dataProduct.endpoint);
      await downVote(page, dataProduct.endpoint);
    });
  });

  test.describe('Non-admin permissions', () => {
    test.beforeEach(async ({ dataConsumerPage }) => {
      await redirectToHomePage(dataConsumerPage);
    });

    test('DataConsumer can edit tier and certification on Domain', async ({
      dataConsumerPage,
    }) => {
      await domain.visitEntityPage(dataConsumerPage);
      await dataConsumerPage.waitForLoadState('networkidle');

      await expect(
        dataConsumerPage.getByTestId('edit-tier')
      ).toBeVisible();
      await expect(
        dataConsumerPage.getByTestId('edit-certification')
      ).toBeVisible();
    });

    test('Non-admin can vote on Domain', async ({ dataConsumerPage }) => {
      await domain.visitEntityPage(dataConsumerPage);
      await dataConsumerPage.waitForLoadState('networkidle');

      await expect(dataConsumerPage.getByTestId('up-vote-btn')).toBeVisible();
      await expect(dataConsumerPage.getByTestId('down-vote-btn')).toBeVisible();
    });

    test('DataConsumer can edit tier and certification on DataProduct', async ({
      dataConsumerPage,
    }) => {
      await dataProduct.visitEntityPage(dataConsumerPage);
      await dataConsumerPage.waitForLoadState('networkidle');

      await expect(
        dataConsumerPage.getByTestId('edit-tier')
      ).toBeVisible();
      await expect(
        dataConsumerPage.getByTestId('edit-certification')
      ).toBeVisible();
    });

    test('Non-admin can vote on DataProduct', async ({ dataConsumerPage }) => {
      await dataProduct.visitEntityPage(dataConsumerPage);
      await dataConsumerPage.waitForLoadState('networkidle');

      await expect(dataConsumerPage.getByTestId('up-vote-btn')).toBeVisible();
      await expect(dataConsumerPage.getByTestId('down-vote-btn')).toBeVisible();
    });

    test('User without EditTier/EditCertification cannot see edit buttons on Domain', async ({
      editDescriptionPage,
    }) => {
      await redirectToHomePage(editDescriptionPage);
      await domain.visitEntityPage(editDescriptionPage);
      await editDescriptionPage.waitForLoadState('networkidle');

      await expect(
        editDescriptionPage.getByTestId('edit-tier')
      ).not.toBeVisible();
      await expect(
        editDescriptionPage.getByTestId('edit-certification')
      ).not.toBeVisible();
    });

    test('User without EditTier/EditCertification cannot see edit buttons on DataProduct', async ({
      editDescriptionPage,
    }) => {
      await redirectToHomePage(editDescriptionPage);
      await dataProduct.visitEntityPage(editDescriptionPage);
      await editDescriptionPage.waitForLoadState('networkidle');

      await expect(
        editDescriptionPage.getByTestId('edit-tier')
      ).not.toBeVisible();
      await expect(
        editDescriptionPage.getByTestId('edit-certification')
      ).not.toBeVisible();
    });
  });
});
