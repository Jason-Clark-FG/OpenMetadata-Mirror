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
import React from "react";
import { Tab, TabList, TabPanel, Tabs } from "../components/application/tabs/tabs";

const meta = {
  title: "Components/Tabs",
  component: Tabs,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    orientation: {
      control: false,
      table: { type: { summary: '"horizontal" | "vertical"' } },
    },
    keyboardActivation: {
      control: false,
      table: { type: { summary: '"automatic" | "manual"' } },
    },
  },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

const TabContent = ({ title }: { title: string }) => (
  <div className="tw:p-4 tw:text-sm tw:text-secondary">
    <p className="tw:font-semibold tw:text-primary tw:mb-1">{title}</p>
    <p>This is the content panel for {title}.</p>
  </div>
);

const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="tw:m-0 tw:text-xs tw:font-semibold tw:text-tertiary tw:uppercase tw:tracking-wide">
    {children}
  </p>
);

export const Default: Story = {
  render: () => (
    <div style={{ width: 600 }}>
      <Tabs defaultSelectedKey="overview">
        <TabList type="button-brand">
          <Tab id="overview">Overview</Tab>
          <Tab id="details">Details</Tab>
          <Tab id="history">History</Tab>
        </TabList>
        <TabPanel id="overview">
          <TabContent title="Overview" />
        </TabPanel>
        <TabPanel id="details">
          <TabContent title="Details" />
        </TabPanel>
        <TabPanel id="history">
          <TabContent title="History" />
        </TabPanel>
      </Tabs>
    </div>
  ),
};

export const TypeButtonBrand: StoryObj = {
  render: () => (
    <div style={{ width: 600 }}>
      <Tabs defaultSelectedKey="tab1">
        <TabList type="button-brand">
          <Tab id="tab1">Overview</Tab>
          <Tab id="tab2" badge={3}>Details</Tab>
          <Tab id="tab3">Settings</Tab>
        </TabList>
        <TabPanel id="tab1"><TabContent title="Overview" /></TabPanel>
        <TabPanel id="tab2"><TabContent title="Details" /></TabPanel>
        <TabPanel id="tab3"><TabContent title="Settings" /></TabPanel>
      </Tabs>
    </div>
  ),
};

export const TypeButtonGray: StoryObj = {
  render: () => (
    <div style={{ width: 600 }}>
      <Tabs defaultSelectedKey="tab1">
        <TabList type="button-gray">
          <Tab id="tab1">Overview</Tab>
          <Tab id="tab2">Details</Tab>
          <Tab id="tab3">Settings</Tab>
        </TabList>
        <TabPanel id="tab1"><TabContent title="Overview" /></TabPanel>
        <TabPanel id="tab2"><TabContent title="Details" /></TabPanel>
        <TabPanel id="tab3"><TabContent title="Settings" /></TabPanel>
      </Tabs>
    </div>
  ),
};

export const TypeButtonBorder: StoryObj = {
  render: () => (
    <div style={{ width: 600 }}>
      <Tabs defaultSelectedKey="tab1">
        <TabList type="button-border">
          <Tab id="tab1">Overview</Tab>
          <Tab id="tab2">Details</Tab>
          <Tab id="tab3">Settings</Tab>
        </TabList>
        <TabPanel id="tab1"><TabContent title="Overview" /></TabPanel>
        <TabPanel id="tab2"><TabContent title="Details" /></TabPanel>
        <TabPanel id="tab3"><TabContent title="Settings" /></TabPanel>
      </Tabs>
    </div>
  ),
};

export const TypeButtonMinimal: StoryObj = {
  render: () => (
    <div style={{ width: 600 }}>
      <Tabs defaultSelectedKey="tab1">
        <TabList type="button-minimal">
          <Tab id="tab1">Overview</Tab>
          <Tab id="tab2">Details</Tab>
          <Tab id="tab3">Settings</Tab>
        </TabList>
        <TabPanel id="tab1"><TabContent title="Overview" /></TabPanel>
        <TabPanel id="tab2"><TabContent title="Details" /></TabPanel>
        <TabPanel id="tab3"><TabContent title="Settings" /></TabPanel>
      </Tabs>
    </div>
  ),
};

