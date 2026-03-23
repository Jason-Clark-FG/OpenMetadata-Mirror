/*
 *  Copyright 2026 Collate.
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
/**
 * Airflow REST API Connection Config for connecting via REST API with token or basic
 * authentication.
 */
export interface AirflowRESTAPIConnection {
    /**
     * Airflow REST API version.
     */
    apiVersion?: APIVersion;
    /**
     * Password for basic authentication to the Airflow API.
     */
    password?: string;
    /**
     * Bearer token for API authentication.
     */
    token?: string;
    /**
     * Username for basic authentication to the Airflow API.
     */
    username?: string;
    /**
     * Whether to verify SSL certificates when connecting to the Airflow API.
     */
    verifySSL?: boolean;
}

/**
 * Airflow REST API version.
 *
 * Airflow REST API version. Use v1 for Airflow 2.x and v2 for Airflow 3.x. Auto will detect
 * the version automatically.
 */
export enum APIVersion {
    Auto = "auto",
    V1 = "v1",
    V2 = "v2",
}
