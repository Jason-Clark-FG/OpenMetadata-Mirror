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

import { TextArea } from "../textarea/textarea";

export const DefaultDemo = () => {
    return <TextArea isRequired placeholder="This is a placeholder." label="Description" hint="This is a hint text to help user." rows={5} />;
};

export const DisabledDemo = () => {
    return <TextArea isRequired isDisabled placeholder="This is a placeholder." label="Description" hint="This is a hint text to help user." rows={5} />;
};

export const InvalidDemo = () => {
    return <TextArea isRequired isInvalid placeholder="This is a placeholder." label="Description" hint="This is an error message." rows={5} />;
};

export const Textarea = () => {
    return (
        <div className="flex w-full max-w-md flex-col gap-4">
            <TextArea isRequired placeholder="This is a placeholder." label="Description" hint="This is a hint text to help user." rows={5} />
            <TextArea isRequired isDisabled placeholder="This is a placeholder." label="Description" hint="This is a hint text to help user." rows={5} />
            <TextArea isRequired isInvalid placeholder="This is a placeholder." label="Description" hint="This is an error message." rows={5} />
        </div>
    );
};
