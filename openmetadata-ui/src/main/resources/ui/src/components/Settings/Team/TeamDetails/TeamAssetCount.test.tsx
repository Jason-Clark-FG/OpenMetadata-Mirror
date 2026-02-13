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
import { render, screen } from '@testing-library/react';
import { SearchIndex } from '../../../../enums/search.enum';
import { Team } from '../../../../generated/entity/teams/team';

jest.mock('./TeamDetailsV1.utils', () => ({
  collectAllTeamIds: jest.fn(),
}));

jest.mock('../../../../utils/SearchUtils', () => ({
  getTermQuery: jest.fn(),
}));

jest.mock('../../../../rest/searchAPI', () => ({
  searchQuery: jest.fn(),
}));

jest.mock('antd', () => ({
  Skeleton: {
    Input: jest.fn().mockImplementation(() => <div data-testid="skeleton" />),
  },
  Typography: {
    Text: jest
      .fn()
      .mockImplementation(({ children }) => <span>{children}</span>),
  },
}));

import { collectAllTeamIds } from './TeamDetailsV1.utils';
import { getTermQuery } from '../../../../utils/SearchUtils';
import { searchQuery } from '../../../../rest/searchAPI';
import { TeamAssetCount } from './TeamAssetCount.component';

const mockTeamLeaf = {
  id: 'leaf-id',
  name: 'Leaf',
  fullyQualifiedName: 'Org.Leaf',
  teamType: 'Group',
  childrenCount: 0,
  owns: [{ id: 'asset1' }, { id: 'asset2' }],
} as Team;

const mockTeamParent = {
  id: 'parent-id',
  name: 'Parent',
  fullyQualifiedName: 'Org.Parent',
  teamType: 'BusinessUnit',
  childrenCount: 2,
  owns: [],
} as Team;

describe('TeamAssetCount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should query search API for leaf team (no collectAllTeamIds call)', async () => {
    (getTermQuery as jest.Mock).mockReturnValue({ query: 'mock' });
    (searchQuery as jest.Mock).mockResolvedValue({
      hits: { total: { value: 5 } },
    });

    render(<TeamAssetCount team={mockTeamLeaf} />);

    expect(await screen.findByText('5')).toBeInTheDocument();
    // Leaf teams should NOT call collectAllTeamIds
    expect(collectAllTeamIds).not.toHaveBeenCalled();
    expect(searchQuery).toHaveBeenCalledWith({
      query: '',
      pageNumber: 0,
      pageSize: 0,
      queryFilter: { query: 'mock' },
      searchIndex: SearchIndex.ALL,
    });
  });

  it('should fetch aggregated count for parent team using collectAllTeamIds', async () => {
    const mockIds = ['parent-id', 'child-id'];
    (collectAllTeamIds as jest.Mock).mockResolvedValue(mockIds);
    (getTermQuery as jest.Mock).mockReturnValue({ query: 'mock' });
    (searchQuery as jest.Mock).mockResolvedValue({
      hits: { total: { value: 10 } },
    });

    render(<TeamAssetCount team={mockTeamParent} />);

    expect(await screen.findByText('10')).toBeInTheDocument();
    expect(collectAllTeamIds).toHaveBeenCalledWith(mockTeamParent);
  });

  it('should handle API error gracefully by showing owns length', async () => {
    (collectAllTeamIds as jest.Mock).mockRejectedValue(new Error('Failed'));

    render(<TeamAssetCount team={mockTeamParent} />);

    expect(await screen.findByText('0')).toBeInTheDocument();
  });
});
