# Embedding the map on protectthevote.net

For: the protectthevote.net WordPress admin. One-time setup.

## Steps

1. Create a new page (or open the existing one) and set its visibility so it
   stays **unlisted**: published, but not linked from menus and excluded from
   search/sitemaps. Password protection isn't needed.
2. Add a **Custom HTML** block. Don't use the "Embed" block.
3. Paste this snippet in:

```html
<iframe
  src="https://common-cause.github.io/ep-training-map-public/"
  title="Election Protection volunteer trainings map"
  style="width:100%; height:900px; border:0; display:block;"
  loading="lazy"
  referrerpolicy="no-referrer">
</iframe>
```

4. Preview the page on desktop and mobile, then publish. Send the page URL to Rob.

## Why an iframe

The iframe keeps the map's styling separate from the WordPress theme, so a theme
update can't break the map and the map can't break the page.

## Updates

The map refreshes itself every night, so there's nothing to do in WordPress
when trainings change. If the map looks empty or out of date, contact Rob.
Don't edit the snippet to work around it.

## Open items

- **Height:** `900px` is a placeholder. Once the first build lands, we'll set it
  to the map's real height at desktop and mobile widths. If the map ends up
  needing auto-resize, ep-training-map would build that, and this snippet
  would change.
