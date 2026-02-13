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
import * as Demos from "./progress-indicators.demo";

export default {
    title: "Base components/Progress indicators",
};

const DefaultDecorator = (Story: FC) => (
    <div className="flex min-h-screen w-screen bg-primary p-16">
        <div className="w-full max-w-xs">
            <Story />
        </div>
    </div>
);

const WiderDecorator = (Story: FC) => (
    <div className="flex min-h-screen w-full bg-primary p-16">
        <div className="w-100">
            <Story />
        </div>
    </div>
);

export const Default = () => <Demos.ProgressBarDefault />;
Default.decorators = [DefaultDecorator];

export const TextRight = () => <Demos.ProgressBarTextRight />;
TextRight.decorators = [DefaultDecorator];
TextRight.storyName = "Text right";

export const TextBottom = () => <Demos.ProgressBarTextBottom />;
TextBottom.decorators = [DefaultDecorator];
TextBottom.storyName = "Text bottom";

export const TextTopFloating = () => <Demos.ProgressBarTextTopFloating />;
TextTopFloating.decorators = [DefaultDecorator];
TextTopFloating.storyName = "Text top floating";

export const TextBottomFloating = () => <Demos.ProgressBarTextBottomFloating />;
TextBottomFloating.decorators = [DefaultDecorator];
TextBottomFloating.storyName = "Text bottom floating";

export const CircleProgressBar = () => <Demos.CircleProgressBar />;
CircleProgressBar.decorators = [WiderDecorator];
CircleProgressBar.storyName = "Circle progress bar";

export const CircleProgressBarLabel = () => <Demos.CircleProgressBarLabel />;
CircleProgressBarLabel.decorators = [WiderDecorator];
CircleProgressBarLabel.storyName = "Circle progress bar label";

export const HalfCircleProgressBar = () => <Demos.HalfCircleProgressBar />;
HalfCircleProgressBar.decorators = [WiderDecorator];
HalfCircleProgressBar.storyName = "Half circle progress bar";

export const HalfCircleProgressBarLabel = () => <Demos.HalfCircleProgressBarLabel />;
HalfCircleProgressBarLabel.decorators = [WiderDecorator];
HalfCircleProgressBarLabel.storyName = "Half circle progress bar label";
