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

import { App } from '../generated/entity/applications/app';

/**
 * Adapter utilities to handle app configuration structure changes.
 * Provides backward-compatible access to app configuration, schedule, and private config.
 * All apps are currently Global apps - service-bound apps will be handled in future UI updates.
 */

/**
 * Get app configuration (read-only access)
 * Returns configuration.globalAppConfig.config for Global apps
 */
export const getAppConfig = (app?: App) => {
  if (!app) {
    return undefined;
  }

  return app.configuration?.globalAppConfig?.config;
};

/**
 * Get app schedule (read-only access)
 * Returns configuration.globalAppConfig.schedule for Global apps
 */
export const getAppSchedule = (app?: App) => {
  if (!app) {
    return undefined;
  }

  return app.configuration?.globalAppConfig?.schedule;
};

/**
 * Get app private config (read-only access)
 * Returns configuration.globalAppConfig.privateConfig for Global apps
 */
export const getAppPrivateConfig = (app?: App) => {
  if (!app) {
    return undefined;
  }

  return app.configuration?.globalAppConfig?.privateConfig;
};

/**
 * Check if app has configuration
 */
export const hasAppConfiguration = (app?: App) => {
  if (!app) {
    return false;
  }

  return getAppConfig(app) !== undefined;
};

/**
 * Create updated app object with new configuration
 * Handles nested structure for Global apps transparently
 */
export const updateAppConfig = (app: App, newConfig: unknown) => {
  return {
    ...app,
    configuration: {
      ...app.configuration,
      globalAppConfig: {
        ...app.configuration?.globalAppConfig,
        config: newConfig,
      },
    },
  };
};

/**
 * Create updated app object with new schedule
 * Handles nested structure for Global apps transparently
 */
export const updateAppSchedule = (app: App, newSchedule: unknown) => {
  return {
    ...app,
    configuration: {
      ...app.configuration,
      globalAppConfig: {
        ...app.configuration?.globalAppConfig,
        schedule: newSchedule,
      },
    },
  };
};
