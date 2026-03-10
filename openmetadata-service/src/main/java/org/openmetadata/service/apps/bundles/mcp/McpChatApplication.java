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
package org.openmetadata.service.apps.bundles.mcp;

import java.util.Map;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import org.openmetadata.schema.entity.app.App;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.service.Entity;
import org.openmetadata.service.apps.AbstractNativeApplication;
import org.openmetadata.service.config.McpClientConfiguration;
import org.openmetadata.service.jdbi3.CollectionDAO;
import org.openmetadata.service.mcpclient.McpClientService;
import org.openmetadata.service.search.SearchRepository;

@Slf4j
public class McpChatApplication extends AbstractNativeApplication {

  @Getter private volatile McpClientService mcpClientService;

  public McpChatApplication(CollectionDAO collectionDAO, SearchRepository searchRepository) {
    super(collectionDAO, searchRepository);
  }

  @Override
  public void init(App app) {
    super.init(app);
    initializeService();
  }

  @Override
  public void install(String installedBy) {
    super.install(installedBy);
    initializeService();
  }

  @SuppressWarnings("unchecked")
  private void initializeService() {
    Object appConfigObj = getApp().getAppConfiguration();
    if (appConfigObj == null) {
      LOG.warn("McpChatApplication has no configuration.");
      return;
    }

    Map<String, Object> appConfig = JsonUtils.getMap(appConfigObj);
    McpClientConfiguration mcpConfig = new McpClientConfiguration();
    mcpConfig.setProvider((String) appConfig.getOrDefault("llmProvider", "openai"));
    mcpConfig.setApiKey((String) appConfig.get("llmApiKey"));
    mcpConfig.setModel((String) appConfig.getOrDefault("llmModel", "gpt-4o"));
    mcpConfig.setApiEndpoint((String) appConfig.get("llmApiEndpoint"));
    if (appConfig.containsKey("awsConfig")) {
      mcpConfig.setAwsConfig(JsonUtils.getMap(appConfig.get("awsConfig")));
    }
    if (appConfig.containsKey("systemPrompt")) {
      mcpConfig.setSystemPrompt((String) appConfig.get("systemPrompt"));
    }

    this.mcpClientService = new McpClientService(Entity.getCollectionDAO(), mcpConfig);
    LOG.info(
        "McpChatApplication service initialized (chat enabled: {})",
        mcpClientService.isChatEnabled());
  }
}
