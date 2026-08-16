# Search App home-screen icon

Search App uses a repository-owned bird and map-pin illustration for its home-screen identity. The artwork identifies a personal Taiwan bird-observation search tool; it does not use or imply affiliation with eBird brand artwork. The dark-green full-bleed field and compact bird silhouette keep the subject recognizable when iOS rounds the icon or Chromium applies a mask.

## Asset contract

`assets/search-app-icon-source.svg` is the editable source. `public/icons/` contains the generated browser assets:

- `search-icon.svg` is the scalable browser favicon.
- `search-icon-32.png` is the raster favicon fallback.
- `search-apple-touch-icon.png` is the 180 px iOS home-screen icon.
- `search-icon-192.png` and `search-icon-512.png` are the manifest icons. Their `any maskable` purpose lets Chromium select the same full-bleed artwork for ordinary and masked surfaces.

Generate the checked-in assets on macOS with:

```bash
npm run generate:search-icons
```

The generator copies the editable SVG and uses the system `sips` utility to rasterize each required size. Edit only the source SVG, run the command, and review the 32 px, 180 px, 192 px, and 512 px outputs before committing. The Search production build copies `public/` unchanged into `dist-search/`, which is the directory served by Cloudflare Static Assets.

`search.html` declares the manifest, Apple touch icon, scalable favicon, raster favicon fallback, theme color, and iOS home-screen title. `public/search.webmanifest` defines the installed identity `eBird Taiwan Search`, root launch URL, standalone display, dark-green theme and background, and the Chromium icon entries.

## Add to Home Screen verification

Run `npm run build:search` and deploy the resulting Search App to an HTTPS Cloudflare URL. Browser installation surfaces use cached icons, so remove an existing home-screen shortcut and clear the site data before each verification pass.

| Environment | Steps | Record the result |
| --- | --- | --- |
| iOS Safari on an iPhone or iPad | Open the deployed root URL, use Share → Add to Home Screen, and confirm the title before adding. Launch the shortcut from the home screen. | Device and iOS version; displayed name `eBird Taiwan Search`; a screenshot showing the dark-green bird-and-pin icon; launch result. |
| Android Chrome or Chromium on an Android device | Open the deployed root URL, use the browser menu’s Add to Home screen or Install action, and inspect the proposed name. Launch the shortcut from the home screen. | Device and browser version; displayed name `eBird Taiwan Search`; a screenshot showing the masked dark-green bird-and-pin icon; launch result. |

A pass shows `eBird Taiwan Search` as the home-screen name, a recognizable bird-and-pin icon without clipped central features, and a shortcut that opens the Search App at the root URL. Keep the screenshots and environment details with the release verification record.
