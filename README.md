# The Greatest Snowman: Battle in the Snow

A low-poly, browser-based 3D multiplayer snowman game. The Java server owns player positions and broadcasts world snapshots.

## Current build: multiplayer arenas, power-ups, touch controls, and match results

### Build and run

The development machine has Java 17, Maven 3.10, and Node.js 22 set up in `.tools`. From PowerShell in the project directory, start the game with:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\run.ps1
```

The first start installs the client dependencies locally and builds Three.js into `client/dist`. The Java server then prints the local and LAN URLs. Open `http://localhost:8080` on the host PC. On a second device on the same Wi-Fi, open the printed LAN URL. Allow Java through Windows Defender Firewall on the Private network for TCP port 8080 if phones cannot connect. Both devices need to be on the same Wi-Fi; guest Wi-Fi isolation may block device-to-device traffic.

### Controls

- WASD or arrow keys: move relative to the camera; **A/left** strafe left and **D/right** strafe right. Camera drag follows the swipe horizontally and vertically; the Controls calibration readout displays the direction and server-space vector.
- Drag/swipe left or right to orbit that way, up/down to look up/down. The quaternion camera supports full vertical rotation; Settings includes optional **Invert X**, **Invert Y**, and **Limit vertical angle** toggles (all off by default) plus Reset Camera.
- Press **Q** to toggle shoulder aim and pointer lock; hold **right mouse** for temporary aim. Aim mode eases to a closer over-shoulder view and reduces look sensitivity; press **V** (or tap **SWAP** on touch) to change shoulders. **Shift** dashes. **Esc** exits aim or opens/closes the pause menu. Left mouse or Space charges and throws a snowball.
- **C** or **Ctrl** crouches (hold on PC by default; choose Toggle in Pause → Settings). Crouching slows movement, lowers the hitbox, and narrows throw spread.
- **Shift** or the touch DASH button triggers a server-validated 0.25-second burst, followed by a 2.5-second cooldown. Dash ends at walls and cancels an active throw charge.
- In a match, the account panel is hidden. Use the pause button for Resume, Settings, Leave Room, and Logout. The room chip collapses the player list; it stays separate from the nearby radar.
- On touch devices, use the left joystick to move, drag the right side to look, and use SNOWBALL, AIM, CROUCH, and DASH. Pause → Customize Controls lets you drag, resize, and adjust opacity for each control; layouts save independently for portrait and landscape on that device.
- Tap the minimap to briefly expand the nearby radar; it follows the player, rotates to camera heading, and shows nearby walls/pickups/opponents. Fullscreen controls are available in the menu, match HUD, and pause menu; supported Android browsers can lock landscape after fullscreen starts. Add to Home Screen for standalone mode on iOS Safari.
- Graphics can be set to Low, Medium, or High in Settings. The sound button mutes generated Web Audio cues.
- Join a room, then mark Ready; the host can start when at least two players are ready.
- The local minimap follows the player, rotates to the camera direction, and shows nearby walls, pickups, and opponents. Ice, snow-brick, and fence walls have distinct materials and bright outlines.
- Tap/release Space to throw a normal snowball. Hold Space and release for a charged critical throw. Movement slows while charging.
- Health bars show above every player and in the match HUD. Knockouts award one point and respawn after a short delay.
- Glowing, color-coded pickups grant an 8-second speed boost, stronger throws, or shield; healing restores health, and an extra-life pickup gives one 45-health respawn. The minimap marks live pickups.
- Matches end when a player reaches the host's 5-50 point goal. The results board shows final scores; the host can start a fresh match or return everyone to the lobby. Completed match scores update account totals, wins, and achievements.
- Snowmen now have highlighted coal eyes, rosy cheeks, and a curved coal smile.
- Snowmen share a joint-based Three.js rig with CLASSIC, TALL, and WIDE proportions. Their footstep gait advances with server snapshot movement distance; the idle, walk, run, crouch, dash, throw, hit, knockout, respawn, victory and lobby-ready poses blend on the same pivots. Hat, scarf, nose, arms and color customization remain on that rig.
- The Java `SnowmanVariant` profiles publish the proportions and matching hitbox dimensions in the room movement config; TALL is narrower and taller, while WIDE has a larger base, shorter arms, faster short steps, and a reduced collider height.

