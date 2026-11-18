package com.greatestsnowman.server;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AimResolverTest {
    @Test
    void wrapsYawAndInterpolatesAcrossTheShortArc() {
        double delta = AimResolver.angleDiff(Math.PI - 0.05, -Math.PI + 0.05);
        assertEquals(0.1, delta, 1e-9);
        assertEquals(Math.PI, Math.abs(AimResolver.lerpAngle(Math.PI - 0.05, -Math.PI + 0.05, 0.5)), 1e-6);
    }

    @Test
    void resolvesYawAndPitchFromTheHandInThreeDimensions() {
        AimResolver.Direction direction = AimResolver.resolve(1, 2, 3, 5, 5, 9, 0);
        assertEquals(Math.atan2(4, 6), direction.yaw(), 1e-9);
        assertEquals(Math.atan2(3, Math.hypot(4, 6)), direction.pitch(), 1e-9);
        assertEquals(1, Math.hypot(Math.hypot(direction.x(), direction.y()), direction.z()), 1e-9);
        assertTrue(AimResolver.canHitPlayer("owner", "enemy"));
        assertTrue(!AimResolver.canHitPlayer("owner", "owner"), "the local player cannot be hit by their own snowball");
    }

    @Test
    void handRayStopsAtWallsAndCanClearTheirTop() {
        Map<String, Object> wall = Map.of("x", 0.0, "z", 5.0, "width", 4.0,
                "depth", 0.4, "height", 2.5);
        assertTrue(AimResolver.wallBlocksSegment(wall, 0, 1.4, 0, 0, 1.4, 10, 0.3));
        assertTrue(!AimResolver.wallBlocksSegment(wall, 0, 3.2, 0, 0, 3.2, 10, 0.3),
                "a hand ray above the wall clears it");
    }
}
