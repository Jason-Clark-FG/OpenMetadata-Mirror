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

import { FC, lazy, Suspense, useEffect } from 'react';
import { HelmetProvider } from 'react-helmet-async';
import { I18nextProvider } from 'react-i18next';
import { BrowserRouter } from 'react-router-dom';
import ErrorBoundary from './components/common/ErrorBoundary/ErrorBoundary';
import Loader from './components/common/Loader/Loader';
import { useApplicationStore } from './hooks/useApplicationStore';
import { getBasePath } from './utils/HistoryUtils';
import i18n from './utils/i18next/LocalUtil';

const App = lazy(() => import('./App'));

const AppRoot: FC = () => {
  const { initializeAuthState } = useApplicationStore();

  useEffect(() => {
    initializeAuthState();
  }, [initializeAuthState]);

  return (
    <div className="main-container">
      <div className="content-wrapper" data-testid="content-wrapper">
        <I18nextProvider i18n={i18n}>
          <HelmetProvider>
            <BrowserRouter basename={getBasePath()}>
              <ErrorBoundary>
                <Suspense fallback={<Loader fullScreen />}>
                  <App />
                </Suspense>
              </ErrorBoundary>
            </BrowserRouter>
          </HelmetProvider>
        </I18nextProvider>
      </div>
    </div>
  );
};

export default AppRoot;
