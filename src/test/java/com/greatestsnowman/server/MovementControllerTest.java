package com.greatestsnowman.server;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class MovementControllerTest {
    private final CollisionSystem collisions = new CollisionSystem();
    private final ArenaMap openArena = new ArenaMap("TEST", 144,
            List.of(), List.of(), List.of(), List.of());

    @Test
    void transitionsBetweenStandingAndCrouchingWithServerOwnedProfiles() {
        MovementController controller = new MovementController();
        controller.setRequests(true, false);
        controller.tick(1_000, 0, 0, 0, 0, 0, openArena, collisions);
        assertEquals(MovementState.CROUCHING, controller.getState());
        assertEquals(0.55, controller.getSpeedMultiplier(1_000), 1e-9);
        assertEquals(SnowmanVariant.CLASSIC.hitboxHeight() * MovementConfig.CROUCHING_HEIGHT
                / MovementConfig.STANDING_HEIGHT, controller.getHitboxHeight(1_000), 1e-9);
        assertTrue(controller.getAccuracyRadians() < MovementConfig.STANDING_ACCURACY_RADIANS);

        controller.setRequests(false, false);
        controller.tick(1_100, 0, 0, 0, 0, 0, openArena, collisions);
        assertEquals(MovementState.STANDING, controller.getState());
    }

    @Test
    void dashUsesValidatedDirectionAndCooldownEdge() {
        MovementController controller = new MovementController();
        controller.setRequests(false, true);
        assertTrue(controller.tick(10_000, 0, 0, 1, 0, 0, openArena, collisions));
        assertEquals(MovementState.DASHING, controller.getState());
        assertEquals(-1, controller.getDashDirectionX(), 1e-9);
        assertEquals(0, controller.getDashDirectionZ(), 1e-9);
        assertEquals(2.5, controller.getDashCooldownSeconds(10_000), 1e-9);

        controller.tick(10_300, 0, 0, 0, 0, 0, openArena, collisions);
        assertEquals(MovementState.STANDING, controller.getState());
        controller.setRequests(false, false);
        controller.tick(10_310, 0, 0, 0, 0, 0, openArena, collisions);
        controller.setRequests(false, true);
        assertFalse(controller.tick(10_320, 0, 0, 0, 0, 0, openArena, collisions));
        controller.setRequests(false, false);
        controller.tick(12_499, 0, 0, 0, 0, 0, openArena, collisions);
        controller.setRequests(false, true);
        assertTrue(controller.tick(12_500, 0, 0, 0, 1, 0, openArena, collisions));
        assertEquals(0, controller.getDashDirectionX(), 1e-9);
        assertEquals(1, controller.getDashDirectionZ(), 1e-9);
    }

    @Test
    void crouchedPlayerNeedsHeadroomToStand() {
        ArenaMap lowCeiling = new ArenaMap("TEST", 30, List.of(),
                List.of(Map.of("x", 0.0, "z", 0.0, "width", 4.0, "depth", 4.0, "height", 2.6)),
                List.of(), List.of(Map.of("x", 0.0, "z", 0.0)));
        MovementController controller = new MovementController();
        controller.setRequests(true, false);
        controller.tick(1_000, 0, 0, 0, 0, 0, lowCeiling, collisions);
        assertEquals(MovementState.CROUCHING, controller.getState());
        controller.setRequests(false, false);
        controller.tick(1_100, 0, 0, 0, 0, 0, lowCeiling, collisions);
        assertEquals(MovementState.CROUCHING, controller.getState());
    }
}