The room host chooses 2-8 players and a score goal from 5-50. Every room uses the hand-built Christmas Arena. Five-character room codes are shared with Join. If the host leaves, the next player becomes host. One account can have only one active game connection across windows and devices. A duplicate-session inline notice lets the player replace the other game connection from this device.

### Title screen

The first page is a separate Christmas title screen with the cropped snowy scene and logo, real keyboard/touch-accessible Play and Quit buttons, fullscreen and sound controls, animated snowfall, and a lightweight Three.js snowman built from the same `makeSnowman`/`SnowmanRig` factory as the game. The title model waves, blinks, follows pointer movement gently, and is disposed along with its WebGL renderer when the title closes. If the title renderer cannot start, the full supplied menu artwork is used as a static background with accessible Play/Quit hit targets.

Play opens login/registration unless the current tab has a saved session that validates; a valid session goes straight to the room menu. Once signed in, the title art stays away through room and match transitions. Logging out returns to the title. Quit asks first; Yes leaves the room, signs out, and tries `window.close()`. Browsers that refuse to close show a Thanks screen with Play Again. Sound stays muted if the saved sound setting is off, and the title's optional generated theme starts only after an interaction.

The title PNG/JPEG sprites are checked into `client/public/assets/title/`. To recrop them from the two supplied downloads on Windows, run `Set-ExecutionPolicy -Scope Process Bypass; .\tools\extract-title-assets.ps1` from the project root. It cuts the clean winter background, removes the connected checkerboard around the logo/button sprites, and saves a compressed JPEG fallback; the source files are expected in the current user's Downloads folder unless script parameters are supplied.

Three.js renders the game across the full browser viewport from a reduced-resolution buffer, then upscales it for the pixelated style. Buffer dimensions follow the canvas aspect ratio during resizes. The client adjusts render resolution and uses Low/Medium/High graphics presets. The shared arena source is [maps/christmas_arena.json](maps/christmas_arena.json); Java loads it from the classpath and the client imports the same file directly. It defines a 72 x 48 map-unit symmetric arena, scaled to 144 x 96 world units. It contains a stone perimeter and pillars, low mirrored cover, ice stacks, spawn pads, the center island/statue, gifts and festive decorations. Walls, collision, spawns, pickups, minimap, and scene rendering all derive from that definition. Edit map positions in map units, set `mirrorX`/`mirrorZ` for symmetric copies, and use `heightHs` for heights relative to the classic snowman. Java `MapValidator` and client `validateChristmasArena` check mirrored solids, overlap, clearance, spawn/pickup placement, line of sight, navigation routes, and collider counts when the definition loads. `ChristmasArenaTest` and `client/test/christmas-arena.test.js` assert the resulting geometry on both runtimes. Snowfall, the low-poly dusk mountains, instanced walls/trees/ice/bulbs, spawn rings, snow caps and lanterns are rendered from the same arena snapshot. The minimap draws local walls, pads, island, gifts, and nearby players. Movement is relative to the orbit camera, which stays behind the snowman. Account and lobby panels use rounded corners, larger touch targets, and internal scrolling on narrow phone screens.

### WebSocket protocol

The client authenticates `/ws` with its account session token. Client and server messages are JSON objects with a `type` field:

