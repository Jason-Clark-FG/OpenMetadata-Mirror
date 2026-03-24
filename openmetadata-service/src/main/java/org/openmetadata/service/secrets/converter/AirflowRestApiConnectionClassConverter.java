/*
 *  Copyright 2021 Collate
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

package org.openmetadata.service.secrets.converter;

import java.util.List;
import java.util.Map;
import org.openmetadata.schema.security.credentials.GCPCredentials;
import org.openmetadata.schema.services.connections.pipeline.AirflowRestAPiConnection;
import org.openmetadata.schema.utils.JsonUtils;

/** Converter class to get an `AirflowRestAPiConnection` object. */
public class AirflowRestApiConnectionClassConverter extends ClassConverter {

  public AirflowRestApiConnectionClassConverter() {
    super(AirflowRestAPiConnection.class);
  }

  @Override
  public Object convert(Object object) {
    AirflowRestAPiConnection conn =
        (AirflowRestAPiConnection) JsonUtils.convertValue(object, this.clazz);

    if (conn.getAuthConfig() instanceof Map<?, ?> authMap
        && "GcpCredentials".equals(authMap.get("authType"))) {
      Object credentials = authMap.get("credentials");
      tryToConvertOrFail(credentials, List.of(GCPCredentials.class))
          .ifPresent(converted -> ((Map) authMap).put("credentials", converted));
    }

    return conn;
  }
}
