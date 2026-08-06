# Mobile native parity and performance

The Android app is a React Native client of the EdgeEver API. The PWA remains the product reference for features and visual language, but it must not be embedded as the primary App workspace.

## Performance acceptance targets

These targets are measured on a mid-range Android device using a signed release build and an already authenticated account.

| Path | Target |
| --- | --- |
| Cold launch to native shell | under 1.0 s |
| Warm launch to cached notebook and memo list | under 0.5 s |
| Cached list to usable state | no network dependency |
| Memo list scrolling | no sustained dropped-frame sequence |
| Search typing | no request per keystroke; 250 ms debounce |
| Filter or sort change | keep prior content until replacement data is ready |

Build success is not a performance result. Before a Play production rollout, record cold and warm launch timings on a physical device and compare them with the currently published internal build.

## Architecture rules

- Render startup, navigation, notebook selection, memo lists, search, and settings with native React Native views.
- Reuse the shared API client and shared data types instead of duplicating backend contracts.
- Hydrate only the default notebook and memo-list queries at startup. Refresh stale data in the background.
- Clear persisted query data when the account changes, signs out, or becomes unauthorized.
- Keep optional heavyweight features out of the startup path. Do not embed the PWA or a WebView as the App workspace shell (lists, navigation, settings).
- Note body rendering may use a TipTap WebView runtime for both **read-only preview** and **edit**, so the same document schema, images, tables, and Mermaid path are shared. Native chrome owns headers, FABs, sheets, and system actions around that body.
- Use virtualized lists and stable item components for collections.

## Mobile product scope

The App follows the mobile PWA for high-frequency layouts and interactions, but it is not a copy of every desktop management feature. Shared mobile interaction contracts belong in `@edgeever/shared`; platform-specific rendering, local persistence, protected resource loading, and save lifecycles remain separate when that preserves native performance.

| Mobile capability | Native status |
| --- | --- |
| Login and self-hosted instance connection | Implemented |
| Notebook hierarchy and management | Implemented |
| Memo list, filters, sort, pin, and batch operations | Implemented |
| Local-cache search | Implemented |
| Local TipTap create/edit and autosave flow | Implemented |
| Note detail body preview via read-only TipTap (same schema as edit) | Implemented |
| Attachments, image compression, and resource library | Implemented |
| Tag management | Implemented |
| Revision history and restore | Implemented |
| Offline drafts, local mirror, and sync queue | Implemented |
| MCP/API token management | Implemented |
| Password change and multi-user management | Implemented |

Desktop-first management features such as unified ZIP import/export and trash browsing, restore, or empty-trash actions are intentionally excluded from the App core. Ordinary mobile deletion remains a soft delete so that recovery stays available from the desktop/PWA interface. Future mobile work should prioritize capture, reading, editing, search, sync reliability, startup speed, and interaction smoothness instead of restoring these excluded screens.
