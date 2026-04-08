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

import { cloneDeep, isUndefined } from 'lodash';
import { COMMON_UI_SCHEMA } from '../constants/ServiceUISchema.constant';
import {
  MessagingConnection,
  MessagingServiceType,
} from '../generated/entity/services/messagingService';

const MESSAGING_CONNECTION_SCHEMAS: Record<
  MessagingServiceType,
  () => Promise<{ default: Record<string, unknown> }>
> = {
  [MessagingServiceType.Kafka]: () =>
    import(
      '../jsons/connectionSchemas/connections/messaging/kafkaConnection.json'
    ),
  [MessagingServiceType.Redpanda]: () =>
    import(
      '../jsons/connectionSchemas/connections/messaging/redpandaConnection.json'
    ),
  [MessagingServiceType.CustomMessaging]: () =>
    import(
      '../jsons/connectionSchemas/connections/messaging/customMessagingConnection.json'
    ),
  [MessagingServiceType.Kinesis]: () =>
    import(
      '../jsons/connectionSchemas/connections/messaging/kinesisConnection.json'
    ),
  [MessagingServiceType.PubSub]: () =>
    import(
      '../jsons/connectionSchemas/connections/messaging/pubSubConnection.json'
    ),
};

export const getBrokers = (config: MessagingConnection['config']) => {
  let retVal: string | undefined;

  if (config?.type === MessagingServiceType.Kafka) {
    retVal = config.bootstrapServers;
  }

  return !isUndefined(retVal) ? retVal : '--';
};

export const getMessagingConfig = async (type: MessagingServiceType) => {
  const uiSchema = { ...COMMON_UI_SCHEMA };
  const loaderFn = MESSAGING_CONNECTION_SCHEMAS[type];

  if (!loaderFn) {
    return cloneDeep({ schema: {}, uiSchema });
  }

  const schema = (await loaderFn()).default;

  return cloneDeep({ schema, uiSchema });
};
