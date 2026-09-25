# Embedding the map on protectthevote.net

For: the protectthevote.net WordPress admin. One-time setup.

## Steps

1. Create a new page (or open the existing one) and set its visibility so it
   stays **unlisted**: published, but not linked from menus and excluded from
   search/sitemaps. Password protection isn't needed.
2. Add a **Custom HTML** block. Don't use the "Embed" block.
3. Paste this snippet in:

```html
<iframe id="ep-training-map-frame"
  src="https://common-cause.github.io/ep-training-map-public/"
  title="Election Protection volunteer trainings map"
  style="width:100%; height:1000px; border:0; display:block;"
  loading="lazy"
  referrerpolicy="no-referrer"></iframe>
<script>
/* Grows the frame to fit the map, e.g. when a state's list opens on a phone.
   Accepts a height (a number) from the map's own address only. */
window.addEventListener("message", function (e) {
  if (e.origin !== "https://common-cause.github.io") return;
  var d = e.data;
  if (!d || d.type !== "ep-training-map:height" || typeof d.height !== "number") return;
  var f = document.getElementById("ep-training-map-frame");
  if (f) f.style.height = Math.min(Math.max(d.height, 400), 20000) + "px";
});
</script>
```

If WordPress strips the `<script>` (some setups do this for non-admins), the
iframe still works at its fixed 1000px height and scrolls inside when a
state's list is long. Adding the script later only improves it.

4. Preview the page on desktop and mobile, then publish. Send the page URL to Rob.

## Why an iframe

The iframe keeps the map's styling separate from the WordPress theme, so a theme
update can't break the map and the map can't break the page.

## Updates

The map refreshes itself twice a day (about 11am and 11pm Eastern), so there's nothing to do in WordPress
when trainings change. If the map looks empty or out of date, contact Rob.
Don't edit the snippet to work around it.

## Height

The map reports its own height, and the script above applies it. This was
tested 2026-09-24 against a stand-in host page at desktop width and at 390px,
with Arizona's 12-training list open. The frame grew to fit, with no inner
scrollbar. The 1000px starting height fits the closed map on desktop
(about 980px).