export const TypeUnderline: StoryObj = {
  render: () => (
    <div style={{ width: 600 }}>
      <Tabs defaultSelectedKey="tab1">
        <TabList type="underline">
          <Tab id="tab1">Overview</Tab>
          <Tab id="tab2">Details</Tab>
          <Tab id="tab3">Settings</Tab>
        </TabList>
        <TabPanel id="tab1"><TabContent title="Overview" /></TabPanel>
        <TabPanel id="tab2"><TabContent title="Details" /></TabPanel>
        <TabPanel id="tab3"><TabContent title="Settings" /></TabPanel>
      </Tabs>
    </div>
  ),
};

export const SizeComparison: StoryObj = {
  render: () => (
    <div style={{ width: 600, display: "flex", flexDirection: "column", gap: 32 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Label>size="sm" (default)</Label>
        <Tabs defaultSelectedKey="tab1">
          <TabList type="underline" size="sm">
            <Tab id="tab1">Overview</Tab>
            <Tab id="tab2">Details</Tab>
            <Tab id="tab3">Settings</Tab>
          </TabList>
          <TabPanel id="tab1"><TabContent title="Overview" /></TabPanel>
          <TabPanel id="tab2"><TabContent title="Details" /></TabPanel>
          <TabPanel id="tab3"><TabContent title="Settings" /></TabPanel>
        </Tabs>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Label>size="md"</Label>
        <Tabs defaultSelectedKey="tab1">
          <TabList type="underline" size="md">
            <Tab id="tab1">Overview</Tab>
            <Tab id="tab2">Details</Tab>
            <Tab id="tab3">Settings</Tab>
          </TabList>
          <TabPanel id="tab1"><TabContent title="Overview" /></TabPanel>
          <TabPanel id="tab2"><TabContent title="Details" /></TabPanel>
          <TabPanel id="tab3"><TabContent title="Settings" /></TabPanel>
        </Tabs>
      </div>
    </div>
  ),
};

export const AllHorizontalTypes: StoryObj = {
  render: () => (
    <div style={{ width: 600, display: "flex", flexDirection: "column", gap: 32 }}>
      {(["button-brand", "button-gray", "button-border", "button-minimal", "underline"] as const).map((type) => (
        <div key={type} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Label>type="{type}"</Label>
          <Tabs defaultSelectedKey="tab1">
            <TabList type={type}>
              <Tab id="tab1">Overview</Tab>
              <Tab id="tab2">Details</Tab>
              <Tab id="tab3">Settings</Tab>
            </TabList>
            <TabPanel id="tab1"><TabContent title="Overview" /></TabPanel>
            <TabPanel id="tab2"><TabContent title="Details" /></TabPanel>
            <TabPanel id="tab3"><TabContent title="Settings" /></TabPanel>
          </Tabs>
        </div>
      ))}
    </div>
  ),
};

export const VerticalLine: StoryObj = {
  render: () => (
    <div style={{ width: 500, minHeight: 200 }}>
      <Tabs defaultSelectedKey="tab1" orientation="vertical">
        <div style={{ display: "flex", gap: 0 }}>
          <TabList type="line" orientation="vertical">
            <Tab id="tab1">Overview</Tab>
            <Tab id="tab2">Details</Tab>
            <Tab id="tab3">Settings</Tab>
          </TabList>
          <div style={{ flex: 1 }}>
            <TabPanel id="tab1"><TabContent title="Overview" /></TabPanel>
            <TabPanel id="tab2"><TabContent title="Details" /></TabPanel>
            <TabPanel id="tab3"><TabContent title="Settings" /></TabPanel>
          </div>
        </div>
      </Tabs>
    </div>
  ),
};

export const VerticalButtonBrand: StoryObj = {
  render: () => (
    <div style={{ width: 500, minHeight: 200 }}>
      <Tabs defaultSelectedKey="tab1" orientation="vertical">
        <div style={{ display: "flex", gap: 8 }}>
          <TabList type="button-brand" orientation="vertical">
            <Tab id="tab1">Overview</Tab>
            <Tab id="tab2">Details</Tab>
            <Tab id="tab3">Settings</Tab>
          </TabList>
          <div style={{ flex: 1 }}>
            <TabPanel id="tab1"><TabContent title="Overview" /></TabPanel>
            <TabPanel id="tab2"><TabContent title="Details" /></TabPanel>
            <TabPanel id="tab3"><TabContent title="Settings" /></TabPanel>
          </div>
        </div>
      </Tabs>
    </div>
  ),
};

export const AllVerticalTypes: StoryObj = {
  render: () => (
    <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
      {(["button-brand", "button-gray", "button-border", "button-minimal", "line"] as const).map((type) => (
        <div key={type} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Label>type="{type}"</Label>
          <Tabs defaultSelectedKey="tab1" orientation="vertical">
            <TabList type={type} orientation="vertical">
              <Tab id="tab1">Overview</Tab>
              <Tab id="tab2">Details</Tab>
              <Tab id="tab3">History</Tab>
            </TabList>
          </Tabs>
        </div>
      ))}
    </div>
  ),
};

export const WithBadge: StoryObj = {
  render: () => (
    <div style={{ width: 600 }}>
      <Tabs defaultSelectedKey="tab1">
        <TabList type="underline">
          <Tab id="tab1">Overview</Tab>
          <Tab id="tab2" badge={5}>Issues</Tab>
          <Tab id="tab3" badge="New">Features</Tab>
          <Tab id="tab4">Settings</Tab>
        </TabList>
        <TabPanel id="tab1"><TabContent title="Overview" /></TabPanel>
        <TabPanel id="tab2"><TabContent title="Issues" /></TabPanel>
        <TabPanel id="tab3"><TabContent title="Features" /></TabPanel>
        <TabPanel id="tab4"><TabContent title="Settings" /></TabPanel>
      </Tabs>
    </div>
  ),
};

export const WithDisabledTab: StoryObj = {
  render: () => (
    <div style={{ width: 600 }}>
      <Tabs defaultSelectedKey="tab1">
        <TabList type="underline">
          <Tab id="tab1">Overview</Tab>
          <Tab id="tab2">Details</Tab>
          <Tab id="tab3" isDisabled>Locked</Tab>
          <Tab id="tab4">Settings</Tab>
        </TabList>
        <TabPanel id="tab1"><TabContent title="Overview" /></TabPanel>
        <TabPanel id="tab2"><TabContent title="Details" /></TabPanel>
        <TabPanel id="tab3"><TabContent title="Locked (not reachable)" /></TabPanel>
        <TabPanel id="tab4"><TabContent title="Settings" /></TabPanel>
      </Tabs>
    </div>
  ),
};

export const FullWidth: StoryObj = {
  render: () => (
    <div style={{ width: 600 }}>
      <Tabs defaultSelectedKey="tab1">
        <TabList type="underline" fullWidth>
          <Tab id="tab1">Overview</Tab>
          <Tab id="tab2">Details</Tab>
          <Tab id="tab3">Settings</Tab>
        </TabList>
        <TabPanel id="tab1"><TabContent title="Overview" /></TabPanel>
        <TabPanel id="tab2"><TabContent title="Details" /></TabPanel>
        <TabPanel id="tab3"><TabContent title="Settings" /></TabPanel>
      </Tabs>
    </div>
  ),
};

export const SubComponentApi: StoryObj = {
  render: () => (
    <div style={{ width: 600 }}>
      <Tabs defaultSelectedKey="tab1">
        <Tabs.List type="underline">
          <Tabs.Item id="tab1">Overview</Tabs.Item>
          <Tabs.Item id="tab2">Details</Tabs.Item>
          <Tabs.Item id="tab3">Settings</Tabs.Item>
        </Tabs.List>
        <Tabs.Panel id="tab1"><TabContent title="Overview" /></Tabs.Panel>
        <Tabs.Panel id="tab2"><TabContent title="Details" /></Tabs.Panel>
        <Tabs.Panel id="tab3"><TabContent title="Settings" /></Tabs.Panel>
      </Tabs>
    </div>
  ),
};

export const DynamicItems: StoryObj = {
  render: () => {
    const tabs = [
      { id: "overview", label: "Overview" },
      { id: "details", label: "Details", badge: 4 },
      { id: "settings", label: "Settings" },
    ];

    return (
      <div style={{ width: 600 }}>
        <Tabs defaultSelectedKey="overview">
          <TabList
            type="underline"
            items={tabs.map((t) => ({ id: t.id, children: t.label, badge: t.badge }))}>
            {(item) => (
              <Tab id={item.id} badge={item.badge}>
                {item.children}
              </Tab>
            )}
          </TabList>
          {tabs.map((t) => (
            <TabPanel key={t.id} id={t.id}>
              <TabContent title={t.label} />
            </TabPanel>
          ))}
        </Tabs>
      </div>
    );
  },
};
