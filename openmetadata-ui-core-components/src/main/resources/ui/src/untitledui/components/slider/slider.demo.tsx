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

import { Slider } from "../slider/slider";

export const Default = () => {
    return <Slider defaultValue={[0, 25]} />;
};

export const BottomLabel = () => {
    return <Slider defaultValue={[0, 25]} labelPosition="bottom" />;
};

export const TopFloating = () => {
    return <Slider defaultValue={[0, 25]} labelPosition="top-floating" />;
};

export const SingleThumb = () => {
    return <Slider defaultValue={50} labelPosition="top-floating" />;
};
