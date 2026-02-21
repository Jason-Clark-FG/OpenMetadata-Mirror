```
You are migrating a React/TypeScript component from MUI (Material UI) to
`@openmetadata/ui-core-components` + Tailwind v4. The user will provide the
component file. Perform the migration strictly following all rules below.

---

## TECH STACK

- UI library: `@openmetadata/ui-core-components` (wraps react-aria-components)
- Icons: `@untitledui/icons`
- Styling: Tailwind v4 with `tw:` prefix (e.g. `tw:flex`, `tw:text-sm`)
- i18n: `react-i18next` via `useTranslation` hook — NEVER use string literals

---

## COMPONENT MAPPING: MUI → CORE-COMPONENTS

### Button
```tsx
// OLD (MUI)
import { Button } from '@mui/material';
<Button variant="outlined" size="small" onClick={fn}>Label</Button>
<Button variant="contained" onClick={fn}>Label</Button>

// NEW (core-components)
import { Button } from '@openmetadata/ui-core-components';
<Button color="secondary" size="sm" onClick={fn}>Label</Button>
<Button color="primary" size="sm" onClick={fn}>Label</Button>
```

Button props:

- `color`: "primary" | "secondary" | "tertiary" | "error" | "link-color"
- `size`: "sm" | "md" | "lg"
- `iconLeading`: FC reference OR React element
- `iconTrailing`: FC reference OR React element

### IconButton (icon-only button)

```tsx
// OLD (MUI)
<IconButton onClick={fn}>
  <SettingsIcon />
</IconButton>;

// NEW — pass icon as COMPONENT REFERENCE to iconLeading, NO children
// `data-icon-only` is auto-set only when (iconLeading || iconTrailing) && !children
import { ReactComponent as SettingIcon } from "path/to/icon.svg";
<Button color="secondary" iconLeading={SettingIcon} size="sm" onClick={fn} />;
//                                   ^^^^^^^^^^^^ component ref — NOT <SettingIcon />
```

### Icon color in iconLeading / iconTrailing

```tsx
// To INHERIT currentColor (e.g. white on primary button) → pass React element:
iconTrailing={<ChevronDown className="tw:size-4" />}   // inherits text color ✓

// To use CSS token `text-button-primary-icon` → pass component reference:
iconTrailing={ChevronDown}                             // uses token color ✓
```

### Dropdown / Menu

```tsx
// OLD (MUI)
const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
<Button onClick={(e) => setAnchorEl(e.currentTarget)}>Open</Button>
<Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
  <MenuItem onClick={fn}>Item</MenuItem>
</Menu>

// NEW — replace anchorEl with isMenuOpen boolean
import { Dropdown } from '@openmetadata/ui-core-components';
const [isMenuOpen, setIsMenuOpen] = useState(false);

<Dropdown.Root isOpen={isMenuOpen} onOpenChange={setIsMenuOpen}>
  <Button color="secondary" size="sm">Open</Button>   {/* direct child = trigger */}
  <Dropdown.Popover className="tw:w-max">
    <Dropdown.Menu items={items}>
      {(item) => (
        <Dropdown.Item id={item.id} label={item.label} onAction={item.onAction} />
      )}
    </Dropdown.Menu>
  </Dropdown.Popover>
</Dropdown.Root>
```

Dropdown.Popover sizing — use Tailwind scale, NOT arbitrary values:

- `tw:min-w-70` (= 280px)
- `tw:max-h-125` (= 500px)
- `tw:w-max`

For plain styled buttons inside a popover (not using Dropdown.Menu/Item):

```tsx
<Dropdown.Popover className="tw:min-w-70 tw:max-h-125">
  <div className="tw:py-1">
    {items.map(([key, value]) => {
      const isSelected = selectedKey === key;

      // ⚠️ ALWAYS extract multi-line classNames() to a variable BEFORE JSX.
      // Inline multi-line classNames() in props confuses the prop-sort linter.
      const itemClassName = classNames(
        "tw:block tw:w-full tw:cursor-pointer tw:px-4 tw:py-2",
        "tw:text-left tw:text-sm tw:font-normal tw:outline-hidden",
        "tw:transition tw:duration-100 tw:ease-linear",
        {
          "tw:bg-brand-solid tw:text-white tw:font-semibold tw:hover:bg-brand-solid_hover":
            isSelected,
          "tw:text-secondary tw:hover:bg-primary_hover tw:hover:text-secondary_hover":
            !isSelected,
        },
      );

      return (
        <button
          className={itemClassName}
          data-testid={`option-${key}`}
          key={key}
          onClick={() => handleClick(key)}
        >
          {value.title}
        </button>
      );
    })}
  </div>
</Dropdown.Popover>
```

### Tooltip

```tsx
// OLD (MUI)
import { Tooltip } from '@mui/material';
<Tooltip title="Settings"><span /></Tooltip>

// NEW
import { Tooltip } from '@openmetadata/ui-core-components';
<Tooltip placement="top" title={t('label.setting-plural')}>
  <Button ... />
</Tooltip>
```

### Close / Clear button

```tsx
// OLD (MUI)
<IconButton onClick={handleClear}><Close /></IconButton>

