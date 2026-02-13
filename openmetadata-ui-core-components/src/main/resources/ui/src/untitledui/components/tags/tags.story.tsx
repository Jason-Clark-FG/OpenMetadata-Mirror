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
import * as Tags from "../tags/tags.demo";

export default {
    title: "Base components/Tags",
    decorators: [
        (Story: FC) => (
            <div className="flex min-h-screen w-full overflow-auto bg-primary p-4">
                <Story />
            </div>
        ),
    ],
};

export const Default = () => <Tags.Default />;

export const CloseX = () => <Tags.CloseX />;

export const Count = () => <Tags.Count />;

export const CheckboxDefault = () => <Tags.CheckboxDefault />;
CheckboxDefault.storyName = "Checkbox default";

export const CheckboxCloseX = () => <Tags.CheckboxCloseX />;
CheckboxCloseX.storyName = "Checkbox close X";

export const CheckboxCount = () => <Tags.CheckboxCount />;
CheckboxCount.storyName = "Checkbox count";
