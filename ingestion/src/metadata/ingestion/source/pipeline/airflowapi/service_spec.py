from metadata.ingestion.source.pipeline.airflowapi.metadata import AirflowApiSource
from metadata.utils.service_spec import BaseSpec

ServiceSpec = BaseSpec(metadata_source_class=AirflowApiSource)
