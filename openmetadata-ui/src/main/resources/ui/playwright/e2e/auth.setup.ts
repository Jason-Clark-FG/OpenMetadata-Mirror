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
import {
  BrowserContext,
  Page,
  request,
  test as setup,
} from '@playwright/test';
import {
  EDIT_DESCRIPTION_RULE,
  EDIT_GLOSSARY_TERM_RULE,
  EDIT_TAGS_RULE,
  VIEW_ONLY_RULE,
} from '../constant/permission';
import { DEFAULT_ADMIN_USER } from '../constant/user';
import { AdminClass } from '../support/user/AdminClass';
import { UserClass } from '../support/user/UserClass';
import { getApiContext, redirectToHomePage, uuid } from '../utils/common';
import { loginAsAdmin } from '../utils/initialSetup';
import { seedAuthStorage } from '../utils/tokenStorage';

const adminFile = 'playwright/.auth/admin.json';
const dataConsumerFile = 'playwright/.auth/dataConsumer.json';
const dataStewardFile = 'playwright/.auth/dataSteward.json';
const editDescriptionFile = 'playwright/.auth/editDescription.json';
const editTagsFile = 'playwright/.auth/editTags.json';
const editGlossaryTermFile = 'playwright/.auth/editGlossaryTerm.json';
const viewOnlyFile = 'playwright/.auth/viewOnly.json';
const ownerFile = 'playwright/.auth/owner.json';

const userUUID = uuid();

// Create and setup all users
const dataConsumer = new UserClass({
  firstName: 'PW ',
  lastName: `DataConsumer ${userUUID}`,
  email: `pw-data-consumer-${userUUID}@gmail.com`,
  password: 'User@OMD123',
});
const dataSteward = new UserClass({
  firstName: 'PW ',
  lastName: `DataSteward ${userUUID}`,
  email: `pw-data-steward-${userUUID}@gmail.com`,
  password: 'User@OMD123',
});
const editDescriptionUser = new UserClass({
  firstName: 'PW ',
  lastName: `EditDescription ${userUUID}`,
  email: `pw-edit-description-${userUUID}@gmail.com`,
  password: 'User@OMD123',
});
const editTagsUser = new UserClass({
  firstName: 'PW ',
  lastName: `EditTags ${userUUID}`,
  email: `pw-edit-tags-${userUUID}@gmail.com`,
  password: 'User@OMD123',
});
const editGlossaryTermUser = new UserClass({
  firstName: 'PW ',
  lastName: `EditGlossaryTerm ${userUUID}`,
  email: `pw-edit-glossary-term-${userUUID}@gmail.com`,
  password: 'User@OMD123',
});
const viewOnlyUser = new UserClass({
  firstName: 'PW ',
  lastName: `ViewOnly ${userUUID}`,
  email: `pw-view-only-${userUUID}@gmail.com`,
  password: 'User@OMD123',
});
const ownerUser = new UserClass({
  firstName: 'PW ',
  lastName: `Owner ${userUUID}`,
  email: `pw-owner-${userUUID}@gmail.com`,
  password: 'User@OMD123',
});

const addLoggedInUser = async (page: Page, username: string) => {
  await page.evaluate((loggedInUser) => {
    const storageKey = 'loggedInUsers';
    const existing = localStorage.getItem(storageKey);
    const users = existing ? existing.split(',').filter(Boolean) : [];

    if (!users.includes(loggedInUser)) {
      users.push(loggedInUser);
      localStorage.setItem(storageKey, users.join(','));
    }
  }, username);
};

