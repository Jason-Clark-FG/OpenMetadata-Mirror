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

import { AxiosError } from 'axios';
import { TabSpecificField } from '../../../../enums/entity.enum';
import { SearchIndex } from '../../../../enums/search.enum';
import { Team } from '../../../../generated/entity/teams/team';
import { Include } from '../../../../generated/type/include';
import { searchQuery } from '../../../../rest/searchAPI';
import { getTeams } from '../../../../rest/teamsAPI';
import { getTermQuery } from '../../../../utils/SearchUtils';
import i18n from '../../../../utils/i18next/LocalUtil';
import { showErrorToast } from '../../../../utils/ToastUtils';
import { TeamsPageTab, TeamTab } from './team.interface';

export const getTabs = (
  currentTeam: Team,
  isGroupType: boolean,
  isOrganization: boolean,
  teamsCount: number,
  assetsCount: number,
  isTeamsLoading: boolean
): TeamTab[] => {
  const tabs: Record<string, TeamTab> = {
    teams: {
      name: i18n.t('label.team-plural'),
      count: teamsCount,
      key: TeamsPageTab.TEAMS,
      isLoading: isTeamsLoading,
    },
    users: {
      name: i18n.t('label.user-plural'),
      count: currentTeam.users?.length ?? 0,
      key: TeamsPageTab.USERS,
    },
    assets: {
      name: i18n.t('label.asset-plural'),
      count: assetsCount,
      key: TeamsPageTab.ASSETS,
    },
    roles: {
      name: i18n.t('label.role-plural'),
      count: currentTeam?.defaultRoles?.length,
      key: TeamsPageTab.ROLES,
    },
    policies: {
      name: i18n.t('label.policy-plural'),
      count: currentTeam?.policies?.length,
      key: TeamsPageTab.POLICIES,
    },
  };

  const commonTabs = [tabs.roles, tabs.policies];

  if (isOrganization) {
    return [tabs.teams, ...commonTabs];
  }

  if (isGroupType) {
    return [tabs.users, tabs.assets, ...commonTabs];
  }

  return [tabs.teams, tabs.users, tabs.assets, ...commonTabs];
};

/**
 * Recursively counts assets owned by a team and all its descendants.
 * Makes one small search query per team to avoid 414 URI Too Long errors.
 *
 * @param team - Team to count assets for
 * @returns Total number of assets owned by the team and all its descendants
 */
export const getAggregatedAssetCount = async (team: Team): Promise<number> => {
  // Count assets owned directly by this team
  const queryFilter = getTermQuery({ 'owners.id': [team.id] }, 'should', 1);

  const res = await searchQuery({
    query: '',
    pageNumber: 0,
    pageSize: 0,
    queryFilter,
    searchIndex: SearchIndex.ALL,
  });

  let total = res.hits.total.value;

  // Recursively count children
  if (team.childrenCount && team.childrenCount > 0) {
    try {
      const { data: childTeams } = await getTeams({
        parentTeam: team.name,
        include: Include.NonDeleted,
        fields: [TabSpecificField.CHILDREN_COUNT],
      });

      for (const child of childTeams) {
        total += await getAggregatedAssetCount(child);
      }
    } catch (error) {
      showErrorToast(
        error as AxiosError,
        i18n.t('server.entity-fetch-error', {
          entity: i18n.t('label.team-plural-lowercase'),
        })
      );
    }
  }

  return total;
};

/**
 * Recursively collect all descendant team IDs from a team.
 * Used by the Assets tab to build a query filter for displaying assets.
 *
 * @param team - Team to collect descendants from
 * @returns Array of team IDs including the team itself and all descendants
 */
export const collectAllTeamIds = async (team: Team): Promise<string[]> => {
  const teamIds: string[] = [team.id];

  if (team.childrenCount && team.childrenCount > 0) {
    try {
      const { data: childTeams } = await getTeams({
        parentTeam: team.name,
        include: Include.NonDeleted,
        fields: [TabSpecificField.CHILDREN_COUNT],
      });

      for (const child of childTeams) {
        const childIds = await collectAllTeamIds(child);
        teamIds.push(...childIds);
      }
    } catch (error) {
      showErrorToast(
        error as AxiosError,
        i18n.t('server.entity-fetch-error', {
          entity: i18n.t('label.team-plural-lowercase'),
        })
      );
    }
  }

  return teamIds;
};
