# Lunar Defender

2D co-op asteroid game with WebRTC peer-to-peer multiplayer.

**Play:** https://andrewboudreau.github.io/LunarDefender/

## Quick Start

1. One player clicks **HOST GAME** and shares the 6-character room code
2. Other players click **JOIN GAME** and enter the code
3. Host clicks **START GAME**

**Controls:** Arrow keys/WASD to fly, SPACE to shoot. Touch buttons on mobile.

## Architecture

```
Host (authoritative)                 Clients
┌────────────────────┐              ┌─────────────┐
│ Game State         │◄─── input ───│ Player B    │
│ - ships{}          │              └─────────────┘
│ - rocks[]          │              ┌─────────────┐
│ - bullets[]        │◄─── input ───│ Player C    │
│                    │              └─────────────┘
│ Physics Loop       │
│ Collision Detection│
│                    │
│ Broadcast state ───┼──► 50ms intervals to all clients
└────────────────────┘
```

The host runs the game simulation. Clients send input and render the state they receive.

## User Identity

Cookie-based identification (not secure, proof-of-concept only):

| Cookie | Purpose |
|--------|---------|
| `lunar_user_id` | Unique ID, auto-generated on first visit |
| `lunar_display_name` | Player name, user-editable or auto-generated |

Auto-generated names follow the pattern: `{Adjective}{Noun}{Number}` (e.g., `CosmicPilot42`)

## Network Protocol

PeerJS handles WebRTC signaling. Messages are JSON objects with a `type` field:

| Message | Direction | Purpose |
|---------|-----------|---------|
| `join` | Client → Host | Send name/userId when connecting |
| `init` | Host → Client | Full game state for new player |
| `state` | Host → Client | Game state update (50ms tick) |
| `start` | Host → Client | Game has started |
| `input` | Client → Host | Player input (keys pressed) |

## Bot Mode

```
https://andrewboudreau.github.io/LunarDefender/?bot=true
```

Auto-hosts a game with an AI player. The bot:
- Finds the nearest rock
- Rotates toward it
- Thrusts when far and aimed correctly
- Shoots when aimed at a rock within range

## Files

| File | Purpose |
|------|---------|
| `index.html` | Entry point, UI, CSS |
| `game.js` | Game logic, networking, rendering (~850 lines) |

## Development

No build step. Serve files locally:

```bash
npx serve .
```

Or push to GitHub and test on Pages (preferred workflow - low risk, easier testing).
