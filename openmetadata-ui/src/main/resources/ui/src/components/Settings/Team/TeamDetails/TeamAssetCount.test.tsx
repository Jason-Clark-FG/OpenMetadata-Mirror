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
import { Team } from '../../../../generated/entity/teams/team';

jest.mock('./TeamDetailsV1.utils', () => ({
  getAggregatedAssetCount: jest.fn(),
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

import { getAggregatedAssetCount } from './TeamDetailsV1.utils';
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
  it('should render local count for Group team', async () => {
    render(<TeamAssetCount team={mockTeamLeaf} />);

    expect(await screen.findByText('2')).toBeInTheDocument();
    expect(getAggregatedAssetCount).not.toHaveBeenCalled();
  });

  it('should fetch aggregated count for non-Group team', async () => {
    (getAggregatedAssetCount as jest.Mock).mockResolvedValue(10);

    render(<TeamAssetCount team={mockTeamParent} />);

    expect(await screen.findByText('10')).toBeInTheDocument();
    expect(getAggregatedAssetCount).toHaveBeenCalledWith(mockTeamParent);
  });

  it('should handle API error gracefully by showing 0 (or owns length)', async () => {
    (getAggregatedAssetCount as jest.Mock).mockRejectedValue(
      new Error('Failed')
    );

    render(<TeamAssetCount team={mockTeamParent} />);

    expect(await screen.findByText('0')).toBeInTheDocument();
  });
});
