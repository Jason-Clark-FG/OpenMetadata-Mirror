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
 * Airflow REST API Connection Config
 */
export interface AirflowAPIConnection {
    /**
     * Airflow REST API version.
     */
    apiVersion?: APIVersion;
    /**
     * URL to the Airflow REST API. E.g., http://localhost:8080
     */
    hostPort: string;
    /**
     * Number of past DAG runs to fetch for status history.
     */
    numberOfStatus?: number;
    /**
     * Password for basic authentication to the Airflow API.
     */
    password?: string;
    /**
     * Regex exclude pipelines.
     */
    pipelineFilterPattern?:      FilterPattern;
    supportsMetadataExtraction?: boolean;
    /**
     * Bearer token for API authentication.
     */
    token?: string;
    /**
     * Service Type
     */
    type?: AirflowAPIType;
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

/**
 * Regex exclude pipelines.
 *
 * Regex to only fetch entities that matches the pattern.
 */
export interface FilterPattern {
    /**
     * List of strings/regex patterns to match and exclude only database entities that match.
     */
    excludes?: string[];
    /**
     * List of strings/regex patterns to match and include only database entities that match.
     */
    includes?: string[];
}

/**
 * Service Type
 *
 * Service type.
 */
export enum AirflowAPIType {
    AirflowAPI = "AirflowApi",
}
