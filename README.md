# ep-training-map-public

> Public, ungated coalition-facing version of the EP Training Map (trainings by state with registration links, no staff fields), served by GitHub Pages from an orphan gh-pages branch that ep-training-map's nightly force-pushes, and iframed on an unlisted protectthevote.net page. Hosting only: the build and field allowlist live in ep-training-map.

## Embed on commoncause.org

Paste into a WordPress **Custom HTML** block on the target page:

```html
<div id="cc-tool"></div>
<script src="https://common-cause.github.io/ep-training-map-public/src/embed.js"></script>
```

## Local Development

```bash
python -m http.server 8080
# Open http://localhost:8080
```

## Updating Content

Edit `data/tree.json` — no code changes needed for content updates.
Push to `main` to deploy.

## Project Structure

```
ep-training-map-public/
├── index.html              # Local dev wrapper (simulates a CC page)
├── src/
│   ├── embed.js            # Widget — finds #cc-tool div and renders the tool
│   └── embed.css           # Namespaced styles (.cc-tool *)
├── data/
│   └── tree.json           # Decision tree content — edit this for content changes
└── .github/
    └── workflows/
        └── deploy.yml      # Auto-deploys to GitHub Pages on push to main
```
