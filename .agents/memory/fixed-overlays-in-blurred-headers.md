---
name: Fixed overlays inside blurred headers
description: Why position:fixed overlays break when nested in an element with backdrop-filter/filter/transform
---
Rule: never render a `position: fixed` overlay (mobile menu sheet, modal, drawer) as a descendant of an element that ever gets `backdrop-filter`, `filter`, or `transform` — those properties create a containing block, so the "fixed" element positions relative to that ancestor instead of the viewport.

**Why:** The MedQrown landing mobile menu worked at the top of the page but silently collapsed after scrolling, because the fixed header only applied `backdrop-blur` in its scrolled state. Taps then landed on content behind the invisible sheet (Playwright reported pointer interception by the header/sections).

**How to apply:** Put full-screen overlays as siblings of the header (or in a portal to body). If a tap/click works before scrolling but not after, suspect a conditional backdrop-blur/transform ancestor.
