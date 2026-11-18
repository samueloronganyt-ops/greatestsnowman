# Game flow

```mermaid
flowchart TD
    A[Open game] --> T[Title screen]
    T -->|Play| S{Valid saved session?}
    S -- Yes --> M[Room menu]
    S -- No --> L[Login or register]
    L -->|Success| M
    L -->|Cancel/logout| T
    M -->|Host| H[Create room]
    M -->|Join| J[Enter room code]
    H --> B[Lobby]
    J --> B
    B --> C[Customize snowman and ready up]
    C --> D{At least two players and all ready?}
    D -- No --> B
    D -- Yes, host starts --> G[Game]
    G --> I[Send movement and stance input]
    I --> I1{Requested stance or dash valid?}
    I1 -- No --> I2[Keep current state and cooldown]
    I1 -- Yes --> I3[Update speed, hitbox, and throw height]
    I2 --> I4[Animate local and remote snowmen]
    I3 --> I4
    I4 --> I5[Collect gifts, charge, and throw snowballs]
    I5 --> I
    I --> W{Player reaches score goal?}
    W -- No --> I
    W -- Yes --> R[Results and final scoreboard]
    R -->|Play again| G
    R -->|Back to lobby| B
    B -->|Leave room| M
    M -->|Log out| T
    T -->|Quit| Q{Confirm quit?}
    Q -- Stay --> T
    Q -- Yes --> X[Leave room and sign out]
    X --> Y[Try closing the window]
    Y --> Z[Thanks screen if the browser stays open]
    Z -->|Play again| T
```

`ScreenFlow` owns the UI-level state transitions: `TITLE`, `LOGIN`, `MENU`, `LOBBY`, `GAME`, `QUIT_CONFIRM`, and `THANKS`. A saved account is validated only after the player selects Play, so the initial title remains visible on a fresh load. The title art and its separate lightweight Three.js snowman renderer are disposed while hidden; the existing game scene, account system, room protocol, and match loop retain their own responsibilities. The title uses a static full-art fallback when WebGL creation fails.

The browser sends input intent and displays snapshots. `RoomManager` and `GameRoom` remain authoritative for membership, readiness, movement, hits, power-ups, scoring, and results.
