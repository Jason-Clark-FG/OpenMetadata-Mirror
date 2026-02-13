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
import * as Badges from "../badges/badges.demo";

export default {
    title: "Base components/Badges",
    decorators: [
        (Story: FC) => (
            <div className="flex h-screen w-full bg-primary p-4">
                <Story />
            </div>
        ),
    ],
};

export const PillColor = () => <Badges.PillColor />;
PillColor.storyName = "Pill color";

export const BadgeColor = () => <Badges.BadgeColor />;
BadgeColor.storyName = "Badge color";

export const BadgeModern = () => <Badges.BadgeModern />;
BadgeModern.storyName = "Badge modern";

export const WithDot = () => <Badges.WithDot />;
WithDot.storyName = "With dot";

export const WithDotBadgeColor = () => <Badges.WithDotBadgeColor />;
WithDotBadgeColor.storyName = "With dot badge color";

export const WithDotBadgeModern = () => <Badges.WithDotBadgeModern />;
WithDotBadgeModern.storyName = "With dot badge modern";

export const WithFlag = () => <Badges.WithFlag />;
WithFlag.storyName = "With flag";

export const WithFlagBadgeColor = () => <Badges.WithFlagBadgeColor />;
WithFlagBadgeColor.storyName = "With flag badge color";

export const WithFlagBadgeModern = () => <Badges.WithFlagBadgeModern />;
WithFlagBadgeModern.storyName = "With flag badge modern";

export const WithAvatar = () => <Badges.WithAvatar />;
WithAvatar.storyName = "With avatar";

export const WithAvatarBadgeColor = () => <Badges.WithAvatarBadgeColor />;
WithAvatarBadgeColor.storyName = "With avatar badge color";

export const WithAvatarBadgeModern = () => <Badges.WithAvatarBadgeModern />;
WithAvatarBadgeModern.storyName = "With avatar badge modern";

export const WithCloseX = () => <Badges.WithCloseX />;
WithCloseX.storyName = "With close X";

export const WithCloseXBadgeColor = () => <Badges.WithCloseXBadgeColor />;
WithCloseXBadgeColor.storyName = "With close X badge color";
export const WithCloseXBadgeModern = () => <Badges.WithCloseXBadgeModern />;

export const WithIconTrailing = () => <Badges.WithIconTrailing />;
WithIconTrailing.storyName = "With icon trailing";

export const WithIconTrailingBadgeColor = () => <Badges.WithIconTrailingBadgeColor />;
WithIconTrailingBadgeColor.storyName = "With icon trailing badge color";

export const WithIconTrailingBadgeModern = () => <Badges.WithIconTrailingBadgeModern />;
WithIconTrailingBadgeModern.storyName = "With icon trailing badge modern";

export const WithIconLeading = () => <Badges.WithIconLeading />;
WithIconLeading.storyName = "With icon leading";

export const WithIconLeadingBadgeColor = () => <Badges.WithIconLeadingBadgeColor />;
WithIconLeadingBadgeColor.storyName = "With icon leading badge color";

export const WithIconLeadingBadgeModern = () => <Badges.WithIconLeadingBadgeModern />;
WithIconLeadingBadgeModern.storyName = "With icon leading badge modern";

export const WithIconOnly = () => <Badges.WithIconOnly />;
WithIconOnly.storyName = "With icon only";

export const WithIconOnlyBadgeColor = () => <Badges.WithIconOnlyBadgeColor />;
WithIconOnlyBadgeColor.storyName = "With icon only badge color";

export const WithIconOnlyBadgeModern = () => <Badges.WithIconOnlyBadgeModern />;
WithIconOnlyBadgeModern.storyName = "With icon only badge modern";
