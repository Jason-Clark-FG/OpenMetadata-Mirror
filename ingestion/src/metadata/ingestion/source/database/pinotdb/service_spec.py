from metadata.ingestion.source.database.pinotdb.lineage import PinotdbLineageSource
from metadata.ingestion.source.database.pinotdb.metadata import PinotdbSource
from metadata.profiler.interface.sqlalchemy.pinotdb.profiler_interface import (
    PinotDBProfilerInterface,
)
from metadata.sampler.sqlalchemy.pinot.sampler import PinotDBSampler
from metadata.utils.service_spec.default import DefaultDatabaseSpec

ServiceSpec = DefaultDatabaseSpec(
    metadata_source_class=PinotdbSource,
    lineage_source_class=PinotdbLineageSource,
    sampler_class=PinotDBSampler,
    profiler_class=PinotDBProfilerInterface,
)