// NEW — use CloseButton; if it is a "clear" action sibling to a dropdown,
// place it OUTSIDE Dropdown.Root (not nested inside it)
import { CloseButton } from '@openmetadata/ui-core-components';

<div className="tw:flex tw:items-center tw:gap-1">
  <Dropdown.Root ...>...</Dropdown.Root>
  {allowClear && selectedKey && (
    <CloseButton size="xs" onPress={handleClear} />   // sibling, not child
  )}
</div>
```

### Card → plain div with border + shadow

```tsx
// OLD (MUI)
import { Card } from '@mui/material';
<Card
  sx={{
    borderRadius: '8px',
    border: `1px solid ${theme.palette.grey[200]}`,
    boxShadow: '0 4px 3px 0 rgba(235, 239, 250, 0.25)',
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    p: '16px 20px',
    width: '100%',
  }}
  variant="outlined">

// NEW
<div className="tw:flex tw:w-full tw:items-center tw:gap-4 tw:rounded-lg tw:border tw:border-border-secondary tw:px-5 tw:py-4 tw:shadow-xs">
```

Design system has **no colored/blueish shadow** equivalent. Use `tw:shadow-xs` as the lightest neutral shadow.

Available shadow tokens (lightest → heaviest):
- `tw:shadow-xs` — `0px 1px 2px #0a0d120d` — closest to soft decorative shadows
- `tw:shadow-sm` — `0px 1px 3px + 0px 1px 2px #0a0d121a`
- `tw:shadow-md` — `0px 4px 6px -1px + 0px 2px 4px -2px`

### Typography → semantic HTML + Tailwind

