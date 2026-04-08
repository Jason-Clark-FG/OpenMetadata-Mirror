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
import { SSOConfig } from '../utils/sso';

export const SSO_ENV = {
  PROVIDER_TYPE: 'SSO_PROVIDER_TYPE',
  USERNAME: 'SSO_USERNAME',
  PASSWORD: 'SSO_PASSWORD',
  OKTA_CLIENT_ID: 'OKTA_SSO_CLIENT_ID',
  OKTA_DOMAIN: 'OKTA_SSO_DOMAIN',
  OKTA_PRINCIPAL_DOMAIN: 'OKTA_SSO_PRINCIPAL_DOMAIN',
} as const;

export const PROVIDER_BUTTON_TEXT: Record<string, string> = {
  okta: 'Sign in with Okta',
  azure: 'Sign in with Azure',
  google: 'Sign in with Google',
  auth0: 'Sign in with Auth0',
  'aws-cognito': 'Sign in with AWS Cognito',
  saml: 'Sign in with SAML SSO',
};

export const BASIC_AUTH_CONFIG: SSOConfig = {
  authenticationConfiguration: {
    provider: 'basic',
    providerName: 'basic',
    authority: '',
    clientId: '',
    callbackUrl: '',
    publicKeyUrls: ['http://localhost:8585/api/v1/system/config/jwks'],
    jwtPrincipalClaims: ['email', 'preferred_username', 'sub'],
    enableSelfSignup: true,
  },
  authorizerConfiguration: {
    className: 'org.openmetadata.service.security.DefaultAuthorizer',
    containerRequestFilter: 'org.openmetadata.service.security.JwtFilter',
    adminPrincipals: ['admin'],
    principalDomain: 'open-metadata.org',
    enforcePrincipalDomain: false,
    enableSecureSocketConnection: false,
  },
};