| Direction | Type | Fields | Purpose |
| --- | --- | --- | --- |
| Client to server | `host` | `maxPlayers`, `scoreGoal`, `mapSize` | Create a room and become its host. |
| Client to server | `joinRoom` | `roomCode` | Join an open lobby by code. |
| Client to server | `ready` | `ready` | Set or clear lobby readiness. |
| Client to server | `start` / `restart` / `backToLobby` / `leave` | none | Start (host only, all ready), restart after results, return to the lobby (host only), or leave. |
| Client to server | `customize` | `color`, `look` | Save and broadcast the chosen snowman parts. |
| Client to server | `input` | `moveX`, `moveZ`, `moveYaw`, `yaw`, `aimYaw`, `aimPitch`, `aiming`, `crouch`, `dash` | Submit movement, body heading, and look angles separately; Java validates movement and stance and publishes the same aim angles for remote animation. |
| Client to server | `chargeStart` | none | Begin server-timed charging. |
| Client to server | `throw` | `aimYaw`, `aimPitch` | Send the release-frame direction only; Java recomputes the launch vector from its stance and variant hand origin and owns collision, range, damage, and score. |
| Server to client | `welcome` | `id`, `name` | Confirm the authenticated player connection. |
| Server to client | `roomState` | room settings and status, `players[]`, health, score, active power-ups, `powerUps[]`, `winnerId`, `snowballs[]`, `effects[]`, initial `arena` | Sends map geometry on room changes and authoritative movement, pickups, combat, results, and knockout updates at about 30 ticks per second. Status is `LOBBY`, `IN_GAME`, or `RESULTS`. |
| Server to client | `roomLeft` | none | Confirm returning to the host/join menu. |
| Server to client | `error` | `code`, `message` | Report authentication, duplicate connection, room, or readiness errors. |

Malformed or oversized inputs are ignored. Java controls movement, stance hitboxes and transitions, wall collision, projectile launch timing and ricochets, charge timing, damage, pickups, timed abilities, knockouts, score goals, results, and respawn. Touch input is translated into the same server-authoritative movement and charge messages used on desktop. The room snapshot provides the shared movement tuning for client presentation.

## Accounts

Account registration, login, profile viewing and edits, logout, and account deletion are handled by Java. Account JSON is stored locally at `data/accounts.json` (ignored by Git). Passwords use individual salts and PBKDF2-HMAC-SHA256 hashes; plaintext passwords are never saved. Profile colors are applied to the player's snowman.

| Method and path | Request | Purpose |
| --- | --- | --- |
| `POST /api/accounts/register` | `{ "username": "SnowFox", "password": "..." }` | Create an account and start a session. |
| `POST /api/accounts/login` | `{ "username": "SnowFox", "password": "..." }` | Check credentials and start a session. |
| `GET /api/accounts/profile` | Bearer token | Read the signed-in profile and game statistics. |
| `PUT /api/accounts/profile` | Bearer token and optional `username`, `currentPassword`, `newPassword`, `snowmanColor`, `snowmanLook` | Update profile details and appearance. |
| `DELETE /api/accounts/profile` | Bearer token and `{ "password": "..." }` | Verify password and delete the account. |
| `POST /api/accounts/logout` | Bearer token | Revoke the current session token. |

Usernames must be 3-18 letters, numbers, or underscores. Passwords must be 8-128 characters. A duplicate username returns HTTP 409, invalid input returns HTTP 400, and bad credentials or missing sessions return HTTP 401. Completed matches update wins, games played, total points, and the First Point, Five Points, and Match Winner achievements.

## Tests and diagrams

Run the Java unit tests from the project root:

```powershell
mvn clean test
```

Run the client aiming tests from `client`:

```powershell
npm test
```

The suite covers account CRUD and persistence, rejected credentials, normal and critical damage, power-up effects, knockout scoring, score-goal results/restarts, room-code generation, movement-state transitions and profiles, stand-up clearance, dash cooldown/wall stopping, stance hitboxes, and hand-height throw release timing. Test scenarios and their expected/actual outcomes are in [docs/TEST_CASES.md](docs/TEST_CASES.md). Desktop and mobile viewport checks are also listed there; physical-phone FPS depends on the target device and browser.

- [Game flow](docs/game-flow.md)
- [Use cases](docs/use-cases.md)
- [Java class diagram and OOP notes](docs/class-diagram.md)

The project `.gitignore` excludes generated build files, dependencies, and local account data. Suggested commit sequence for a team submission:

1. `feat: add accounts and multiplayer room flow`
2. `feat: add arena combat power-ups and match results`
3. `feat: add mobile controls and adaptive rendering`
4. `test: document gameplay cases and Java architecture`
