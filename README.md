# Reaction Clipboard

Reaction Clipboard is a fully local Electron desktop app for saving, finding,
and copying reaction text, PNG, JPG/JPEG, WebP, and GIF files. Search and filters
combine with AND behavior. Imported files are copied into managed storage; the
originals remain untouched.

## Development

```sh
npm install
npm run dev
npm run typecheck
npm test
npm run test:e2e
npm run build
```

Production packages use `npm run dist:win` on Windows and `npm run dist:mac` on
macOS. Windows builds are single-file portable executables with no installer.
macOS builds are portable universal `.app` bundles with no DMG or installer.
Provide `build/icon.ico` and `build/icon.icns` before packaging. macOS builds use
an ad-hoc signature; builds do not identify a publisher.

## Local Data

The fixed data root is `%APPDATA%\Reaction Clipboard\` on Windows and
`~/Library/Application Support/Reaction Clipboard/` on macOS. It contains
`database.sqlite`, `media/`, and `electron-profile/`. Close the app and remove
that root to reset it completely.

At runtime, the app writes its SQLite database and SQLite journal files beneath
that root. Electron profile data, logs, crash dumps, and session data are routed
beneath `electron-profile/`. Importing media reads the user-selected source file,
writes a temporary file beneath `media/`, and renames it into a managed copy
after validation. Deleting an item removes only its managed copy. The Settings
button can ask the operating system to open the data root in the file browser.

## Security Model

Reaction Clipboard keeps the renderer offline-only. The renderer CSP denies
network connections, and the default session blocks remote HTTP, HTTPS,
WebSocket, navigation, permission, and new-window attempts. Development permits
loopback Vite assets only.

Explicitly dropping a web image is the runtime network exception. The main
process downloads that HTTP or HTTPS URL through a separate cache-disabled
session, follows at most five redirects, rejects responses larger than 100 MB,
and validates the image signature before offering the local import. The bytes
are kept in memory until the user saves the item, then written as a managed
copy. Packaged builds reject obvious localhost, private-network, and link-local
hostnames. This is a best-effort filter: hostnames are not resolved and checked
before the request, so it is not complete SSRF protection against a crafted
hostname that resolves to a local address.

Electron-controlled writable paths are routed beneath the app-owned data root.
Installers and operating systems may still write normal installation metadata,
shortcuts, caches, or security records. On macOS, Chromium's Keychain-backed
browser credential storage is disabled because this offline app does not store
browser credentials.

Copying an item changes the system clipboard. Opening the data folder asks the
operating system to launch its file browser for the fixed app-owned data root.

On Windows, copying an animated GIF as a file attachment launches a hidden,
non-interactive system PowerShell process. It runs a fixed script that places
the app-managed GIF path on the clipboard using Windows `FileDrop`; reaction
names and user-provided paths are not inserted into executable script text.
On macOS, the app uses a fixed JXA script to place the app-managed GIF URL on
the native pasteboard as a Finder-compatible file attachment. The path is
passed as a script argument rather than inserted into executable script text.

## Limitations

The MVP is offline-only and does not support video. Electron's portable
clipboard APIs do not reliably paste GIFs as animated attachments. Windows and
macOS use platform-specific file references; other platforms copy a still image
with explicit feedback. Discord clipboard behavior still requires manual
platform validation.
