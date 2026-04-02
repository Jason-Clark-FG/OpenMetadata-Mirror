from metadata.ingestion.source.database.burstiq.lineage import BurstiqLineageSource
from metadata.ingestion.source.database.burstiq.metadata import Burstiqsource
from metadata.profiler.interface.pandas.profiler_interface import PandasProfilerInterface
from metadata.sampler.pandas.burstiq.sampler import BurstIQSampler
from metadata.utils.service_spec.default import DefaultDatabaseSpec

ServiceSpec = DefaultDatabaseSpec(
    metadata_source_class=Burstiqsource,
    lineage_source_class=BurstiqLineageSource,
    profiler_class=PandasProfilerInterface,
    sampler_class=BurstIQSampler,
)
