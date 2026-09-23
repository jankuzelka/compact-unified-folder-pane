# Changelog

## 0.1.15

- Aligned the compact Folder Pane header height with the message-list header so the first folder row lines up with the first message row.
- Nudged the expanded native Folder Pane action row down by 1 px for bottom-edge alignment.
- Updated the add-on homepage URL to the GitHub project repository.
- Renamed the internal Experiment API namespace from `CompactFolderPane` to `CompactUnifiedFolderPane`.
- Removed the manifest maximum Thunderbird version limit; compatibility is now constrained only by the minimum supported version.
- Adjusted the compact Folder Pane action menu for improved visual alignment.

## 0.1.14

- Fixed the add-on icon background to use transparency.
- Updated the packaged icon set and release artifacts.


## 0.1.13

- Replaced the add-on icon with a revised design using a chevron motif.
- Added the updated icon set to the packaged XPI and repository assets.

All notable changes to this project will be documented in this file.

## [0.1.12] - 2026-09-22

Initial public-development baseline.

- Adds a responsive compact icon rail for Unified Folders.
- Preserves Thunderbird's native full-collapse behavior.
- Keeps the original Folder Pane toolbar available as a floating hover/focus overlay.
- Hides counts and sizes before folder labels become crowded.
- Uses the native compact `+` New Message control at narrow widths.
- Activates only when Unified Folders is the sole active folder mode.
- Verified on Thunderbird 128 ESR / Windows 11, Thunderbird 153 / Windows 10, and Thunderbird 156 / Windows 11.
