package com.greatestsnowman.server;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class CombatAndScoringTest {
    @Test
    void normalAndCriticalSnowballsUseTheDocumentedDamageAndChargeThreshold() {
        SnowballState normal = new SnowballState("player", 0, 0, 0, 1.14);
        SnowballState critical = new SnowballState("player", 0, 0, 0, 1.15);
        assertFalse(normal.isCritical());
        assertEquals(26, normal.getDamage());
        assertTrue(critical.isCritical());
        assertEquals(52, critical.getDamage());
        assertEquals(2.45, critical.getBlastRadius());

        PlayerState target = new PlayerState("target", "Target", "#ffffff", 0, 0);
        assertFalse(target.takeDamage(normal.getDamage()));
        assertEquals(74, target.getHealth());
        assertFalse(target.takeDamage(critical.getDamage()));
        assertEquals(22, target.getHealth());
        assertTrue(target.takeDamage(critical.getDamage()));
        assertEquals(0, target.getHealth());
    }

    @Test
    void reachingRoomScoreGoalCreatesResultsAndRestartResetsTheRoom() {
        GameRoom room = new GameRoom("TEST1", "host", 2, 2, "SMALL");
        PlayerState host = new PlayerState("host", "Host", "#69a9e8", 0, 0);
        PlayerState guest = new PlayerState("guest", "Guest", "#e87979", 0, 0);
        room.addPlayer(host);
        room.addPlayer(guest);
        room.start();
        assertEquals(5, ((List<?>) room.snapshot(false).get("powerUps")).size());

        host.addScore();
        assertEquals("IN_GAME", room.getStatus());
        host.addScore();
        room.tick(1.0 / 30.0);
        assertEquals("RESULTS", room.getStatus());
        assertEquals("host", room.getWinnerId());

        room.restart();
        assertEquals("IN_GAME", room.getStatus());
        assertEquals(0, host.getScore());
        assertNull(room.getWinnerId());
        room.backToLobby();
        assertEquals("LOBBY", room.getStatus());
    }

    @Test
    void aKnockoutAwardsExactlyOnePointToTheThrower() throws InterruptedException {
        GameRoom room = new GameRoom("TEST2", "host", 2, 50, "LARGE");
        PlayerState host = new PlayerState("host", "Host", "#69a9e8", 0, 0);
        PlayerState guest = new PlayerState("guest", "Guest", "#e87979", 0, 0);
        room.addPlayer(host);
        room.addPlayer(guest);
        room.start();

        double[] positions = findPickupSafeTargetPositions(room);
        host.setSpawn(positions[0], positions[1]);
        guest.setSpawn(positions[2], positions[3]);
        host.setInput(0, 0, 0);
        guest.setInput(0, 0, Math.PI);
        host.activateStrongThrows();
        Thread.sleep(1250); // Wait for the short spawn protection before testing a hit.

        for (int shot = 0; shot < 3 && guest.isAlive(); shot++) {
            room.throwSnowball("host");
            for (int tick = 0; tick < 8 && guest.isAlive(); tick++) room.tick(1.0 / 30.0);
            if (guest.isAlive()) Thread.sleep(330); // Respect the server's throw cooldown.
        }
        assertFalse(guest.isAlive(), "Three boosted normal hits should knock out the guest.");
        assertEquals(1, host.getScore(), "A knockout awards one point, regardless of the hit count.");
    }

    private double[] findPickupSafeTargetPositions(GameRoom room) {
        CollisionSystem collisions = new CollisionSystem();
        List<?> pickups = (List<?>) room.snapshot(false).get("powerUps");
        for (double x = -8; x <= 8; x += 1.0) {
            for (double z = -8; z <= 5; z += 1.0) {
                double targetZ = z + 3;
                if (collisions.playerBlocked(room.getArena(), x, z, 1)
                        || collisions.playerBlocked(room.getArena(), x, targetZ, 1)) continue;
                double shooterX = x;
                double shooterZ = z;
                boolean nearPickup = false;
                for (Object item : pickups) {
                    Map<?, ?> pickup = (Map<?, ?>) item;
                    double pickupX = ((Number) pickup.get("x")).doubleValue();
                    double pickupZ = ((Number) pickup.get("z")).doubleValue();
                    if (Math.hypot(pickupX - shooterX, pickupZ - shooterZ) < 3.5
                            || Math.hypot(pickupX - shooterX, pickupZ - targetZ) < 3.5) {
                        nearPickup = true;
                        break;
                    }
                }
                if (!nearPickup) return new double[]{x, z, x, targetZ};
            }
        }
        throw new AssertionError("Could not find a pickup-free shot lane for this test.");
    }
}
