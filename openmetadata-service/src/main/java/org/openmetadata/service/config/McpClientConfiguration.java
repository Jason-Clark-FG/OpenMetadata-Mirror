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
package org.openmetadata.service.config;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class McpClientConfiguration {
  @JsonProperty("enabled")
  private boolean enabled = false;

  @JsonProperty("provider")
  private String provider = "openai";

  @JsonProperty(value = "apiKey", access = JsonProperty.Access.WRITE_ONLY)
  private String apiKey;

  @JsonProperty("model")
  private String model = "gpt-4o";

  @JsonProperty("apiEndpoint")
  private String apiEndpoint;

  @JsonProperty("systemPrompt")
  private String systemPrompt =
      "You are a helpful metadata assistant for OpenMetadata. "
          + "Use the available tools to search, explore, and manage metadata. "
          + "Be concise and actionable.";
}
