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

"use client";

import { Toggle } from "../toggle/toggle";

export const DefaultDemo = () => <Toggle label="Remember me" hint="Save my login details for next time." size="sm" />;

export const BaseDemo = () => <Toggle size="sm" />;

export const WithLabelDemo = () => <Toggle label="Remember me" size="sm" />;

export const WithLabelAndHintDemo = () => <Toggle label="Remember me" hint="Save my login details for next time." size="sm" />;

export const DisabledDemo = () => <Toggle isDisabled label="Remember me" hint="Save my login details for next time." size="sm" />;

export const SizesDemo = () => (
    <div className="flex flex-col gap-8">
        <Toggle label="Remember me" hint="Save my login details for next time." size="sm" />
        <Toggle label="Remember me" hint="Save my login details for next time." size="md" />
    </div>
);

export const SlimBaseDemo = () => <Toggle slim size="sm" />;

export const SlimWithLabelAndHintDemo = () => <Toggle slim label="Remember me" hint="Save my login details for next time." size="sm" />;

export const Toggles = () => (
    <div className="grid grid-cols-2 gap-8">
        <div className="flex flex-col gap-4">
            <Toggle label="Remember me" hint="Save my login details for next time." size="sm" />
            <Toggle isDisabled label="Remember me" hint="Save my login details for next time." size="sm" />
        </div>
        <div className="flex flex-col gap-4">
            <Toggle label="Remember me" hint="Save my login details for next time." size="md" />
            <Toggle isDisabled label="Remember me" hint="Save my login details for next time." size="md" />
        </div>
    </div>
);

export const ToggleBase = () => (
    <div className="grid grid-cols-2 gap-8">
        <div className="flex flex-col gap-4">
            <Toggle size="sm" />
            <Toggle isDisabled size="sm" />
        </div>
        <div className="flex flex-col gap-4">
            <Toggle size="md" />
            <Toggle isDisabled size="md" />
        </div>
    </div>
);

export const TogglesSlim = () => (
    <div className="grid grid-cols-2 gap-8">
        <div className="flex flex-col gap-4">
            <Toggle slim label="Remember me" hint="Save my login details for next time." size="sm" />
            <Toggle slim isDisabled label="Remember me" hint="Save my login details for next time." size="sm" />
        </div>
        <div className="flex flex-col gap-4">
            <Toggle slim label="Remember me" hint="Save my login details for next time." size="md" />
            <Toggle slim isDisabled label="Remember me" hint="Save my login details for next time." size="md" />
        </div>
    </div>
);

export const ToggleSlimBase = () => (
    <div className="grid grid-cols-2 gap-8">
        <div className="flex flex-col gap-4">
            <Toggle slim size="sm" />
            <Toggle slim isDisabled size="sm" />
        </div>
        <div className="flex flex-col gap-4">
            <Toggle slim size="md" />
            <Toggle slim isDisabled size="md" />
        </div>
    </div>
);
