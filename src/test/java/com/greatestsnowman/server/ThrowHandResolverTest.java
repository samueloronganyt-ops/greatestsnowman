package com.greatestsnowman.server;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ThrowHandResolverTest {
    private static final double RELEASE_PROGRESS = 0.12 / 0.45;

    @Test
    void releaseHandIsAtTheUpperBodyForAllVariantsAndStances() {
        for (SnowmanVariant variant : SnowmanVariant.values()) {
            double standingScale = 1 - Math.sin(RELEASE_PROGRESS * Math.PI) * 0.035;
            var standing = ThrowHandResolver.resolve(variant, 0, 0, 0, false, standingScale,
                    0.16, 0, -0.8, variant.armRestAngle() + 0.10, 0.05);
            double crouchingScale = 0.61 - Math.sin(RELEASE_PROGRESS * Math.PI) * 0.025;
            var crouching = ThrowHandResolver.resolve(variant, 0, 0, 0, true, crouchingScale,
                    0.12, 0, -0.65, variant.armRestAngle() + 0.08, 0.04);

            assertTrue(standing.y() > 1.8, variant.key() + " standing hand must be above the hip");
            assertTrue(crouching.y() > 1.0, variant.key() + " crouching hand must remain above the ground");
            assertTrue(standing.y() > crouching.y(), variant.key() + " crouching hand should be lower");
        }
    }

    @Test
    void releaseHandUsesRootFacingAndKeepsYawRotationHorizontal() {
        double bodyScaleY = 1 - Math.sin(RELEASE_PROGRESS * Math.PI) * 0.035;
        var forward = ThrowHandResolver.resolve(SnowmanVariant.CLASSIC, 3, -4, 0, false,
                bodyScaleY, 0.16, 0, -0.8, 0.4, 0.05);
        var turned = ThrowHandResolver.resolve(SnowmanVariant.CLASSIC, 3, -4, Math.PI / 2, false,
                bodyScaleY, 0.16, 0, -0.8, 0.4, 0.05);

        assertEquals(forward.y(), turned.y(), 1e-9);
        assertEquals(forward.z() + 4, turned.x() - 3, 1e-9);
        assertEquals(-(forward.x() - 3), turned.z() + 4, 1e-9);
    }
}