const loginViaApi = async (email: string, password: string) => {
  const loginContext = await request.newContext({
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:8585',
    timeout: 90000,
  });

  try {
    const loginResponse = await loginContext.post('/api/v1/auth/login', {
      data: {
        email,
        password: Buffer.from(password).toString('base64'),
      },
    });

    if (!loginResponse.ok()) {
      throw new Error(
        `Authentication failed for ${email} (${loginResponse.status()}): ${await loginResponse.text()}`
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

const persistAuthenticatedState = async ({
  page,
  filePath,
  email,
  password,
  username,
}: {
  page: Page;
  filePath: string;
  email: string;
  password: string;
  username: string;
}) => {
  const { accessToken, afterAction } = await loginViaApi(email, password);

  try {
    await seedAuthStorage({
      page,
      token: accessToken,
      username,
    });
    await redirectToHomePage(page);
    await page.waitForLoadState('domcontentloaded').catch(() => undefined);
    await addLoggedInUser(page, username);
    await page.context().storageState({ path: filePath, indexedDB: true });
  } finally {
    await afterAction();
  }
};

setup('authenticate all users', async ({ browser }) => {
  setup.setTimeout(300 * 1000);
  // Create separate browser contexts so auth state does not leak between users
  // while we are persisting independent storage states.
  const [
    adminContext,
    dataConsumerContext,
    dataStewardContext,
    editDescriptionContext,
    editTagsContext,
    editGlossaryTermContext,
    viewOnlyContext,
    ownerContext,
  ] = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);

  const [
    adminPage,
    dataConsumerPage,
    dataStewardPage,
    editDescriptionPage,
    editTagsPage,
    editGlossaryTermPage,
    viewOnlyPage,
    ownerPage,
  ] = await Promise.all([
    adminContext.newPage(),
    dataConsumerContext.newPage(),
    dataStewardContext.newPage(),
    editDescriptionContext.newPage(),
    editTagsContext.newPage(),
    editGlossaryTermContext.newPage(),
    viewOnlyContext.newPage(),
    ownerContext.newPage(),
  ]);
  let newAdminContext: BrowserContext | undefined;
  let newAdminPage: Page | undefined;

  try {
    // Create admin page and context
    const admin = new AdminClass();

    await loginAsAdmin(adminPage, admin);

    // Create a new page to persist admin storage state after token expiry is set to 4 hours.
    newAdminContext = await browser.newContext();
    newAdminPage = await newAdminContext.newPage();

    const { apiContext, afterAction } = await getApiContext(adminPage);

    // Create all users, Using allSettled to avoid failing the setup if one of the users fails to create
    await Promise.allSettled([
      dataConsumer.create(apiContext, false),
      dataSteward.create(apiContext, false),
      editDescriptionUser.create(apiContext, false),
      editTagsUser.create(apiContext, false),
      editGlossaryTermUser.create(apiContext, false),
      viewOnlyUser.create(apiContext, false),
      ownerUser.create(apiContext, false),
    ]);

    // Set up roles and policies, Using allSettled to avoid failing the setup if one of the users fails to create
    await Promise.allSettled([
      dataConsumer.setDataConsumerRole(apiContext),
      dataSteward.setDataStewardRole(apiContext),
      editDescriptionUser.setCustomRulePolicy(
        apiContext,
        EDIT_DESCRIPTION_RULE,
        'PW%Edit-Description'
      ),
      editTagsUser.setCustomRulePolicy(
        apiContext,
        EDIT_TAGS_RULE,
        'PW%Edit-Tags'
      ),
      editGlossaryTermUser.setCustomRulePolicy(
        apiContext,
        EDIT_GLOSSARY_TERM_RULE,
        'PW%Edit-Glossary-Term'
      ),
      viewOnlyUser.setCustomRulePolicy(
        apiContext,
        VIEW_ONLY_RULE,
        'PW%View-Only'
      ),
      ownerUser.setDataConsumerRole(apiContext),
    ]);

    await persistAuthenticatedState({
      page: newAdminPage,
      filePath: adminFile,
      email: DEFAULT_ADMIN_USER.userName,
      password: DEFAULT_ADMIN_USER.password,
      username: DEFAULT_ADMIN_USER.userName,
    });

    await persistAuthenticatedState({
      page: dataConsumerPage,
      filePath: dataConsumerFile,
      email: dataConsumer.data.email,
      password: dataConsumer.data.password,
      username: dataConsumer.responseData.name,
    });

    await persistAuthenticatedState({
      page: dataStewardPage,
      filePath: dataStewardFile,
      email: dataSteward.data.email,
      password: dataSteward.data.password,
      username: dataSteward.responseData.name,
    });

    await persistAuthenticatedState({
      page: editDescriptionPage,
      filePath: editDescriptionFile,
      email: editDescriptionUser.data.email,
      password: editDescriptionUser.data.password,
      username: editDescriptionUser.responseData.name,
    });

    await persistAuthenticatedState({
      page: editTagsPage,
      filePath: editTagsFile,
      email: editTagsUser.data.email,
      password: editTagsUser.data.password,
      username: editTagsUser.responseData.name,
    });

    await persistAuthenticatedState({
      page: editGlossaryTermPage,
      filePath: editGlossaryTermFile,
      email: editGlossaryTermUser.data.email,
      password: editGlossaryTermUser.data.password,
      username: editGlossaryTermUser.responseData.name,
    });

    await persistAuthenticatedState({
      page: viewOnlyPage,
      filePath: viewOnlyFile,
      email: viewOnlyUser.data.email,
      password: viewOnlyUser.data.password,
      username: viewOnlyUser.responseData.name,
    });

    await persistAuthenticatedState({
      page: ownerPage,
      filePath: ownerFile,
      email: ownerUser.data.email,
      password: ownerUser.data.password,
      username: ownerUser.responseData.name,
    });

    await afterAction();
  } catch (error) {
    console.error('Error during authentication setup:', error);

    throw error;
  } finally {
    // Always attempt to tear down every page/context, even if one close fails.
    await Promise.allSettled([
      newAdminPage?.close(),
      dataConsumerPage?.close(),
      dataStewardPage?.close(),
      editDescriptionPage?.close(),
      editTagsPage?.close(),
      editGlossaryTermPage?.close(),
      viewOnlyPage?.close(),
      ownerPage?.close(),
      newAdminContext?.close(),
      adminContext.close(),
      dataConsumerContext.close(),
      dataStewardContext.close(),
      editDescriptionContext.close(),
      editTagsContext.close(),
      editGlossaryTermContext.close(),
      viewOnlyContext.close(),
      ownerContext.close(),
    ]);
  }
});
