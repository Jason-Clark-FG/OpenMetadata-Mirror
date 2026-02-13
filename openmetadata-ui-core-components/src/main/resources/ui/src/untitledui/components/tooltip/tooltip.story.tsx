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
import * as Tooltips from "../tooltip/tooltip.demo";

export default {
    title: "Base components/Tooltips",
    decorators: [
        (Story: FC) => (
            <div className="flex min-h-screen items-center justify-center bg-primary p-16">
                <Story />
            </div>
        ),
    ],
};

export const Tooltip = () => <Tooltips.TooltipDemo />;

export const TooltipWithArrow = () => <Tooltips.TooltipWithArrow />;
TooltipWithArrow.storyName = "Tooltip with arrow";

export const TooltipWithArrowSupportingText = () => <Tooltips.TooltipWithArrowSupportingText />;
TooltipWithArrowSupportingText.storyName = "Tooltip with arrow supporting text";
