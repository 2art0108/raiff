# SoftBees — App Prototype

An interactive, iOS 26-style banking app prototype for SoftBees. It covers Connections (bank list, bank selection, Bank Details, account transactions with search and date range), the Assistant chat sheet with simulated AI replies and Recent Chats, Payroll and Payments. The prototype renders in a fixed 430 × 932 frame.

It is a **static site with no build dependencies**. React 18 loads from jsDelivr (pinned, with SRI hashes), and a small runtime (`runtime/dc-lite.js`) renders the `.dc.html` component files.

## Quick start

Requires Node.js 18+ (only for the local server and build script).

```bash
npm start          # http://localhost:3000
```

The page loads components with `fetch`, so it must be served over HTTP. Opening `index.html` from disk (`file://`) will not work. Any static server works, e.g. `python3 -m http.server 3000`.

## Scripts

| Command           | What it does                                                                 |
| ----------------- | ---------------------------------------------------------------------------- |
| `npm start`       | Serve the project root on port 3000 (`PORT=8080 npm start` to change)         |
| `npm run check`   | Validate: every asset/font/SVG reference resolves, component imports exist, templates are tag-balanced, CSS braces balance, logic scripts compile |
| `npm run build`   | Run the checks, then write the deployable site to `dist/`                     |
| `npm run preview` | Serve `dist/`                                                                 |

## Project structure

```
index.html                 Entry page: page wrapper, standalone/safe-area mode, loads React + runtime, mounts <Main>
manifest.webmanifest       Web App manifest (standalone display)
runtime/dc-lite.js         Template runtime ({{holes}}, sc-if, sc-for, dc-import, helmet, DCLogic)
components/
  Main.dc.html             The whole app: styles (tokens, glass, nav), template and logic
  ListItem.dc.html         Shared list row (icon circle, title, subtitle, amount/chevron)
assets/
  fonts/InterVariable.woff2          Inter 4.1 variable (UI text, cv11 single-storey a)
  fonts/SharpGrotesk-Medium20.otf    Large and compact titles
  images/*.svg                       Raiffeisen mark, status bar, home indicator, EUR/USD/BTC icons
  images/merchants/*.png             Transaction logos (Amazon, Uber, Acme, Starbucks, …)
  images/banks/*.png                 Bank logos (Bank of America, Ent Credit Union, …)
  images/lens-displacement.png       Liquid-glass displacement map (Settings button)
scripts/
  build.mjs                Validation + dist/ output
  serve.mjs                Zero-dependency static server
```

## Browser preview vs installed iOS Web App

The same deployment switches mode automatically:

- **Browser** (desktop or mobile Safari/Chrome): the prototype shows its own status bar and home indicator in the 430 × 932 frame, centred and scaled to fit narrow screens.
- **Installed Web App** (Safari → Share → *Add to Home Screen*, then open from the icon): detected from `navigator.standalone` / `display-mode: standalone`. The fake status bar and home indicator are hidden, the frame fills the screen, and the nav bar, tab bar, AI button, Save button and chat input use the real `env(safe-area-inset-top/bottom)`. Gradients, blur and scrolling content run under the system areas (`black-translucent` status bar). iOS 26+ fills the status bar area from the colour of an opaque element at the page's top edge, so a fixed status-bar-high layer (`.dc-topedge`) always carries the colour of the screen underneath (bank wallpaper, dimmed backdrop behind the Chat sheet, or the page colour); `theme-color` follows it.

- **Keyboard (experimental)**: in the browser the simulated iOS keyboard is used. In the installed Web App it is hidden and Chat / Search focus real inputs with the native iOS keyboard (emoji, dictation, languages, autocorrect). The app frame follows `window.visualViewport`, so the chat input sits directly above the keyboard and the thread resizes above it; no keyboard height is hard-coded.

All standalone rules live in `index.html` under `html.dc-standalone`. The components are unchanged.

Asset URLs are relative, so the site works from a domain root or a sub-path (e.g. GitHub Pages project sites).

## Editing

- **Design tokens** (RBI colours, radii, spacing, glass variables) are at the top of the `<style>` in `components/Main.dc.html` under `:root`.
- **Props / variants**: the defaults in `data-props` on the `<script data-dc-script>` tag (`tabBarVariant`: `split` | `classic`, `glassHighlightDebug`).
- Template syntax: `{{path}}` holes, `<sc-if value="{{cond}}">`, `<sc-for list="{{items}}" as="item">`, `<dc-import name="ListItem" heading="…">` (kebab-case attributes become camelCase props).

## Deploy

- **Vercel**: import the repo. `vercel.json` runs `npm run build` and serves `dist/`.
- **Netlify / Cloudflare Pages**: build command `npm run build`, publish directory `dist`.
- **GitHub Pages**: enable *Settings → Pages → Source: GitHub Actions*. `.github/workflows/deploy-pages.yml` builds and deploys on every push to `main`.
- **Any static host**: run `npm run build` and upload `dist/`.

## Notes

- **Font licensing**: Inter is licensed under the SIL Open Font License. Sharp Grotesk is a commercial typeface, so check that your licence allows web embedding and redistribution before you publish this repository or deployment publicly.
- **Network**: React and ReactDOM 18.3.1 come from `cdn.jsdelivr.net`. To run fully offline, download the two UMD files into `runtime/vendor/` and point the `<script>` tags in `index.html` at them (keep the `integrity` attributes).
