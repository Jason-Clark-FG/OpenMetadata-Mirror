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

import { IPublicClientApplication } from '@azure/msal-browser';
import { lazy, ReactNode, Suspense } from 'react';
import Loader from '../../common/Loader/Loader';

const Auth0ProviderComponent = lazy(() =>
  import('@auth0/auth0-react').then((m) => ({ default: m.Auth0Provider }))
);

const MsalProviderComponent = lazy(() =>
  import('@azure/msal-react').then((m) => ({ default: m.MsalProvider }))
);

const OktaAuthProviderComponent = lazy(() =>
  import('./OktaAuthProvider').then((m) => ({ default: m.OktaAuthProvider }))
);

const BasicAuthProviderComponent = lazy(() => import('./BasicAuthProvider'));

interface Auth0ProviderWrapperProps {
  clientId: string;
  domain: string;
  redirectUri: string;
  children: ReactNode;
}

export const LazyAuth0ProviderWrapper = ({
  clientId,
  domain,
  redirectUri,
  children,
}: Auth0ProviderWrapperProps) => {
  return (
    <Suspense fallback={<Loader fullScreen />}>
      <Auth0ProviderComponent
        useRefreshTokens
        cacheLocation="memory"
        clientId={clientId}
        domain={domain}
        redirectUri={redirectUri}>
        {children}
      </Auth0ProviderComponent>
    </Suspense>
  );
};

interface MsalProviderWrapperProps {
  instance: IPublicClientApplication;
  children: ReactNode;
}

export const LazyMsalProviderWrapper = ({
  instance,
  children,
}: MsalProviderWrapperProps) => {
  return (
    <Suspense fallback={<Loader fullScreen />}>
      <MsalProviderComponent instance={instance}>
        {children}
      </MsalProviderComponent>
    </Suspense>
  );
};

interface OktaAuthProviderWrapperProps {
  children: ReactNode;
}

export const LazyOktaAuthProviderWrapper = ({
  children,
}: OktaAuthProviderWrapperProps) => {
  return (
    <Suspense fallback={<Loader fullScreen />}>
      <OktaAuthProviderComponent>{children}</OktaAuthProviderComponent>
    </Suspense>
  );
};

interface BasicAuthProviderWrapperProps {
  children: ReactNode;
}

export const LazyBasicAuthProviderWrapper = ({
  children,
}: BasicAuthProviderWrapperProps) => {
  return (
    <Suspense fallback={<Loader fullScreen />}>
      <BasicAuthProviderComponent>{children}</BasicAuthProviderComponent>
    </Suspense>
  );
};
