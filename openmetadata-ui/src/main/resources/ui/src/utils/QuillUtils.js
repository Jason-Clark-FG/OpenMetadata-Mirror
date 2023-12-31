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

// TODO: Later convert this method to support typescript.
export function insertMention() {
  const mention = this.quill.getModule('mention');
  mention.openMenu('@');
}

export function insertRef() {
  const ref = this.quill.getModule('mention');
  ref.openMenu('#');
}

export function directionHandler(value) {
  const { align } = this.quill.getFormat();

  // get the editor container
  const container = document.getElementById('om-quill-editor');

  if (value === 'rtl' && align == null) {
    container.setAttribute('data-dir', value);
    this.quill.format('align', 'right', 'user');
  } else if (!value && align === 'right') {
    this.quill.format('align', false, 'user');
    container.setAttribute('data-dir', 'ltr');
  }
  this.quill.format('direction', value, 'user');
}
