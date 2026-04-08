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
import { expect, Page } from '@playwright/test';
import { SSO_ENV } from '../../constant/ssoAuth';
import { SSOConfig } from '../sso';
import { ProviderCredentials } from '../ssoAuth';
import { ProviderHelper } from './index';

const OM_BASE_URL = 'http://localhost:8585';
const DEFAULT_OKTA_DOMAIN = 'integrator-9351624.okta.com';
const DEFAULT_OKTA_CLIENT_ID = '0oayn277hnOhUpVLd697';
const DEFAULT_OKTA_PRINCIPAL_DOMAIN = 'getcollate.io';

const requireEnv = (key: string): string => {
  const value = process.env[key];

  if (!value) {
    throw new Error(
      `Okta SSO test requires env var ${key} to be set. ` +
        `Required: ${SSO_ENV.USERNAME}, ${SSO_ENV.PASSWORD}. ` +
        `Optional with defaults: ${SSO_ENV.OKTA_CLIENT_ID}, ${SSO_ENV.OKTA_DOMAIN}, ${SSO_ENV.OKTA_PRINCIPAL_DOMAIN}`
    );
  }

  return value;
};

const buildConfigPayload = (): SSOConfig => {
  const adminPrincipal = requireEnv(SSO_ENV.USERNAME);
  const clientId = process.env[SSO_ENV.OKTA_CLIENT_ID] ?? DEFAULT_OKTA_CLIENT_ID;
  const oktaDomain = process.env[SSO_ENV.OKTA_DOMAIN] ?? DEFAULT_OKTA_DOMAIN;
  const principalDomain =
    process.env[SSO_ENV.OKTA_PRINCIPAL_DOMAIN] ?? DEFAULT_OKTA_PRINCIPAL_DOMAIN;

  const authority = `https://${oktaDomain}/oauth2/default`;

  return {
    authenticationConfiguration: {
      clientType: 'public',
      provider: 'okta',
      providerName: '',
      publicKeyUrls: [
        `${OM_BASE_URL}/api/v1/system/config/jwks`,
        `${authority}/v1/keys`,
      ],
      tokenValidationAlgorithm: 'RS256',
      authority,
      clientId,
      callbackUrl: `${OM_BASE_URL}/callback`,
      jwtPrincipalClaims: ['email', 'preferred_username', 'sub'],
      enableSelfSignup: true,
    },
    authorizerConfiguration: {
      className: 'org.openmetadata.service.security.DefaultAuthorizer',
      containerRequestFilter: 'org.openmetadata.service.security.JwtFilter',
      adminPrincipals: [adminPrincipal],
      principalDomain,
      enforcePrincipalDomain: false,
      enableSecureSocketConnection: false,
    },
  };
};

const performProviderLogin = async (
  page: Page,
  { username, password }: ProviderCredentials
): Promise<void> => {
  const identifierInput = page.locator('input[name="identifier"]');

  await expect(identifierInput).toBeVisible();
  await identifierInput.fill(username);

  const nextButton = page.locator('input[type="submit"]');

  await expect(nextButton).toBeEnabled();
  await nextButton.click();

  const passwordInput = page.locator('input[type="password"]');

  await expect(passwordInput).toBeVisible();
  await passwordInput.fill(password);

  const verifyButton = page.locator('input[type="submit"]');

  await expect(verifyButton).toBeEnabled();
  await verifyButton.click();
};

export const oktaProviderHelper: ProviderHelper = {
  expectedButtonText: 'Sign in with Okta',
  loginUrlPattern: /\.okta\.com/,
  buildConfigPayload,
  performProviderLogin,
};
