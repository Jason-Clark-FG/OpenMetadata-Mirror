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
import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "../components/base/buttons/button";
import { Popover, PopoverTrigger } from "../components/application/popover/popover";

const meta = {
  title: "Components/Popover",
  component: Popover,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <PopoverTrigger>
      <Button color="secondary">Open Popover</Button>
      <Popover>
        <div style={{ padding: "16px 20px", minWidth: 200 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#101828" }}>Popover title</p>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: "#667085" }}>
            This is a general-purpose popover with any content.
          </p>
        </div>
      </Popover>
    </PopoverTrigger>
  ),
};

export const WithArrow: StoryObj = {
  render: () => (
    <PopoverTrigger>
      <Button color="secondary">With Arrow</Button>
      <Popover arrow>
        <div style={{ padding: "16px 20px", minWidth: 200 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#101828" }}>With Arrow</p>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: "#667085" }}>
            This popover has an arrow pointing to its trigger.
          </p>
        </div>
      </Popover>
    </PopoverTrigger>
  ),
};

export const PlacementTop: StoryObj = {
  render: () => (
    <PopoverTrigger>
      <Button color="secondary">Opens Above</Button>
      <Popover placement="top">
        <div style={{ padding: "16px 20px", minWidth: 200 }}>
          <p style={{ margin: 0, fontSize: 14, color: "#101828" }}>Popover above the trigger</p>
        </div>
      </Popover>
    </PopoverTrigger>
  ),
};

export const PlacementRight: StoryObj = {
  render: () => (
    <PopoverTrigger>
      <Button color="secondary">Opens Right</Button>
      <Popover placement="right">
        <div style={{ padding: "16px 20px", minWidth: 200 }}>
          <p style={{ margin: 0, fontSize: 14, color: "#101828" }}>Popover to the right</p>
        </div>
      </Popover>
    </PopoverTrigger>
  ),
};

export const WithRichContent: StoryObj = {
  render: () => (
    <PopoverTrigger>
      <Button color="primary">User Profile</Button>
      <Popover>
        <div style={{ padding: 16, minWidth: 240 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: "#6941C6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontWeight: 700,
                fontSize: 16,
              }}
            >
              JD
            </div>
            <div>
              <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: "#101828" }}>John Doe</p>
              <p style={{ margin: 0, fontSize: 12, color: "#667085" }}>john.doe@example.com</p>
            </div>
          </div>
          <hr style={{ border: "none", borderTop: "1px solid #EAECF0", margin: "0 0 12px" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <button style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: "8px 4px", fontSize: 14, color: "#344054" }}>
              View Profile
            </button>
            <button style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: "8px 4px", fontSize: 14, color: "#344054" }}>
              Settings
            </button>
            <button style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: "8px 4px", fontSize: 14, color: "#D92D20" }}>
              Sign out
            </button>
          </div>
        </div>
      </Popover>
    </PopoverTrigger>
  ),
};

export const Placements: StoryObj = {
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24, padding: 64 }}>
      {(["top", "bottom", "left", "right"] as const).map((placement) => (
        <PopoverTrigger key={placement}>
          <Button color="secondary" size="sm" style={{ textTransform: "capitalize" }}>
            {placement}
          </Button>
          <Popover placement={placement} arrow>
            <div style={{ padding: "12px 16px" }}>
              <p style={{ margin: 0, fontSize: 13, color: "#101828" }}>
                Placed <strong>{placement}</strong>
              </p>
            </div>
          </Popover>
        </PopoverTrigger>
      ))}
    </div>
  ),
};
