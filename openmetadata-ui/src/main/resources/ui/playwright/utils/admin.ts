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
import { existsSync } from 'fs';
import { APIRequestContext, Browser, Page, request } from '@playwright/test';
import { DEFAULT_ADMIN_USER } from '../constant/user';
import { getAuthContext, redirectToHomePage } from './common';
import { seedAuthStorage } from './tokenStorage';

const ADMIN_STORAGE_STATE_FILE = 'playwright/.auth/admin.json';

export const authenticateAdminPage = async (page: Page) => {
  const { accessToken } = await loginAsAdminViaApi();

  await seedAuthStorage({
    page,
    token: accessToken,
    username: DEFAULT_ADMIN_USER.userName,
  });
  await redirectToHomePage(page);

  return accessToken;
};

export const createAdminApiContext = async (): Promise<{
  apiContext: APIRequestContext;
  afterAction: () => Promise<void>;
}> => {
  const { accessToken, afterAction: afterLogin } = await loginAsAdminViaApi();
  const apiContext = await getAuthContext(accessToken);

  return {
    apiContext,
    afterAction: async () => {
      await apiContext.dispose();
      await afterLogin();
    },
  };
};

export const performAdminLogin = async (browser: Browser) => {
  const { accessToken, afterAction: afterLogin } = await loginAsAdminViaApi();

  if (existsSync(ADMIN_STORAGE_STATE_FILE)) {
    const context = await browser.newContext({
      storageState: ADMIN_STORAGE_STATE_FILE,
    });
    const page = await context.newPage();

    await redirectToHomePage(page);
    const apiContext = await getAuthContext(accessToken);

    return {
      page,
      apiContext,
      afterAction: async () => {
        await apiContext.dispose();
        await afterLogin();
        await context.close();
      },
    };
  }

  const context = await browser.newContext();
  const page = await context.newPage();

  await authenticateAdminPage(page);

  const apiContext = await getAuthContext(accessToken);

  return {
    page,
    apiContext,
    afterAction: async () => {
      await apiContext.dispose();
      await afterLogin();
      await context.close();
    },
  };
};

const loginAsAdminViaApi = async () => {
  const loginContext = await request.newContext({
    baseURL: 'http://localhost:8585',
    timeout: 90000,
  });

  try {
    const loginResponse = await loginContext.post('/api/v1/auth/login', {
      data: {
        email: DEFAULT_ADMIN_USER.userName,
        password: Buffer.from(DEFAULT_ADMIN_USER.password).toString('base64'),
      },
    });

    if (!loginResponse.ok()) {
      throw new Error(
        `Admin authentication failed (${loginResponse.status()}): ${await loginResponse.text()}`
      );
    }

    const loginPayload = (await loginResponse.json()) as {
      accessToken: string;
    };

    return {
      accessToken: loginPayload.accessToken,
      afterAction: async () => {
        await loginContext.dispose();
      },
    };
  } catch (error) {
    await loginContext.dispose();

    throw error;
  }
};
