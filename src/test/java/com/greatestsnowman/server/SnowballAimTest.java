package com.greatestsnowman.server;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SnowballAimTest {
    @Test
    void projectileStopsAtItsServerValidatedAimRange() {
        SnowballState ball = new SnowballState("player", 2, -3, Math.PI / 2, 0, 6.25);
        ball.advance(1);

        assertEquals(8.25, ball.getX(), 1e-9);
        assertEquals(-3, ball.getZ(), 1e-9);
        assertTrue(ball.hasReachedTarget());
    }

    @Test
    void throwsUseStanceHandHeightAndWaitUntilReleaseFrame() {
        double[] handHeights = { MovementConfig.STANDING_THROW_HEIGHT,
                MovementConfig.CROUCHING_THROW_HEIGHT };
        for (double handHeight : handHeights) {
            SnowballState ball = new SnowballState("player", 2, -3, Math.PI / 2,
                    0, 12, handHeight, 0.2);
            assertEquals(handHeight, ball.getY(), 1e-9);
            assertFalse(ball.isLaunched());
            assertFalse(ball.consumeLaunchEvent());
            ball.advance(0.15);
            assertEquals(2, ball.getX(), 1e-9, "ball stays at the hand during wind-up");
            assertFalse(ball.isLaunched());
            ball.advance(0.10);
            assertTrue(ball.isLaunched());
            assertTrue(ball.getX() > 2, "ball moves on the server's release frame");
            assertTrue(ball.consumeLaunchEvent());
            assertFalse(ball.consumeLaunchEvent(), "release event is emitted once");
        }
    }

    @Test
    void sweptProjectileChecksCatchThinWallsAndPlayersBetweenTicks() {
        Map<String, Object> thinWall = Map.of("x", 4.0, "z", 0.0, "width", 0.18,
                "depth", 2.0, "height", 2.5);
        SnowballState wallBall = new SnowballState("owner", 0, 0, 1.4,
                Math.PI / 2, 0, 0, 20, 0);
        wallBall.advance(0.4);
        assertTrue(wallBall.intersectsWall(thinWall), "the fast ball crosses the thin wall within one server tick");
        wallBall.bounceOff(thinWall, wallBall.getPreviousX(), wallBall.getPreviousZ());
        assertEquals(wallBall.getPreviousX(), wallBall.getX(), 1e-9, "the ball is restored before the wall");
        wallBall.advance(0.05);
        assertTrue(wallBall.getX() < 0, "the reflected ball moves away from the wall");

        PlayerState target = new PlayerState("target", "Target", "#ffffff", 4, 0);
        SnowballState playerBall = new SnowballState("owner", 0, 0, 1.4,
                Math.PI / 2, 0, 0, 20, 0);
        playerBall.advance(0.4);
        assertTrue(target.intersects(playerBall), "the hitbox sweep catches a target crossed between ticks");
    }
}
