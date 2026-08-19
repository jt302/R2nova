# Changelog

## 0.1.3

- Check and install updates from the version dialog in the titlebar

## 0.1.2

- Transfers are a full main view, persist across restarts, and enqueue concurrently
- Copy public object URLs from the file list when r2.dev or a custom domain is enabled
- Remember language and panel sizes; pick language from the titlebar
- Packaged app name is R2nova; status text and paths are selectable
- Fix duplicate drag-drop uploads, selection-aware object actions, and loading vs empty states

## 0.1.1

- Replace the placeholder app icon with a warm-orange nova mark aligned to the UI primary color

## 0.1.0

- Initial scaffold: Tauri 2 + React 19 desktop client for Cloudflare R2
- Profiles in the OS keychain with Admin / Object token probing
- Object browser, transfer engine (equal parts + resume), organize, preview, control plane, Class A/B counters
- Unsigned macOS DMG via Homebrew Cask; Windows NSIS
