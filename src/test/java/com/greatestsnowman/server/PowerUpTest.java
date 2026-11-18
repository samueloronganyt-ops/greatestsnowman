package com.greatestsnowman.server;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class PowerUpTest {
    @Test
    void eachPickupSubtypeAppliesItsOwnEffect() {
        PlayerState player = new PlayerState("player", "Player", "#ffffff", 0, 0);
        assertFalse(player.takeDamage(60));
        assertEquals(40, player.getHealth());

        PowerUp speed = PowerUp.create("SPEED", 1, 2);
        PowerUp strong = PowerUp.create("STRONG", 2, 3);
        PowerUp shield = PowerUp.create("SHIELD", 3, 4);
        PowerUp heal = PowerUp.create("HEAL", 4, 5);
        PowerUp extraLife = PowerUp.create("EXTRA_LIFE", 5, 6);
        for (PowerUp powerUp : new PowerUp[]{speed, strong, shield, heal, extraLife}) powerUp.applyTo(player);

        assertEquals("SPEED", speed.snapshot().get("type"));
        assertEquals("STRONG", strong.snapshot().get("type"));
        assertEquals("SHIELD", shield.snapshot().get("type"));
        assertEquals("HEAL", heal.snapshot().get("type"));
        assertEquals("EXTRA_LIFE", extraLife.snapshot().get("type"));
        assertEquals(85, player.getHealth());
        assertEquals(1.5, player.getDamageMultiplier());
        Map<String, Object> status = player.powerUpSnapshot();
        assertTrue(((Number) status.get("speed")).doubleValue() > 0);
        assertTrue(((Number) status.get("strong")).doubleValue() > 0);
        assertTrue(((Number) status.get("shield")).doubleValue() > 0);
        assertEquals(1, status.get("extraLives"));
        assertThrows(IllegalArgumentException.class, () -> PowerUp.create("UNKNOWN", 0, 0));
    }
}
