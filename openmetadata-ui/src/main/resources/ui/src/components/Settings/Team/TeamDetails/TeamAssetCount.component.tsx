/*
 *  Copyright 2023 Collate.
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
import { Skeleton, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { SearchIndex } from '../../../../enums/search.enum';
import { Team } from '../../../../generated/entity/teams/team';
import { searchQuery } from '../../../../rest/searchAPI';
import { getTermQuery } from '../../../../utils/SearchUtils';
import { collectAllTeamIds } from './TeamDetailsV1.utils';

interface TeamAssetCountProps {
  team: Team;
}

export const TeamAssetCount = ({ team }: TeamAssetCountProps) => {
  const [count, setCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // If team has no children, just use the local 'owns' count which is accurate for leaf nodes
    // and avoids an API call.
    if (!team.childrenCount || team.childrenCount === 0) {
      setCount(team.owns?.length ?? 0);

      return;
    }

    const fetchAggregatedCount = async () => {
      setIsLoading(true);
      try {
        // Collect all team IDs (current team + all descendants)
        const teamIds = await collectAllTeamIds(team);

        // Query assets owned by any of these teams using 'should' (OR)
        const queryFilter = getTermQuery({ 'owners.id': teamIds }, 'should', 1);

        const res = await searchQuery({
          query: '',
          pageNumber: 0,
          pageSize: 0,
          queryFilter,
          searchIndex: SearchIndex.ALL,
        });
        setCount(res.hits.total.value);
      } catch (error) {
        // Fallback to direct ownership count on error
        setCount(team.owns?.length ?? 0);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAggregatedCount();
  }, [team.id, team.fullyQualifiedName, team.childrenCount, team.owns?.length]);

  if (isLoading) {
    return <Skeleton.Input active size="small" style={{ width: 30, height: 20 }} />;
  }

  return <Typography.Text data-testid="asset-count">{count ?? 0}</Typography.Text>;
};
