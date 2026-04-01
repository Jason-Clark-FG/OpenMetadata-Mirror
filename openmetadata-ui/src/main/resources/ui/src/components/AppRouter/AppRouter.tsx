/*
 *  Copyright 2022 Collate.
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

import { isEmpty, isNil } from 'lodash';
import { lazy, useCallback, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAnalytics } from 'use-analytics';
import { useShallow } from 'zustand/react/shallow';
import { ROUTES } from '../../constants/constants';
import { CustomEventTypes } from '../../generated/analytics/webAnalyticEventData';
import { useApplicationStore } from '../../hooks/useApplicationStore';
import useCustomLocation from '../../hooks/useCustomLocation/useCustomLocation';
import applicationRoutesClass from '../../utils/ApplicationRoutesClassBase';
import Loader from '../common/Loader/Loader';
import { useApplicationsProvider } from '../Settings/Applications/ApplicationsProvider/ApplicationsProvider';
import { RoutePosition } from '../Settings/Applications/plugins/AppPlugin';
import withSuspenseFallback from './withSuspenseFallback';

const AuthenticatedApp = withSuspenseFallback(
  lazy(() => import('./AuthenticatedApp'))
);

const UnauthenticatedApp = withSuspenseFallback(
  lazy(() => import('./UnauthenticatedApp'))
);

const AppContainer = withSuspenseFallback(
  lazy(() => import('../AppContainer/AppContainer'))
);

// Lazy-load infrequently-visited unauthenticated pages
const AccessNotAllowedPage = withSuspenseFallback(
  lazy(() => import('../../pages/AccessNotAllowedPage/AccessNotAllowedPage'))
);

const LogoutPage = withSuspenseFallback(
  lazy(() =>
    import('../../pages/LogoutPage/LogoutPage').then((m) => ({
      default: m.LogoutPage,
    }))
  )
);

const PageNotFound = withSuspenseFallback(
  lazy(() => import('../../pages/PageNotFound/PageNotFound'))
);

const SamlCallback = withSuspenseFallback(
  lazy(() => import('../../pages/SamlCallback'))
);

const SignUpPage = withSuspenseFallback(
  lazy(() => import('../../pages/SignUp/SignUpPage'))
);

const AppRouter = () => {
  const location = useCustomLocation();
  const UnAuthenticatedAppRouter =
    applicationRoutesClass.getUnAuthenticatedRouteElements();

  const analytics = useAnalytics();
  const {
    currentUser,
    isAuthenticated,
    isApplicationLoading,
    isAuthenticating,
  } = useApplicationStore(
    useShallow((state) => ({
      currentUser: state.currentUser,
      isAuthenticated: state.isAuthenticated,
      isApplicationLoading: state.isApplicationLoading,
      isAuthenticating: state.isAuthenticating,
    }))
  );
  const { plugins = [] } = useApplicationsProvider();

  useEffect(() => {
    const { pathname } = location;

    /**
     * Ignore the slash path because we are treating my data as
     * default path.
     * And check if analytics instance is available
     */
    if (pathname !== '/' && !isNil(analytics)) {
      // track page view on route change
      analytics.page();
    }
  }, [location.pathname]);

  const handleClickEvent = useCallback(
    (event: MouseEvent) => {
      const eventValue =
        (event.target as HTMLElement)?.textContent || CustomEventTypes.Click;
      /**
       * Ignore the click event if the event value is undefined
       * And analytics instance is not available
       */
      if (eventValue && !isNil(analytics)) {
        analytics.track(eventValue);
      }
    },
    [analytics]
  );

  useEffect(() => {
    const targetNode = document.body;
    targetNode.addEventListener('click', handleClickEvent);

    return () => targetNode.removeEventListener('click', handleClickEvent);
  }, [handleClickEvent]);

  /**
   * isApplicationLoading is true when the application is loading in AuthProvider
   * and is false when the application is loaded.
   * isAuthenticating is true when determining auth state and false when complete.
   * If the application is loading or authenticating, show the loader.
   * If the user is authenticated, show the AppContainer.
   * If the user is not authenticated, show the UnAuthenticatedAppRouter.
   */
  if (isApplicationLoading || isAuthenticating) {
    return <Loader fullScreen />;
  }

  if (isAuthenticated) {
    return (
      <AuthenticatedApp>
        <Routes>
          <Route element={<PageNotFound />} path={ROUTES.NOT_FOUND} />
          <Route element={<LogoutPage />} path={ROUTES.LOGOUT} />
          <Route
            element={<AccessNotAllowedPage />}
            path={ROUTES.UNAUTHORISED}
          />
          <Route
            element={
              isEmpty(currentUser) ? (
                <SignUpPage />
              ) : (
                <Navigate replace to={ROUTES.HOME} />
              )
            }
            path={ROUTES.SIGNUP}
          />
          <Route element={<SamlCallback />} path={ROUTES.AUTH_CALLBACK} />

          {plugins?.flatMap((plugin) => {
            const routes = plugin.getRoutes?.() || [];
            const appRoutes = routes.filter(
              (route) => route.position === RoutePosition.APP
            );

            return appRoutes.map((route, idx) => (
              <Route key={`${plugin.name}-app-${idx}`} {...route} />
            ));
          })}

          <Route element={<AppContainer />} path="*" />
        </Routes>
      </AuthenticatedApp>
    );
  }

  return (
    <UnauthenticatedApp>
      <Routes>
        <Route element={<PageNotFound />} path={ROUTES.NOT_FOUND} />
        <Route element={<LogoutPage />} path={ROUTES.LOGOUT} />
        <Route element={<AccessNotAllowedPage />} path={ROUTES.UNAUTHORISED} />
        <Route
          element={
            isEmpty(currentUser) ? (
              <SignUpPage />
            ) : (
              <Navigate replace to={ROUTES.HOME} />
            )
          }
          path={ROUTES.SIGNUP}
        />
        <Route element={<SamlCallback />} path={ROUTES.AUTH_CALLBACK} />
        <Route element={<UnAuthenticatedAppRouter />} path="*" />
      </Routes>
    </UnauthenticatedApp>
  );
};

export default AppRouter;
