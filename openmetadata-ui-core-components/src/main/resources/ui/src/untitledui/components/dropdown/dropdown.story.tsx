/*
 *  Copyright 2025 Collate.
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

import type { FC } from "react";
import * as Dropdowns from "../dropdown/dropdown.demo";

export default {
    title: "Base components/Dropdowns",
    decorators: [
        (Story: FC) => (
            <div className="flex min-h-screen w-full items-start justify-center bg-primary p-8">
                <Story />
            </div>
        ),
    ],
};

export const DropdownButton = () => <Dropdowns.DropdownButton />;
DropdownButton.storyName = "Dropdown button";

export const DropdownIcon = () => <Dropdowns.DropdownIcon />;
DropdownIcon.storyName = "Dropdown icon";

export const DropdownAvatar = () => <Dropdowns.DropdownAvatar />;
DropdownAvatar.storyName = "Dropdown avatar";
