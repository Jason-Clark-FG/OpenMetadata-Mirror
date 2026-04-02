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

import { GlobalStyles, ThemeProvider } from '@mui/material';
import { createMuiTheme } from '@openmetadata/ui-core-components';
import { FC, lazy, Suspense, useEffect, useMemo } from 'react';
import { HelmetProvider } from 'react-helmet-async';
import { I18nextProvider } from 'react-i18next';
import { BrowserRouter } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import ErrorBoundary from './components/common/ErrorBoundary/ErrorBoundary';
import Loader from './components/common/Loader/Loader';
import { DEFAULT_THEME } from './constants/Appearance.constants';
import AntDConfigProvider from './context/AntDConfigProvider/AntDConfigProvider';
import { ThemeProvider as UntitledUIThemeProvider } from './context/UntitledUIThemeProvider/theme-provider';
import { useApplicationStore } from './hooks/useApplicationStore';
import { getBasePath } from './utils/HistoryUtils';
import i18n from './utils/i18next/LocalUtil';

const App = lazy(() => import('./App'));

const AppRoot: FC = () => {
  const { initializeAuthState } = useApplicationStore();

  useEffect(() => {
    initializeAuthState();
  }, [initializeAuthState]);

  const { applicationConfig } = useApplicationStore(
    useShallow((state) => ({
      applicationConfig: state.applicationConfig,
    }))
  );

  const muiTheme = useMemo(
    () => createMuiTheme(applicationConfig?.customTheme, DEFAULT_THEME),
    [applicationConfig?.customTheme]
  );

  return (
    <div className="main-container">
      <div className="content-wrapper" data-testid="content-wrapper">
        <BrowserRouter basename={getBasePath()}>
          <I18nextProvider i18n={i18n}>
            <AntDConfigProvider>
              <UntitledUIThemeProvider
                brandColors={applicationConfig?.customTheme}>
                <ThemeProvider theme={muiTheme}>
                  <GlobalStyles styles={{ html: { fontSize: '14px' } }} />
                  <HelmetProvider>
                    <ErrorBoundary>
                      <Suspense fallback={<Loader fullScreen />}>
                        <App />
                      </Suspense>
                    </ErrorBoundary>
                  </HelmetProvider>
                </ThemeProvider>
              </UntitledUIThemeProvider>
            </AntDConfigProvider>
          </I18nextProvider>
        </BrowserRouter>
      </div>
    </div>
  );
};

export default AppRoot;
