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

class LoginClassBase {
  public getLoginCarouselContent() {
    const carouselContent = [
      {
        title: 'governance',
        imagePath: () =>
          import('../assets/img/login-screen/governance/governance.png').then(
            (m) => m.default
          ),
        descriptionKey: 'assess-data-reliability-with-data-profiler-lineage',
      },
      {
        title: 'data-collaboration',
        imagePath: () =>
          import(
            '../assets/img/login-screen/data-collaboration/data-collaboration.png'
          ).then((m) => m.default),
        descriptionKey: 'deeply-understand-table-relations-message',
      },
      {
        title: 'data-observability',
        imagePath: () =>
          import(
            '../assets/img/login-screen/observability/data-observability.png'
          ).then((m) => m.default),
        descriptionKey:
          'discover-your-data-and-unlock-the-value-of-data-assets',
      },
      {
        title: 'data-discovery',
        imagePath: () =>
          import(
            '../assets/img/login-screen/discovery/data-discovery.png'
          ).then((m) => m.default),
        descriptionKey: 'enables-end-to-end-metadata-management',
      },
    ];

    return carouselContent;
  }
}

const loginClassBase = new LoginClassBase();

export default loginClassBase;
export { LoginClassBase };
