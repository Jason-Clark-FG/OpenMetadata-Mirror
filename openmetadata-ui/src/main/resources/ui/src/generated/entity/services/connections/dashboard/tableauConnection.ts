/*
 *  Copyright 2024 Collate.
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
 * Tableau Connection Config
 */
export interface TableauConnection {
    /**
     * Tableau API version.
     */
    apiVersion: string;
    /**
     * Types of methods used to authenticate to the tableau instance
     */
    authType?: AuthenticationTypeForTableau;
    /**
     * Tableau Environment Name.
     */
    env: string;
    /**
     * Tableau Server.
     */
    hostPort: string;
    /**
     * Pagination limit used while querying the tableau metadata API for getting data sources
     */
    paginationLimit?: number;
    /**
     * Tableau Site Name.
     */
    siteName?: string;
    /**
     * Tableau Site Url.
     */
    siteUrl?:                    string;
    sslConfig?:                  Config;
    supportsMetadataExtraction?: boolean;
    /**
     * Service Type
     */
    type?:      TableauType;
    verifySSL?: VerifySSL;
}

/**
 * Types of methods used to authenticate to the tableau instance
 *
 * Basic Auth Credentials
 *
 * Access Token Auth Credentials
 */
export interface AuthenticationTypeForTableau {
    /**
     * Password to access the service.
     */
    password?: string;
    /**
     * Username to access the service.
     */
    username?: string;
    /**
     * Personal Access Token Name.
     */
    personalAccessTokenName?: string;
    /**
     * Personal Access Token Secret.
     */
    personalAccessTokenSecret?: string;
}

/**
 * Client SSL configuration
 *
 * OpenMetadata Client configured to validate SSL certificates.
 */
export interface Config {
    /**
     * The CA certificate used for SSL validation.
     */
    caCertificate?: string;
    /**
     * The SSL certificate used for client authentication.
     */
    sslCertificate?: string;
    /**
     * The private key associated with the SSL certificate.
     */
    sslKey?: string;
}

/**
 * Service Type
 *
 * Tableau service type
 */
export enum TableauType {
    Tableau = "Tableau",
}

/**
 * Client SSL verification. Make sure to configure the SSLConfig if enabled.
 */
export enum VerifySSL {
    Ignore = "ignore",
    NoSSL = "no-ssl",
    Validate = "validate",
}