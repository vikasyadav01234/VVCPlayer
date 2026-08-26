# VVC Player

A modern, feature-rich video player built with Electron + Web Audio API.

## Features
- Beautiful dark glassmorphism UI
- Picture-in-Picture (PiP) floating window
- 10-band Audio Equalizer with 7 presets
- Watch Party (LAN sync with friends)
- Playlist with drag & drop
- Shuffle / Repeat / Speed control
- Keyboard shortcuts

## How to Run
Double-click VVCPlayer.bat  OR  run: npm start

## Keyboard Shortcuts
| Key          | Action              |
|--------------|---------------------|
| Space        | Play / Pause        |
| ← / →        | Seek 5s             |
| Shift+← / →  | Seek 30s            |
| ↑ / ↓        | Volume +/- 5%       |
| M            | Mute toggle         |
| F            | Fullscreen          |
| Alt+P        | Picture-in-Picture  |
| E            | Open Equalizer      |
| N / B        | Next / Previous     |
| , / .        | Speed down / up     |

## Watch Party (LAN)
1. Host clicks Watch Party → Start → share the room code
2. Guest clicks Watch Party → Join → paste code → Join
3. Playback syncs automatically between all users!

## Build as .exe Installer
npm run build
(Output in dist/ folder)
