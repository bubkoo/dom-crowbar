# dom-crowbar

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Chrome Extension](https://img.shields.io/badge/Chrome_Extension-Manifest_V3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

> DOM node screenshot extension for Chrome

---

## Overview

dom-crowbar captures any visible DOM node with pixel-level precision.
It uses a content-script overlay for selection, background capture orchestration,
and an offscreen document for crop/stitch/clipboard operations under Manifest V3.

### Core Features

- Click the extension icon to start DOM node selection
- Pixel-perfect capture of any visible DOM node
- Support for Canvas and WebGL content
- Auto-copy to clipboard and download after screenshot
- Keyboard shortcuts for precise selection control

### Non-Goals

- No cross-browser support (Chrome / Chromium only)
- No batch screenshots or scheduled tasks
- No built-in image editing features

---

## Usage

### Basic Flow

1. Click the extension icon
2. Hover over highlighted nodes
3. Click or press **Enter** to capture
4. Screenshot is automatically copied to clipboard and downloaded

### Keyboard Shortcuts

Hold **?** or **/** to show the shortcuts panel.

| Key     | Action                     |
|---------|----------------------------|
| `?`     | Show shortcuts help (hold) |
| `[`     | Select parent element      |
| `]`     | Select child element       |
| `↑`     | Expand top edge by 1px     |
| `↓`     | Expand bottom edge by 1px  |
| `←`     | Expand left edge by 1px    |
| `→`     | Expand right edge by 1px   |
| `+`     | Expand all edges by 1px    |
| `-`     | Shrink all edges by 1px    |
| `Enter` | Confirm capture            |
| `Esc`   | Cancel selection           |

---

## How It Works

1. **Activate** - Click extension icon to start DOM selection
2. **Select** - Hover to highlight, use keyboard to adjust, click or Enter to capture
3. **Capture** - Background script captures the visible tab
4. **Crop** - Offscreen document crops the image to selected region
5. **Export** - Screenshot is auto-copied to clipboard and downloaded

The extension uses `chrome.tabs.captureVisibleTab` API to capture screenshots at native resolution, then crops to the selected DOM node region.

---

## Tech Stack

| Aspect     | Choice              | Reason                                  |
|------------|---------------------|-----------------------------------------|
| Extension  | Manifest V3         | Chrome current standard                 |
| Language   | TypeScript          | Type safety and better DX               |
| Screenshot | `captureVisibleTab` | Native capture, high DPI support        |
| Cropping   | Offscreen Document  | MV3 Service Worker cannot access Canvas |
| Build Tool | Vite + CRXJS        | Fast builds, hot-reload, MV3 compatible |
| Test       | Vitest              | Fast, Vite-native test runner           |
| i18n       | Chrome i18n API     | Built-in localization support           |

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────────────┐
│                              Browser                                │
│                                                                     │
│  ┌────────────────────────┐     ┌────────────────────────────────┐  │
│  │   Action (Click Icon)  │ ──▶ │   Background SW               │  │
│  └────────────────────────┘     │   background.ts               │  │
│                                 │   capture.ts                  │  │
│  ┌────────────────────────┐     │  - ENTER_PICK_MODE            │  │
│  │   Content Script       │ ◀──▶│  - CAPTURE_SUCCESS / ERROR    │  │
│  │   content.ts           │     │  - captureVisibleTab          │  │
│  │   node-overlay.ts      │     │  - scroll/tiled strategy      │  │
│  │   screenshot-result.ts │     └───────────────┬────────────────┘  │
│  └────────────────────────┘                     │                   │
│           │                                      │ CROP/STITCH      │
│           │ NODE_SELECTED                        │ COPY_TO_CLIPBOARD│
│           ▼                                      ▼ DOWNLOAD_IMAGE   │
│                                 ┌────────────────────────────────┐  │
│                                 │   Offscreen Document           │  │
│                                 │   src/offscreen/index.ts       │  │
│                                 │  - Canvas crop/stitch          │  │
│                                 │  - Clipboard API               │  │
│                                 └────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
src/
├── background/
│   └── background.ts         # Service Worker entry point
├── content/
│   ├── content.ts            # Content Script entry point
│   ├── node-overlay.ts       # Node highlight and selection overlay
│   └── selector-builder.ts   # CSS selector generator
├── offscreen/
│   ├── index.html            # Offscreen document HTML
│   └── index.ts              # Image crop and clipboard operations
└── shared/
    ├── types.ts              # Type definitions
    ├── constants.ts          # Constants
    ├── errors.ts             # Error types
    ├── retry.ts              # Retry utilities
    ├── logger.ts             # Logging utility
    └── i18n.ts               # Internationalization

public/
├── assets/
│   ├── icon.svg              # Source icon
│   ├── icon-16.png           # Generated at build time
│   ├── icon-48.png           # Generated at build time
│   └── icon-128.png          # Generated at build time
└── _locales/
    ├── en/messages.json      # English translations
    └── zh_CN/messages.json   # Chinese translations
```

Note: PNG icons are generated from `public/assets/icon.svg` by `scripts/build-icons.mjs` and are git-ignored.
If missing, run `npm run build:icons` once.

---

## Development

### Prerequisites

- Node.js 18+
- Chrome/Chromium browser

### Install Dependencies

```bash
npm install
```

### Development Mode

```bash
npm run dev
```

`dev` runs icon generation first, so a fresh clone can start directly.

### Watch Mode

For development with auto-rebuild on file changes:

```bash
npm run watch
```

### Production Build

```bash
npm run build
```

`build` and `watch` automatically run icon generation first.

### Generate Icons Only

```bash
npm run build:icons
```

### Run Tests

```bash
npm test
```

### Load Extension

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `dist` directory

---

## CI/CD and Chrome Web Store Publishing

Release and publish documentation has been moved to:

- [docs/release-and-publishing.md](docs/release-and-publishing.md)

Workflow files:

- [.github/workflows/ci.yml](.github/workflows/ci.yml)
- [.github/workflows/publish-chrome-web-store.yml](.github/workflows/publish-chrome-web-store.yml)

---

## License

MIT
