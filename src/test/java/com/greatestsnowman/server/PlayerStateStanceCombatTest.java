package com.greatestsnowman.server;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class PlayerStateStanceCombatTest {
    private final ArenaMap arena = new MapGenerator().generate("MEDIUM");
    private final CollisionSystem collisions = new CollisionSystem();

    @Test
    void crouchedHitboxProtectsAgainstHighThrowsAndAllowsLowThrows() {
        PlayerState crouching = player("crouching");
        crouching.setInput(0, 0, 0, true, false);
        crouching.tick(0.016, arena, collisions);
        double scaledStandingThrow = SnowmanVariant.CLASSIC.hitboxHeight()
                * MovementConfig.STANDING_THROW_HEIGHT / MovementConfig.STANDING_HEIGHT;
        double scaledCrouchedThrow = SnowmanVariant.CLASSIC.hitboxHeight()
                * MovementConfig.CROUCHING_THROW_HEIGHT / MovementConfig.STANDING_HEIGHT;
        SnowballState highBall = new SnowballState("attacker", 0, 0, 0, 0, 12,
                scaledStandingThrow, 0);
        SnowballState lowBall = new SnowballState("attacker", 0, 0, 0, 0, 12,
                scaledCrouchedThrow, 0);
        assertFalse(crouching.intersects(highBall));
        assertTrue(crouching.intersects(lowBall));
        assertEquals(MovementConfig.QUICK_THROW_WINDUP_SECONDS, crouching.getThrowWindupSeconds(false), 1e-9);
    }

    @Test
    void lowWallsBlockOnlyProjectilesWhoseHeightOverlapsThem() {
        ArenaMap lowFence = new ArenaMap("TEST", 30, java.util.List.of(),
                java.util.List.of(java.util.Map.of("x", 0.0, "z", 0.0,
                        "width", 4.0, "depth", 1.0, "height", 1.4)),
                java.util.List.of(), java.util.List.of(java.util.Map.of("x", 0.0, "z", 3.0)));
        SnowballState standingShot = new SnowballState("stand", 0, 0, 0, 0, 12,
                MovementConfig.STANDING_THROW_HEIGHT, 0);
        SnowballState crouchedShot = new SnowballState("crouch", 0, 0, 0, 0, 12,
                MovementConfig.CROUCHING_THROW_HEIGHT, 0);
        assertFalse(collisions.bounceSnowball(lowFence, standingShot, 0, -1));
        assertTrue(collisions.bounceSnowball(lowFence, crouchedShot, 0, -1));
    }

    @Test
    void dashStopsAtWallAndCancelsCharge() {
        ArenaMap wallArena = new ArenaMap("TEST", 40, java.util.List.of(),
                java.util.List.of(java.util.Map.of("x", 0.0, "z", 2.5,
                        "width", 8.0, "depth", 1.0, "height", 2.4)),
                java.util.List.of(), java.util.List.of(java.util.Map.of("x", 0.0, "z", 0.0)));
        PlayerState runner = player("runner");
        assertTrue(runner.startCharge());
        runner.setInput(0, 1, 0, false, true);
        runner.tick(0.25, wallArena, collisions);
        assertFalse(runner.isCharging());
        assertTrue(runner.getZ() > 0.5);
        assertTrue(runner.getZ() < 1.7);
        assertNotEquals(MovementState.DASHING, runner.getMovementState());
        assertEquals(-1, runner.releaseCharge());
        assertEquals(-1, runner.releaseCharge());
        assertTrue(runner.startCharge());
    }

    private PlayerState player(String id) {
        return new PlayerState(id, id, "#ffffff", 0, 0);
    }
}
