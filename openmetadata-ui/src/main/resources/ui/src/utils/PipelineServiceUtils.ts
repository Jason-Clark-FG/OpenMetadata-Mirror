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

import { cloneDeep } from 'lodash';
import { COMMON_UI_SCHEMA } from '../constants/ServiceUISchema.constant';
import { PipelineServiceType } from '../generated/entity/services/pipelineService';

export const getPipelineConfig = async (type: PipelineServiceType) => {
  let schema = {};
  const uiSchema = { ...COMMON_UI_SCHEMA };

  switch (type) {
    case PipelineServiceType.Airbyte: {
      schema = (
        await import(
          '../jsons/connectionSchemas/connections/pipeline/airbyteConnection.json'
        )
      ).default;

      break;
    }

    case PipelineServiceType.Airflow: {
      schema = (
        await import(
          '../jsons/connectionSchemas/connections/pipeline/airflowConnection.json'
        )
      ).default;

      break;
    }
    case PipelineServiceType.GluePipeline: {
      schema = (
        await import(
          '../jsons/connectionSchemas/connections/pipeline/gluePipelineConnection.json'
        )
      ).default;

      break;
    }
    case PipelineServiceType.KafkaConnect: {
      schema = (
        await import(
          '../jsons/connectionSchemas/connections/pipeline/kafkaConnectConnection.json'
        )
      ).default;

      break;
    }
    case PipelineServiceType.Fivetran: {
      schema = (
        await import(
          '../jsons/connectionSchemas/connections/pipeline/fivetranConnection.json'
        )
      ).default;

      break;
    }
    case PipelineServiceType.Dagster: {
      schema = (
        await import(
          '../jsons/connectionSchemas/connections/pipeline/dagsterConnection.json'
        )
      ).default;

      break;
    }
    case PipelineServiceType.DBTCloud: {
      schema = (
        await import(
          '../jsons/connectionSchemas/connections/pipeline/dbtCloudConnection.json'
        )
      ).default;

      break;
    }
    case PipelineServiceType.Nifi: {
      schema = (
        await import(
          '../jsons/connectionSchemas/connections/pipeline/nifiConnection.json'
        )
      ).default;

      break;
    }
    case PipelineServiceType.DomoPipeline: {
      schema = (
        await import(
          '../jsons/connectionSchemas/connections/pipeline/domoPipelineConnection.json'
        )
      ).default;

      break;
    }
    case PipelineServiceType.CustomPipeline: {
      schema = (
        await import(
          '../jsons/connectionSchemas/connections/pipeline/customPipelineConnection.json'
        )
      ).default;

      break;
    }
    case PipelineServiceType.DatabricksPipeline: {
      schema = (
        await import(
          '../jsons/connectionSchemas/connections/pipeline/databricksPipelineConnection.json'
        )
      ).default;

      break;
    }
    case PipelineServiceType.Spline: {
      schema = (
        await import(
          '../jsons/connectionSchemas/connections/pipeline/splineConnection.json'
        )
      ).default;

      break;
    }
    case PipelineServiceType.OpenLineage: {
      schema = (
        await import(
          '../jsons/connectionSchemas/connections/pipeline/openLineageConnection.json'
        )
      ).default;

      break;
    }
    case PipelineServiceType.Flink: {
      schema = (
        await import(
          '../jsons/connectionSchemas/connections/pipeline/flinkConnection.json'
        )
      ).default;

      break;
    }
    default:
      break;
  }

  return cloneDeep({ schema, uiSchema });
};
