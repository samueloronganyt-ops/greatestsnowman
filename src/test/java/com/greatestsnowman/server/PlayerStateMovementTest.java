package com.greatestsnowman.server;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

class PlayerStateMovementTest {
    private final ArenaMap arena = new ArenaMap("MOVEMENT_TEST", 144,
            java.util.List.of(), java.util.List.of(), java.util.List.of(), java.util.List.of());
    private final CollisionSystem collisions = new CollisionSystem();

    @Test
    void leftAndRightIntentsStayRelativeToCameraHeading() {
        PlayerState leftAtBackView = player();
        leftAtBackView.setInput(-1, 0, 0);
        leftAtBackView.tick(0.1, arena, collisions);
        assertTrue(leftAtBackView.getX() > 0, "A/left intent should move to screen-left at yaw zero");

        PlayerState rightAtBackView = player();
        rightAtBackView.setInput(1, 0, 0);
        rightAtBackView.tick(0.1, arena, collisions);
        assertTrue(rightAtBackView.getX() < 0, "D/right intent should move to screen-right at yaw zero");

        PlayerState leftAfterOrbit = player();
        leftAfterOrbit.setInput(-1, 0, Math.PI / 2);
        leftAfterOrbit.tick(0.1, arena, collisions);
        assertTrue(leftAfterOrbit.getZ() < 0, "Left intent should rotate with a camera facing +X");

        PlayerState rightAfterOrbit = player();
        rightAfterOrbit.setInput(1, 0, Math.PI / 2);
        rightAfterOrbit.tick(0.1, arena, collisions);
        assertTrue(rightAfterOrbit.getZ() > 0, "Right intent should rotate with a camera facing +X");
    }

    private static PlayerState player() {
        return new PlayerState("calibration", "Calibration", "#ffffff", 0, 0);
    }
}
