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

import { findByTestId, fireEvent, render } from '@testing-library/react';
import { KeyboardEvent } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { FeedEditor } from './FeedEditor';

const onSave = jest.fn();
const onChangeHandler = jest.fn();

const mockFeedEditorProp = {
  onChangeHandler: onChangeHandler,
  onSave: onSave,
};

jest.unmock('./FeedEditor');

jest.mock('@windmillcode/quill-emoji', () => ({
  TextAreaEmoji: jest.fn(),
}));

jest.mock('quill', () => ({
  Parchment: {},
}));

jest.mock('quill-mention/autoregister', () => ({}));

jest.mock('react-quill-new', () => {
  class MockQuill {
    register() {}
    import(val: string) {
      return val;
    }
  }

  return {
    __esModule: true,
    Quill: new MockQuill(),
    default: jest.fn().mockImplementation(
      (props: {
        onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
      }) => {
        return (
          <div data-testid="react-quill" onKeyDown={props.onKeyDown}>
            editor
          </div>
        );
      }
    ),
  };
});

jest.mock('../../../utils/QuillLink/QuillLink', () => ({
  LinkBlot: jest.fn(),
}));

jest.mock('../../../hooks/useApplicationStore', () => ({
  useApplicationStore: jest.fn().mockReturnValue({ userProfilePics: {} }),
}));

jest.mock('../../../rest/userAPI', () => ({
  getUserByName: jest.fn(),
}));

jest.mock('../../../utils/FeedUtils', () => ({
  HTMLToMarkdown: { turndown: jest.fn() },
  suggestions: jest.fn(),
  userMentionItemWithAvatar: jest.fn(),
}));

jest.mock('../../../utils/QuillUtils', () => ({
  insertMention: jest.fn(),
  insertRef: jest.fn(),
}));

jest.mock('../../../utils/sanitize.utils', () => ({
  getSanitizeContent: jest.fn().mockImplementation((v: string) => v),
}));

jest.mock('../../../utils/SearchClassBase', () => ({
  __esModule: true,
  default: { getEntityIcon: jest.fn() },
}));

describe('Test FeedEditor Component', () => {
  it('Should render FeedEditor Component', async () => {
    const { container } = render(<FeedEditor {...mockFeedEditorProp} />, {
      wrapper: MemoryRouter,
    });

    const editorWrapper = await findByTestId(container, 'editor-wrapper');

    expect(editorWrapper).toBeInTheDocument();
  });

  it("Should call onSave method on 'Enter' keydown", async () => {
    const { container } = render(<FeedEditor {...mockFeedEditorProp} />, {
      wrapper: MemoryRouter,
    });
    const reactQuill = await findByTestId(container, 'react-quill');

    expect(reactQuill).toBeInTheDocument();

    fireEvent.keyDown(reactQuill, {
      key: 'Enter',
      shiftKey: false,
    });

    expect(onSave).toHaveBeenCalled();
  });

  it("Should not call onSave method on 'Enter' + 'Shift' keydown", async () => {
    const { container } = render(<FeedEditor {...mockFeedEditorProp} />, {
      wrapper: MemoryRouter,
    });
    const reactQuill = await findByTestId(container, 'react-quill');

    expect(reactQuill).toBeInTheDocument();

    fireEvent.keyDown(reactQuill, {
      key: 'Enter',
      shiftKey: true,
    });

    expect(onSave).not.toHaveBeenCalled();
  });

  it("Should not call onSave method on 'Enter' keydown with isComposing=true (IME operation)", async () => {
    const { container } = render(<FeedEditor {...mockFeedEditorProp} />, {
      wrapper: MemoryRouter,
    });
    const reactQuill = await findByTestId(container, 'react-quill');

    expect(reactQuill).toBeInTheDocument();

    fireEvent.keyDown(reactQuill, {
      key: 'Enter',
      isComposing: true,
    });

    expect(onSave).not.toHaveBeenCalled();
  });

  it("Should not call onSave method on 'Enter' keydown with keyCode=229 (IME operation, legacy)", async () => {
    const { container } = render(<FeedEditor {...mockFeedEditorProp} />, {
      wrapper: MemoryRouter,
    });
    const reactQuill = await findByTestId(container, 'react-quill');

    expect(reactQuill).toBeInTheDocument();

    fireEvent.keyDown(reactQuill, {
      key: 'Enter',
      keyCode: 229,
    });

    expect(onSave).not.toHaveBeenCalled();
  });
});
