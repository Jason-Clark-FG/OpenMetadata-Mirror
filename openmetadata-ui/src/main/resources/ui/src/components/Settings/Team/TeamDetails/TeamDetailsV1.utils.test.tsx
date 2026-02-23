/*
 *  Copyright 2026 Collate.
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

import { Team } from '../../../../generated/entity/teams/team';
import { getTabs } from './TeamDetailsV1.utils';
import { TeamsPageTab } from './team.interface';

describe('getTabs', () => {
  const baseTeam: Team = {
    id: 'test-id',
    name: 'test-team',
    fullyQualifiedName: 'test-team',
    href: '',
    users: [
      { id: 'u1', type: 'user', name: 'user1', href: '' },
      { id: 'u2', type: 'user', name: 'user2', href: '' },
    ],
    defaultRoles: [{ id: 'r1', type: 'role', name: 'role1', href: '' }],
    policies: [{ id: 'p1', type: 'policy', name: 'policy1', href: '' }],
  };

  it('should return teams, roles, and policies tabs for Organization', () => {
    const tabs = getTabs(baseTeam, false, true, 5, 10, false);
    const tabKeys = tabs.map((t) => t.key);

    expect(tabKeys).toEqual([
      TeamsPageTab.TEAMS,
      TeamsPageTab.ROLES,
      TeamsPageTab.POLICIES,
    ]);
  });

  it('should return users, assets, roles, and policies tabs for Group type', () => {
    const tabs = getTabs(baseTeam, true, false, 5, 10, false);
    const tabKeys = tabs.map((t) => t.key);

    expect(tabKeys).toEqual([
      TeamsPageTab.USERS,
      TeamsPageTab.ASSETS,
      TeamsPageTab.ROLES,
      TeamsPageTab.POLICIES,
    ]);
  });

  it('should return teams, users, assets, roles, and policies tabs for Department type', () => {
    const tabs = getTabs(baseTeam, false, false, 5, 10, false);
    const tabKeys = tabs.map((t) => t.key);

    expect(tabKeys).toEqual([
      TeamsPageTab.TEAMS,
      TeamsPageTab.USERS,
      TeamsPageTab.ASSETS,
      TeamsPageTab.ROLES,
      TeamsPageTab.POLICIES,
    ]);
  });

  it('should include correct asset count', () => {
    const tabs = getTabs(baseTeam, false, false, 5, 42, false);
    const assetsTab = tabs.find((t) => t.key === TeamsPageTab.ASSETS);

    expect(assetsTab?.count).toBe(42);
  });

  it('should include correct user count from team data', () => {
    const tabs = getTabs(baseTeam, true, false, 5, 10, false);
    const usersTab = tabs.find((t) => t.key === TeamsPageTab.USERS);

    expect(usersTab?.count).toBe(2);
  });

  it('should include correct team count', () => {
    const tabs = getTabs(baseTeam, false, false, 7, 10, false);
    const teamsTab = tabs.find((t) => t.key === TeamsPageTab.TEAMS);

    expect(teamsTab?.count).toBe(7);
  });
});

jest.mock('../../../../rest/teamsAPI', () => ({
  getTeams: jest.fn(),
}));

import { getTeams } from '../../../../rest/teamsAPI';
import { collectAllTeamIds } from './TeamDetailsV1.utils';
import { Include } from '../../../../generated/type/include';
import { TabSpecificField } from '../../../../enums/entity.enum';

describe('collectAllTeamIds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return only the team id if the team has no children', async () => {
    const team: Team = {
      id: 'team1',
      name: 'Team 1',
      fullyQualifiedName: 'team1',
      href: '',
    };

    const ids = await collectAllTeamIds(team);
    expect(ids).toEqual(['team1']);
    expect(getTeams).not.toHaveBeenCalled();
  });

  it('should pass fullyQualifiedName to getTeams when team has children', async () => {
    const parentTeam: Team = {
      id: 'parent-id',
      name: 'nested-team', // Intentionally different from FQN
      fullyQualifiedName: 'org.marketorg.nested-team',
      href: '',
      childrenCount: 1,
    };

    const childTeam: Team = {
      id: 'child1-id',
      name: 'child1',
      fullyQualifiedName: 'org.marketorg.nested-team.child1',
      href: '',
      childrenCount: 0,
    };

    (getTeams as jest.Mock).mockResolvedValueOnce({
      data: [childTeam],
    });

    const ids = await collectAllTeamIds(parentTeam);

    expect(getTeams).toHaveBeenCalledTimes(1);
    expect(getTeams).toHaveBeenCalledWith({
      parentTeam: 'org.marketorg.nested-team', // Should use FQN
      include: Include.NonDeleted,
      fields: [TabSpecificField.CHILDREN_COUNT],
    });
    expect(ids).toEqual(['parent-id', 'child1-id']);
  });

  it('should recursively fetch and accumulate all child team ids', async () => {
    const parentTeam: Team = {
      id: 'root-id',
      name: 'root',
      fullyQualifiedName: 'root',
      href: '',
      childrenCount: 2,
    };

    const childTeam1: Team = {
      id: 'c1-id',
      name: 'c1',
      fullyQualifiedName: 'root.c1',
      href: '',
      childrenCount: 1,
    };

    const childTeam2: Team = {
      id: 'c2-id',
      name: 'c2',
      fullyQualifiedName: 'root.c2',
      href: '',
      childrenCount: 0,
    };

    const grandchildTeam: Team = {
      id: 'gc1-id',
      name: 'gc1',
      fullyQualifiedName: 'root.c1.gc1',
      href: '',
      childrenCount: 0,
    };

    (getTeams as jest.Mock)
      .mockResolvedValueOnce({ data: [childTeam1, childTeam2] }) // root children
      .mockResolvedValueOnce({ data: [grandchildTeam] }); // child1 children

    const ids = await collectAllTeamIds(parentTeam);

    expect(getTeams).toHaveBeenCalledTimes(2); // Called for root and child1
    expect(getTeams).toHaveBeenNthCalledWith(1, {
      parentTeam: 'root',
      include: Include.NonDeleted,
      fields: [TabSpecificField.CHILDREN_COUNT],
    });
    expect(getTeams).toHaveBeenNthCalledWith(2, {
      parentTeam: 'root.c1',
      include: Include.NonDeleted,
      fields: [TabSpecificField.CHILDREN_COUNT],
    });

    expect(ids).toEqual(['root-id', 'c1-id', 'gc1-id', 'c2-id']);
  });

  it('should populate resultMap with per-team descendant IDs when provided', async () => {
    const parentTeam: Team = {
      id: 'root-id',
      name: 'root',
      fullyQualifiedName: 'root',
      href: '',
      childrenCount: 1,
    };

    const childTeam: Team = {
      id: 'child-id',
      name: 'child',
      fullyQualifiedName: 'root.child',
      href: '',
      childrenCount: 0,
    };

    (getTeams as jest.Mock).mockResolvedValueOnce({
      data: [childTeam],
    });

    const resultMap = new Map<string, string[]>();
    const ids = await collectAllTeamIds(parentTeam, resultMap);

    expect(ids).toEqual(['root-id', 'child-id']);
    expect(resultMap.get('root-id')).toEqual(['root-id', 'child-id']);
    expect(resultMap.get('child-id')).toEqual(['child-id']);
  });

  it('should not mutate resultMap when not provided', async () => {
    const team: Team = {
      id: 'solo-id',
      name: 'solo',
      fullyQualifiedName: 'solo',
      href: '',
    };

    const ids = await collectAllTeamIds(team);

    expect(ids).toEqual(['solo-id']);
    // No error thrown — resultMap is optional
  });
});

