# CLAUDE.md

Project context for Claude Code.

## Project Overview

Lunar Defender is a 2D co-op asteroid game with WebRTC peer-to-peer multiplayer. Hosted on GitHub Pages as static files.

**Live:** https://andrewboudreau.github.io/LunarDefender/

## Tech Stack

- Vanilla JavaScript (no build step)
- PeerJS for WebRTC signaling and connections
- HTML5 Canvas for rendering
- GitHub Pages for hosting

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      HOST                               │
│  - Authoritative game state (ships, rocks, bullets)    │
│  - Runs physics and collision detection                │
│  - Broadcasts state to all clients at 50ms intervals   │
└─────────────────────────────────────────────────────────┘
        │                           │
        ▼                           ▼
┌───────────────┐           ┌───────────────┐
│   CLIENT A    │           │   CLIENT B    │
│ - Sends input │           │ - Sends input │
│ - Renders     │           │ - Renders     │
│   state       │           │   state       │
└───────────────┘           └───────────────┘
```

## File Structure

- `index.html` - Entry point, UI, styles
- `game.js` - All game logic, networking, rendering

## Key Systems

### Networking (PeerJS)
- Host creates a Peer with room code as ID
- Clients connect to host's peer ID
- Messages: `init`, `state`, `start`, `input`

### Game Loop
- `requestAnimationFrame` drives rendering
- Host updates physics, clients just render received state
- 50ms network tick rate for state broadcast

### User Identity (Cookie-based)
- Users get a unique ID stored in cookie `lunar_user_id`
- Display name stored in `lunar_display_name`
- Auto-generated nicknames if no name set

### Stats System
```
Session Stats (per ship)     Lifetime Stats (localStorage)
├── rocksDestroyed          ├── rocksDestroyed
├── shotsFired              ├── shotsFired
├── fuelUsed                ├── fuelUsed
├── deaths                  ├── deaths
└── sessionStart            ├── gamesPlayed
                            ├── timePlayed
                            └── lastPlayed
```

- Stats tracked on host (authoritative)
- Auto-saved to localStorage every 30s and on page unload
- Delta-based saving prevents double-counting

## URL Parameters

- `?bot=true` - Auto-host with AI bot player

## Development

No build step. Just serve the files:
```bash
npx serve .
```

## Documentation Principles

Target audience: software engineers who want to understand the system internals.

**Guidelines:**
- No fluff, pitch, or sales language - pure information and education
- Informational/debug presentation that pulls back the curtain, not demonstrational
- Prefer static diagrams or auto-playing animations over forced interaction
- State machines should show all states and transitions visibly, not hidden behind clicks
- Everything must either explain the system or build a sound mental model
- Don't force engagement - convey understanding with minimal jazz
- Code examples should be real, functional snippets from the codebase
- Avoid decorative animations that don't convey information

## Workflow

Push after most changes - low risk, easier to test on live hosted version.
