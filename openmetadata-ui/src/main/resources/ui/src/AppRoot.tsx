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

import { FC, useEffect } from 'react';
import { HelmetProvider } from 'react-helmet-async';
import { I18nextProvider } from 'react-i18next';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import ErrorBoundary from './components/common/ErrorBoundary/ErrorBoundary';
import AntDConfigProvider from './context/AntDConfigProvider/AntDConfigProvider';
import { useApplicationStore } from './hooks/useApplicationStore';
import { getBasePath } from './utils/HistoryUtils';
import i18n from './utils/i18next/LocalUtil';

const AppRoot: FC = () => {
  const { initializeAuthState } = useApplicationStore();

  useEffect(() => {
    initializeAuthState();
  }, [initializeAuthState]);

  return (
    <div className="main-container">
      <div className="content-wrapper" data-testid="content-wrapper">
        <BrowserRouter basename={getBasePath()}>
          <I18nextProvider i18n={i18n}>
            <AntDConfigProvider>
              <HelmetProvider>
                <ErrorBoundary>
                  <App />
                </ErrorBoundary>
              </HelmetProvider>
            </AntDConfigProvider>
          </I18nextProvider>
        </BrowserRouter>
      </div>
    </div>
  );
};

export default AppRoot;
