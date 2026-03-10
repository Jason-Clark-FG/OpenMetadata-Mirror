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
 * Configuration for the MCP Chat Application.
 */
export interface MCPChatAppConfig {
    /**
     * AWS credentials for accessing Anthropic models via AWS Bedrock.
     */
    awsConfig?: AWSBaseConfig;
    /**
     * Custom API endpoint URL. Leave empty to use the provider default.
     */
    llmApiEndpoint?: string;
    /**
     * API key for the LLM provider.
     */
    llmApiKey?: string;
    /**
     * The model identifier to use (e.g., gpt-4o, anthropic.claude-sonnet-4-20250514-v1:0).
     */
    llmModel?: string;
    /**
     * LLM provider to use (openai or anthropic).
     */
    llmProvider?: string;
    /**
     * The system prompt that guides the assistant behavior.
     */
    systemPrompt?: string;
}

/**
 * AWS credentials for accessing Anthropic models via AWS Bedrock.
 *
 * Base AWS configuration for authentication. Supports static credentials, IAM roles, and
 * default credential provider chain.
 */
export interface AWSBaseConfig {
    /**
     * AWS Access Key ID. Falls back to default credential provider chain if not set.
     */
    accessKeyId?: string;
    /**
     * ARN of IAM role to assume for cross-account access.
     */
    assumeRoleArn?: string;
    /**
     * Session name for assumed role.
     */
    assumeRoleSessionName?: string;
    /**
     * Enable AWS IAM authentication. When enabled, uses the default credential provider chain
     * (environment variables, instance profile, etc.). Defaults to false for backward
     * compatibility.
     */
    enabled?: boolean;
    /**
     * Custom endpoint URL for AWS-compatible services (MinIO, LocalStack).
     */
    endpointUrl?: string;
    /**
     * AWS Region (e.g., us-east-1). Required when AWS authentication is enabled.
     */
    region?: string;
    /**
     * AWS Secret Access Key. Falls back to default credential provider chain if not set.
     */
    secretAccessKey?: string;
    /**
     * AWS Session Token for temporary credentials.
     */
    sessionToken?: string;
}
