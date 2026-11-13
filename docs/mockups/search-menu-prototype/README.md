# Search App menu design prototype

Issue #61 compares two compact navigation structures for the browser Search App. This is a throwaway design artifact on an isolated prototype branch. It is not production code or a deployment. Native Desktop settings are outside this design.

Run from this worktree with `python3 -m http.server 7309 --bind 127.0.0.1 --directory docs/mockups/search-menu-prototype`, then open http://127.0.0.1:7309/. No dependencies, build, API requests, real credentials, browser storage, or map tiles are used. All state resets on reload. The local SVG map and observations are labeled demonstrations.

## Compare

- `?variant=A` is recommended. A 60 px toolbar has Menu, a context title, and Search or Modify. The main menu exposes 搜尋鳥種, 搜尋鳥點, 我的鳥點, then 設定與說明. Choosing a search destination opens its focused bottom sheet. Opening a function menu does not erase conditions. Before any search, only the compact toolbar and map are shown. There is no empty results sheet or marketing panel. A half sheet appears only for search results or selected saved-place detail.
- `?variant=B` uses the current function title as the three-destination picker and a separate gear for settings. The 60 px toolbar can display the query as a second line. A lean search form expands inline. This makes the current function switch direct, but the form consumes map height and the chevron requires more interpretation.
- `overview.html` places two live, clean 390 px views side by side (the recommended menu and settings). The dark floating comparison control sits outside the app's reserved viewport. It is prototype chrome, not a product bottom navigation. Left and right arrows switch variants unless a field has focus. `clean=1` removes the comparison chrome and its reserved space for exact viewport screenshots.

Linkable initial states are `home`, `menu`, `species-form`, `spot-form`, `results`, `saved`, `editor`, and `settings`. Example `?variant=A&state=results&clean=1`. Query parameters select starting scenarios, not persisted session data.

## Flows and design intent

The main destinations answer where to go. Search or Modify answers how to change the current query. API key management belongs to low-frequency settings. The bird-spot menu subtitle explains public hotspots and personal saved places; the saved destination explains management of favorites, notes, and pins.

Species search contains a name and editable 1–30 integer days. Bird-spot search contains only a name and searches public hotspots and personal saved places. No geographical filter is introduced. Each search mode retains its own committed conditions in memory. Selecting a mode opens those conditions. Submit commits the draft and shows sample results. Cancel, Escape, and a floating sheet backdrop discard the draft and retain the prior query/results. Opening and closing the menu does not change conditions. The prototype uses a fixed illustrative result set rather than claiming actual search results.

My places is its own page with filtering, pinned/recent/name sorting, pin toggles, and removal. A saved item opens map detail, and that detail returns directly to My places. Edit is a child page with Back, Cancel, and Save. A changed field followed by Back or Cancel demonstrates a three-choice guard (save and continue, discard, continue editing). Save changes the selected demo item's name and note for the current session.

Settings returns to the page from which it opened. Only this page offers 移除 API key. Its confirmation states that favorites and notes remain. Removal changes a RAM-only status. The prototype never accepts or reveals an actual key. Production semantics would be this browser and origin, not a device-wide deletion. Favorites, notes, and storage explanation belong here too. API key replacement is the same boundary: changing the key must retain favorites and notes. The replacement setup form is deliberately outside this navigation prototype.

At 900 px and wider, the browser Search App uses one slim brand/navigation row, a compact search toolbar when requested, a map on the left, and a 380 px list on the right only when results or saved-place details exist. Before the first search, the map fills the available width. This is the wide browser Search App, not the native Desktop App.

## Evidence

Headless Playwright drove menu selection, search-mode retention, cancel preserving results, saved-page navigation, settings key removal, return to origin, and dirty editor cancellation. Sixteen variant/state combinations at 320 px were checked for horizontal page overflow with no overflow or browser errors. Clean screenshots cover A home/menu/form/results/saved/editor/settings at 390 px, B menu/form at 390 px, and A results/form at 1440 px and A results at 402 px. Extended headless checks exercised a 12-day search, distinct spot results, per-item saved identity, edited names/notes appearing in the list and map detail, pin toggling, and removal. Screenshots live in `screenshots/`.

The point this prototype supports is the layout comparison. It does not validate real data, touch gestures, focus trapping, screen-reader behavior, map manipulation, connectivity, persistence, or production accessibility. A selected design needs a production implementation and acceptance checks.

Clean-state screenshots also check `window.scrollY === 0` and toolbar top at zero. Document scrolling is disabled; forms, sheets, and content pages scroll internally.

## Final design review

Independent review passed the final artifact at index.html SHA256 `a31c887806b28468303b38d1a57bce2a433f0c490d0f91a7d66d9fba6285f713`. Initial unsearched states show only the compact toolbar and map, with no empty sheet or sidebar. Mobile toolbar is 60 px and wide toolbar is 64 px; the wider height is an accepted responsive design choice. Final representative checks covered 320, 390 and 1440 px, query cancellation, per-mode conditions, saved-item editing, the three-choice draft guard, and settings removal preserving favorites.