`@openmetadata/ui-core-components` **does export a `Typography` component**, but it is a
**prose wrapper** (applies Tailwind's `prose` class) intended for long-form / rich text /
markdown-rendered content — NOT a general-purpose label component.

```tsx
// core-components Typography — only for rich text / prose blocks
import { Typography } from '@openmetadata/ui-core-components';
<Typography as="p" quoteVariant="default">...long-form markdown content...</Typography>
```

For **labels, headings, and values** (the typical MUI Typography use case), replace with plain
semantic HTML + Tailwind:

```tsx
// OLD (MUI)
import { Typography } from '@mui/material';
<Typography variant="h6" sx={{ fontSize: '18px', fontWeight: 600, color: theme.palette.grey[900] }}>
  {value}
</Typography>
<Typography sx={{ fontSize: '14px', fontWeight: 500, color: theme.palette.grey[700] }}>
  {title}
</Typography>

// NEW — use <p> or <span> with Tailwind tokens
// Always add tw:m-0 to <p> to remove default browser margin
<p className="tw:m-0 tw:text-lg tw:font-semibold tw:text-primary">{value}</p>
<p className="tw:m-0 tw:text-sm tw:font-medium tw:text-secondary">{title}</p>
```

MUI `fontWeight` → Tailwind:
- 400 → `tw:font-normal`
- 500 → `tw:font-medium`
- 600 → `tw:font-semibold`
- 700 → `tw:font-bold`

### Skeleton → animated div

`@openmetadata/ui-core-components` has **no Skeleton component**. Use a plain div:

```tsx
// OLD (MUI)
import { Skeleton } from '@mui/material';
<Skeleton height={100} variant="rounded" width={210} />

// NEW — tw:bg-quaternary matches MUI Skeleton's gray (#e9eaeb ≈ rgba(0,0,0,0.11))
<div className="tw:h-25 tw:w-52 tw:animate-pulse tw:rounded-lg tw:bg-quaternary" />
```

Skeleton height/width conversion (MUI px → Tailwind scale, 1 unit = 4px):
- `height={100}` → `tw:h-25`
- `width={210}` → `tw:w-52` (nearest: 208px)

### Box / Stack → plain divs with Tailwind

```tsx
// OLD (MUI)
<Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
<Stack direction="row" spacing={2}>

// NEW
<div className="tw:flex tw:items-center tw:gap-2">
```

### Divider → hr

```tsx
// OLD  <Divider sx={{ my: 1 }} />
// NEW
<hr className="tw:my-1 tw:h-px tw:border-0 tw:bg-border-secondary" />
```

---

## TAILWIND v4 RULES

- All utilities MUST use `tw:` prefix: `tw:flex`, `tw:text-sm`, `tw:gap-2`
- `!important` modifier is a POSTFIX: `tw:text-sm!` (NOT `!tw:text-sm`)
- DO NOT use arbitrary values — the linter will auto-convert them and fail CI:
  - `tw:min-w-[280px]` → `tw:min-w-70`
  - `tw:max-h-[500px]` → `tw:max-h-125`
- ALWAYS use theme color tokens — never hardcoded hex/rgb:

| Purpose        | Token                                                 |
| -------------- | ----------------------------------------------------- |
| Text primary   | `tw:text-primary`                                     |
| Text secondary | `tw:text-secondary`                                   |
| Text tertiary  | `tw:text-tertiary`                                    |
| Placeholder    | `tw:text-placeholder`                                 |
| BG default     | `tw:bg-primary`                                       |
| BG hover       | `tw:bg-primary_hover`                                 |
| Brand solid    | `tw:bg-brand-solid` / `tw:hover:bg-brand-solid_hover` |
| Border         | `tw:border-border-secondary`                          |

---

## ESLINT / LINTER RULES (strict — will fail CI)

### 1. Props must be sorted alphabetically — linter INCLUDES `key` in the sort

**Correct order:** non-callback props alphabetically, then callback props alphabetically last.

```tsx
// ✓ CORRECT
<Button
  className="..."        // c — non-callback
  color="secondary"      // c — non-callback
  data-testid="btn"      // d — non-callback
  key={id}              // k — non-callback (yes, key is sorted too)
  size="sm"              // s — non-callback
  onClick={fn}           // o — callback, LAST
/>

// ❌ WRONG — onClick before size
<Button onClick={fn} size="sm">
```

### 2. Extract multi-line classNames() BEFORE JSX — ALWAYS

```tsx
// ❌ WRONG — multi-line classNames() inline confuses prop-sort linter
<button
  className={classNames('tw:flex', {
    'tw:hidden': hide,
  })}
  onClick={fn}>

// ✓ CORRECT — extract to variable first
const btnClassName = classNames('tw:flex', { 'tw:hidden': hide });
return <button className={btnClassName} onClick={fn}>;
```

### 3. No string literals — always use t() from useTranslation

```tsx
const { t } = useTranslation();
// ❌ "Settings"
// ✓ {t('label.settings')}
```

Check both translation files for existing keys before adding new ones:

- `OpenMetadata/openmetadata-ui/src/main/resources/ui/src/locale/languages/en-us.json`
- `collate-ui/src/main/resources/ui/src/locale/languages/en-us.json`

### 4. No `any` type — use `unknown` + type guards or specific types

### 5. Arbitrary Tailwind values — linter only converts values WITH a known standard equivalent

The linter auto-converts arbitrary values it recognizes:
- `tw:min-w-[280px]` → `tw:min-w-70` ✓ (has standard equivalent)
- `tw:max-h-[500px]` → `tw:max-h-125` ✓ (has standard equivalent)

When **no standard token exists** in the design system, the arbitrary value is acceptable and the linter will leave it:
- `tw:text-[10px]` — OK, the design system's smallest text token is `tw:text-xs` (12px); no 10px equivalent exists

Write the correct standard value directly when one exists. Only fall back to arbitrary values when the design system genuinely has no equivalent.

---

## IMPORT ORDER (ESLint enforced)

```tsx
// 1. External libraries (alphabetical)
import { Button, Dropdown, Tooltip } from "@openmetadata/ui-core-components";
import { ChevronDown } from "@untitledui/icons";
import classNames from "classnames";
import { useState } from "react";
import { useTranslation } from "react-i18next";

// 2. Internal absolute imports (constants, generated types, hooks, utils)
import { MY_CONSTANT } from "../../../constants/something";

// 3. Relative imports (utils, components, assets)
import { ReactComponent as MyIcon } from "../../../assets/svg/icon.svg";
import { MyComponent } from "./MyComponent";

// 4. Type-only imports (last)
import type { MyProps } from "./MyComponent.interface";
```

---

## STATE PATTERN CHANGES

| Old (MUI)                                      | New (core-components)                  |
| ---------------------------------------------- | -------------------------------------- |
| `anchorEl: null \| HTMLElement`                | `isMenuOpen: boolean`                  |
| `setAnchorEl(e.currentTarget)` on button click | `onOpenChange={setIsMenuOpen}` on Root |
| `setAnchorEl(null)` to close                   | `setIsMenuOpen(false)`                 |
| `open={Boolean(anchorEl)}`                     | `isOpen={isMenuOpen}`                  |
| `handleMenuClick` / `handleMenuClose`          | removed — handled by Dropdown.Root     |

---

## DO NOT MIGRATE (out of scope / complex)

| Component                          | Reason                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| `MuiDatePickerMenu`                | Ant Design RangePicker calendar portal conflicts with react-aria Popover — needs dedicated PR |
| Ant Design `Select`, `Form`        | Separate migration effort                                                                     |
| MUI inside table column `render()` | High complexity, separate PR                                                                  |

---

## MIGRATION CHECKLIST

When you receive a component file, work through these steps in order:

1. **Read the entire file** before making any changes
2. **List all MUI imports** and their core-components equivalents
3. **Replace state**: `anchorEl` → `isMenuOpen` boolean for menus
4. **Replace JSX** component by component using the mappings above
5. **Apply Tailwind** classes using theme tokens — no hardcoded colors
6. **Sort all props** alphabetically (non-callbacks first, callbacks last, `key` included)
7. **Extract classNames()** calls to variables before JSX returns
8. **Replace string literals** with `t()` translation calls
9. **Clean up** unused imports and removed variables (e.g. `useTheme`, `menuItemStyles`, `BUTTON_HEIGHTS`)
10. **Verify** no `any` types, no arbitrary Tailwind values, no string literals

When done, report:

- MUI imports removed
- Core-components imports added
- Any MUI kept intentionally and why

```
