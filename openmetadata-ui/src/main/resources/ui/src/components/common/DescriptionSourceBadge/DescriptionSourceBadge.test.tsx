/*
 *  Copyright 2024 Collate.
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
import { ChangeSource } from '../../../generated/entity/classification/tag';
import DescriptionSourceBadge from './DescriptionSourceBadge';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('../../../utils/date-time/DateTimeUtils', () => ({
  formatDateTime: jest.fn((ts: number) => `formatted-${ts}`),
}));

jest.mock('../../../assets/svg/automated-tag.svg', () => ({
  ReactComponent: () => <div data-testid="automated-tag-icon" />,
}));

describe('DescriptionSourceBadge', () => {
  it('should render nothing when changeSummaryEntry is undefined', () => {
    const { container } = render(
      <DescriptionSourceBadge changeSummaryEntry={undefined} />
    );

    expect(container.firstChild).toBeNull();
  });

  it('should render nothing when changeSource is undefined', () => {
    const { container } = render(
      <DescriptionSourceBadge changeSummaryEntry={{ changedBy: 'admin' }} />
    );

    expect(container.firstChild).toBeNull();
  });

  it('should render nothing for Manual changeSource', () => {
    const { container } = render(
      <DescriptionSourceBadge
        changeSummaryEntry={{
          changeSource: ChangeSource.Manual,
          changedBy: 'admin',
        }}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('should render AI badge for Suggested changeSource', () => {
    render(
      <DescriptionSourceBadge
        changeSummaryEntry={{
          changeSource: ChangeSource.Suggested,
          changedBy: 'admin',
          changedAt: 1700000000000,
        }}
      />
    );

    expect(screen.getByTestId('ai-generated-badge')).toBeInTheDocument();
    expect(screen.getByTestId('automated-tag-icon')).toBeInTheDocument();
  });

  it('should render AI badge for Automated changeSource', () => {
    render(
      <DescriptionSourceBadge
        changeSummaryEntry={{
          changeSource: ChangeSource.Automated,
          changedBy: 'bot',
        }}
      />
    );

    expect(screen.getByTestId('ai-generated-badge')).toBeInTheDocument();
  });

  it('should not render AI badge for Ingested changeSource', () => {
    const { container } = render(
      <DescriptionSourceBadge
        changeSummaryEntry={{
          changeSource: ChangeSource.Ingested,
          changedBy: 'ingestion',
        }}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('should not render AI badge for Derived changeSource', () => {
    const { container } = render(
      <DescriptionSourceBadge
        changeSummaryEntry={{
          changeSource: ChangeSource.Derived,
        }}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('should not render AI badge for Propagated changeSource', () => {
    const { container } = render(
      <DescriptionSourceBadge
        changeSummaryEntry={{
          changeSource: ChangeSource.Propagated,
        }}
      />
    );

    expect(container.firstChild).toBeNull();
  });
});
