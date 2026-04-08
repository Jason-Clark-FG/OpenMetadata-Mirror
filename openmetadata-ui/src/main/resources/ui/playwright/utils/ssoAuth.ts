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
import { APIRequestContext, expect, Page } from '@playwright/test';
import { BASIC_AUTH_CONFIG } from '../constant/ssoAuth';
import { getApiContext } from './common';
import { SSOConfig } from './sso';

export interface ProviderCredentials {
  username: string;
  password: string;
}

const SECURITY_CONFIG_ENDPOINT = '/api/v1/system/security/config';

export const applyProviderConfig = async (
  apiContext: APIRequestContext,
  config: SSOConfig
): Promise<void> => {
  const response = await apiContext.put(SECURITY_CONFIG_ENDPOINT, {
    data: config,
  });

  expect(response.status()).toBe(200);
};

export const restoreBasicAuth = async (
  apiContext: APIRequestContext
): Promise<void> => {
  const response = await apiContext.put(SECURITY_CONFIG_ENDPOINT, {
    data: BASIC_AUTH_CONFIG,
  });

  expect(response.status()).toBe(200);
};

export const verifyLoggedInUserMatches = async (
  page: Page,
  expectedEmail: string
): Promise<void> => {
  const { apiContext, afterAction } = await getApiContext(page);

  try {
    const response = await apiContext.get('/api/v1/users/loggedInUser');

    expect(response.status()).toBe(200);

    const user = await response.json();
    const expected = expectedEmail.toLowerCase();

    expect(user.email?.toLowerCase()).toBe(expected);
  } finally {
    await afterAction();
  }
};
