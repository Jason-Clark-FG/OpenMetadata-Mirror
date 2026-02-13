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
import * as Sliders from "../slider/slider.demo";

export default {
    title: "Base components/Sliders",
    decorators: [
        (Story: FC) => (
            <div className="bg-primary p-16">
                <div className="max-w-xs">
                    <Story />
                </div>
            </div>
        ),
    ],
};

export const Default = () => <Sliders.Default />;

export const BottomLabel = () => <Sliders.BottomLabel />;
BottomLabel.storyName = "Bottom label";

export const TopFloating = () => <Sliders.TopFloating />;
TopFloating.storyName = "Top floating";

export const SingleThumb = () => <Sliders.SingleThumb />;
SingleThumb.storyName = "Single thumb";
