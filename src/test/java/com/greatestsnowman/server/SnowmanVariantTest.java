package com.greatestsnowman.server;

import com.greatestsnowman.account.SnowmanLook;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class SnowmanVariantTest {
    @Test
    void variantsExposeDistinctProportionsAndMatchingHitboxes() {
        assertEquals(1.0, SnowmanVariant.CLASSIC.snapshot().get("baseRadius"));
        assertEquals(0.85, SnowmanVariant.TALL.snapshot().get("baseRadius"));
        assertEquals(1.2, SnowmanVariant.WIDE.snapshot().get("baseRadius"));
        assertEquals(4.13, SnowmanVariant.CLASSIC.hitboxHeight());
        assertEquals(5.16, SnowmanVariant.TALL.hitboxHeight());
        assertEquals(3.72, SnowmanVariant.WIDE.hitboxHeight());
        assertEquals(0.82, SnowmanVariant.CLASSIC.hitboxRadius());
        assertEquals(0.77, SnowmanVariant.TALL.hitboxRadius());
        assertEquals(0.98, SnowmanVariant.WIDE.hitboxRadius());
        assertEquals(SnowmanVariant.WIDE, SnowmanVariant.fromKey("wide"));
        assertEquals(SnowmanVariant.CLASSIC, SnowmanVariant.fromKey("unknown"));
    }

    @Test
    void selectedVariantScalesStandingAndCrouchingServerCollider() {
        MovementController movement = new MovementController();
        movement.setVariant(SnowmanVariant.TALL);
        assertEquals(5.16, movement.getHitboxHeight(1000), 1e-9);
        assertEquals(0.77, movement.getHitboxRadius(), 1e-9);

        movement.setRequests(true, false);
        movement.tick(1000, 0, 0, 0, 0, 0, new MapGenerator().generate("MEDIUM"), new CollisionSystem());
        assertEquals(5.16 * MovementConfig.CROUCHING_HEIGHT / MovementConfig.STANDING_HEIGHT,
                movement.getHitboxHeight(1000), 1e-9);
        assertEquals(0.77 * MovementConfig.CROUCHING_RADIUS / MovementConfig.STANDING_RADIUS,
                movement.getHitboxRadius(), 1e-9);
    }

    @Test
    void variantSnapshotContainsRigAndHitboxFields() {
        Map<String, Object> config = SnowmanVariant.WIDE.snapshot();
        assertTrue(config.containsKey("armLength"));
        assertTrue(config.containsKey("strideLength"));
        assertTrue(config.containsKey("footSize"));
        assertEquals(0.9, config.get("speedMultiplier"));
    }

    @Test
    void playerAppearanceSelectsTheServerColliderVariant() {
        PlayerState player = new PlayerState("id", "Snow", "#69a9e8", 0, 0);
        player.setLook(new SnowmanLook("top-hat", "classic", "carrot", "twigs", "wide"));
        assertEquals(SnowmanVariant.WIDE.hitboxHeight(), player.getHitboxHeight(), 1e-9);
        assertEquals(SnowmanVariant.WIDE.hitboxRadius(), player.getHitboxRadius(), 1e-9);
    }
}
