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
index.html                 Entry page: loads React, the runtime, mounts <Main>
runtime/dc-lite.js         Template runtime ({{holes}}, sc-if, sc-for, dc-import, helmet, DCLogic)
components/
  Main.dc.html             The whole app: styles (tokens, glass, nav), template and logic
  ListItem.dc.html         Shared list row (icon circle, title, subtitle, amount/chevron)
assets/
  fonts/InterVariable.woff2          Inter 4.1 variable (UI text, cv11 single-storey a)
  fonts/SharpGrotesk-Medium20.otf    Large and compact titles
  images/*.svg                       Raiffeisen mark, status bar, home indicator, EUR/USD/BTC icons
  images/lens-displacement.png       Liquid-glass displacement map (Settings button)
scripts/
  build.mjs                Validation + dist/ output
  serve.mjs                Zero-dependency static server
```

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
