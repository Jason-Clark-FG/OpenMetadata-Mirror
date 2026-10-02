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

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { ReactNode } from 'react';
import type { Task } from '../../../../../generated/entity/tasks/task';

const mockListTasks = jest.fn();
const mockListVisibleTasks = jest.fn();
const mockShowErrorToast = jest.fn();
const mockInvalidateQueries = jest.fn();

jest.mock('utils/ToastUtils', () => ({
  showErrorToast: mockShowErrorToast,
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
  useQueries: () => [{ data: 0 }, { data: 0 }, { data: 0 }],
}));

jest.mock('../useInboxCounts', () => ({
  INBOX_COUNTS_QUERY_KEY: 'inbox-counts',
}));

jest.mock('rest/tasksAPI', () => ({
  listTasks: (...a: unknown[]) => mockListTasks(...a),
  listMyVisibleTasks: (...a: unknown[]) => mockListVisibleTasks(...a),
  TaskStatusGroup: { Open: 'open', Closed: 'closed' },
}));

jest.mock('../components/InboxFilterBar', () => ({
  __esModule: true,
  default: ({ left }: { left?: ReactNode }) => <div>{left}</div>,
}));

jest.mock('../components/InboxTaskListItem', () => ({
  __esModule: true,
  default: ({
    task,
    onClick,
  }: {
    task: Task;
    onClick: (task: Task) => void;
  }) => (
    <button data-testid={`task-${task.id}`} onClick={() => onClick(task)}>
      {task.id}
    </button>
  ),
}));

jest.mock('../components/InboxTaskListSkeleton', () => ({
  __esModule: true,
  default: () => <div data-testid="list-skeleton" />,
}));

jest.mock('../components/TaskDetailPanel', () => ({
  __esModule: true,
  default: ({
    taskId,
    onTaskUpdated,
  }: {
    taskId?: string;
    onTaskUpdated: (...args: unknown[]) => void;
  }) => (
    <div data-testid="detail">
      <span>{taskId}</span>
      <button
        data-testid="update"
        onClick={() =>
          onTaskUpdated({
            id: taskId,
            assignees: [{ id: 'u2', type: 'user', name: 'bob' }],
          })
        }>
        update
      </button>
    </div>
  ),
}));

jest.mock('../components/TaskDetailSkeleton', () => ({
  __esModule: true,
  default: () => <div data-testid="detail-skeleton" />,
}));

jest.mock('components/common/Loader/Loader', () => ({
  __esModule: true,
  default: () => <div data-testid="loader" />,
}));

let tabsOnChange: ((key: string) => void) | undefined;

jest.mock('@openmetadata/ui-core-components', () => {
  const TabsRoot = ({
    onSelectionChange,
    children,
  }: {
    onSelectionChange?: (...args: unknown[]) => void;
    children?: ReactNode;
  }) => {
    tabsOnChange = onSelectionChange;

    return <div>{children}</div>;
  };
  const TabsList = ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  );
  const TabsItem = ({ id, label }: { id: string; label?: ReactNode }) => (
    <button
      data-testid={`task-status-${id}`}
      type="button"
      onClick={() => tabsOnChange?.(id)}>
      {label}
    </button>
  );

  const Tabs = Object.assign(TabsRoot, { List: TabsList, Item: TabsItem });

  return {
    Box: ({
      children,
      className,
      ...props
    }: {
      children?: ReactNode;
      className?: string;
      'data-testid'?: string;
    }) => (
      <div className={className} data-testid={props['data-testid']}>
        {children}
      </div>
    ),
    Skeleton: () => <div data-testid="skeleton" />,
    Typography: ({ children }: { children?: ReactNode }) => (
      <span>{children}</span>
    ),
    EmptyPlaceholder: ({
      title,
      description,
      ...props
    }: {
      title?: ReactNode;
      description?: ReactNode;
      'data-testid'?: string;
    }) => (
      <div data-testid={props['data-testid']}>
        <span>{title}</span>
        <span>{description}</span>
      </div>
    ),
    Tabs,
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import TasksTab, { TasksTabProps } from './TasksTab';

class MockIntersectionObserver {
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
  takeRecords = jest.fn();
  root = null;
  rootMargin = '';
  thresholds = [];
  constructor(_cb: IntersectionObserverCallback) {
    // No-op: the real hook drives pagination via this observer, but the
    // integration tests never scroll, so never fire the callback.
  }
}

const renderTab = (props: Partial<TasksTabProps> = {}) =>
  render(
    <TasksTab
      defaultDateRange={{ startTs: 0, endTs: 0 }}
      onDateRangeChange={jest.fn()}
      {...props}
    />
  );

describe('TasksTab (integration with real useInboxInfiniteList)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (
      global as unknown as { IntersectionObserver: unknown }
    ).IntersectionObserver = MockIntersectionObserver;
    mockListTasks.mockResolvedValue({ paging: { total: 0 } });
    mockListVisibleTasks.mockResolvedValue({ paging: { total: 0 } });
  });

  it('clears stale Open rows and shows the Closed empty state when the Closed-tab reload rejects', async () => {
    mockListVisibleTasks
      .mockResolvedValueOnce({ data: [{ id: 't1' }], paging: { total: 1 } })
      .mockRejectedValue(new Error('boom'));

    await act(async () => {
      renderTab();
    });
    await waitFor(() =>
      expect(screen.getByTestId('task-t1')).toBeInTheDocument()
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('task-status-closed'));
    });
    await waitFor(() => expect(mockShowErrorToast).toHaveBeenCalled());

    expect(screen.queryByTestId('task-t1')).toBeNull();
    expect(screen.getByTestId('inbox-tasks-closed-empty')).toBeInTheDocument();
  });

  it('clears the stale row and still invalidates badge counts when the handleTaskUpdated reload rejects', async () => {
    mockListVisibleTasks
      .mockResolvedValueOnce({ data: [{ id: 't1' }], paging: { total: 1 } })
      .mockRejectedValue(new Error('boom'));

    await act(async () => {
      renderTab();
    });
    await waitFor(() =>
      expect(screen.getByTestId('task-t1')).toBeInTheDocument()
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('task-t1'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('detail')).toBeInTheDocument()
    );

    mockInvalidateQueries.mockClear();
    await act(async () => {
      fireEvent.click(screen.getByTestId('update'));
    });
    await waitFor(() => expect(mockShowErrorToast).toHaveBeenCalled());

    expect(screen.queryByTestId('task-t1')).toBeNull();
    expect(screen.getByTestId('inbox-tasks-open-empty')).toBeInTheDocument();
    expect(mockInvalidateQueries).toHaveBeenCalled();
  });
});
