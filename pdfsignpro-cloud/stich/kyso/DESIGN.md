# Design System Strategy: The Immutable Document

## 1. Overview & Creative North Star
### The Digital Curator
The core of this design system is built on the concept of **"The Digital Curator."** In the world of digital legalities and PDF signatures, trust isn't built through heavy borders or aggressive branding; it’s built through precision, editorial clarity, and an interface that feels as substantial as high-quality vellum. 

We are moving away from the "standard SaaS" look. Instead of a rigid grid of outlined boxes, we utilize **Tonal Architecture**. This system breaks the template through intentional asymmetry, where high-contrast typography (Inter) commands the page, and layered surfaces create a sense of secure depth. The interface should feel like a series of meticulously stacked documents—authoritative, efficient, and breathable.

---

## 2. Colors: Tonal Architecture
Our palette relies on deep, trustworthy blues anchored by a "vibrant action" logic. However, the sophistication lies in how these colors interact without traditional strokes.

*   **Primary (`#003b93`) & Primary Container (`#0051c3`):** Reserved for high-intent actions. Use the container variant for large hero sections to establish authority.
*   **Tertiary/Error (`#870500` / `#b20f03`):** Used sparingly for critical alerts and destructive actions.
*   **The "No-Line" Rule:** 1px solid borders are prohibited for sectioning. Definition must be achieved through background shifts. For example, a `surface-container-low` component should sit on a `surface` background to denote its boundary.
*   **Surface Hierarchy:** 
    *   `surface-container-lowest` (#ffffff): Use for the "active" document or signing area.
    *   `surface` (#fbf9f9): The primary canvas.
    *   `surface-container-high` (#e9e8e7): Use for sidebars or persistent utility panels.
*   **The "Glass & Gradient" Rule:** Floating modals or navigation bars must utilize Glassmorphism. Use a semi-transparent `surface` color with a `backdrop-filter: blur(20px)`. Main CTAs should feature a subtle linear gradient from `primary` to `primary_container` (135° angle) to provide a "soul" that flat hex codes cannot replicate.

---

## 3. Typography: Editorial Authority
We use **Inter** as our typographic backbone, treated with an editorial eye for scale.

*   **Display (lg/md/sm):** These are your "Statement" sizes. Use `display-md` (2.75rem) for hero headers to establish an immediate sense of scale.
*   **Headline (lg/md/sm):** Reserved for section starts. Use `headline-sm` (1.5rem) to introduce document lists or settings.
*   **Title (lg/md/sm):** The working labels. `title-md` (1.125rem) is the default for card titles and modal headers.
*   **Body (lg/md/sm):** The workhorse. `body-md` (0.875rem) is the standard for all functional text to ensure high information density without clutter.
*   **Labels:** `label-md` (0.75rem) in all-caps with 5% letter-spacing should be used for metadata and status badges to differentiate "data" from "content."

---

## 4. Elevation & Depth: The Layering Principle
Traditional drop shadows are replaced by **Ambient Occlusion**. We want the UI to feel like physical layers of paper and glass.

*   **Tonal Layering:** Avoid shadows for static elements. Place a `surface-container-lowest` card on a `surface-container-low` section to create a soft, natural lift.
*   **Ambient Shadows:** For floating elements (like the signature pad), use extra-diffused shadows.
    *   *Spec:* `box-shadow: 0 12px 40px rgba(27, 28, 28, 0.06);` (using a tinted version of `on-surface`).
*   **The "Ghost Border":** If a boundary is required for accessibility, use the `outline-variant` token at **15% opacity**. Never use 100% opaque, high-contrast borders.
*   **Nesting:** Depth is increased as you move "closer" to the user. A file upload zone should be `surface-container-low`, but the file being uploaded should "pop" as `surface-container-lowest`.

---

## 5. Components: Functional Elegance

### Buttons
*   **Primary:** Rounded `md` (0.75rem). Gradient fill (`primary` to `primary_container`). No border. `on-primary` text.
*   **Secondary:** `surface-container-highest` background. No border. `on-surface` text.
*   **Tertiary:** Transparent background. `primary` text. Use for low-emphasis actions like "Cancel."

### File Upload Zones (Signature Component)
*   **Style:** `surface-container-low` background with a dashed "Ghost Border" (20% opacity `outline`).
*   **Interaction:** On drag-over, transition background to `primary-fixed` (#dae2ff) to provide tactile feedback.

### Input Fields
*   **Base:** `surface-container-lowest` background. 
*   **Border:** Use a "Ghost Border" on the bottom edge only, or a 10% opaque `outline` for the full container.
*   **State:** On focus, the border shifts to `primary` (2px) and a subtle 4% `primary` glow is applied.

### Status Badges
*   **Draft:** `secondary-container` background with `on-secondary-container` text.
*   **Signed:** `primary-fixed` background with `on-primary-fixed` text.
*   **Rejected:** `tertiary-container` (#b20f03) with `on-error` (#ffffff) text.
*   **Shape:** `full` (pill-shaped) to distinguish from square-ish buttons.

### Cards & Lists
*   **Forbid Dividers:** Use `Spacing-6` (1.5rem) or a subtle background shift between items. Never use a horizontal line to separate list items; let the typography and whitespace create the rhythm.

---

## 6. Do's and Don'ts

### Do
*   **DO** use whitespace as a structural element. If a layout feels cramped, increase the spacing from `4` to `8` before adding a border.
*   **DO** use `monospace` for Ray IDs, transaction hashes, or certificate serial numbers to provide a "technical" and "secure" aesthetic.
*   **DO** ensure all touch targets are at least 44px in height.

### Don't
*   **DON'T** use pure black (#000000). Use `on-surface` (#1b1c1c) for text and `inverse-surface` (#303031) for high-contrast elements.
*   **DON'T** use 100% opaque borders. They create "visual noise" that contradicts the professional, clean brand identity.
*   **DON'T** use vibrant blue for "Success" messages. Use the `primary` blue to maintain brand consistency; reserve red/tertiary strictly for "Error" or "Required."