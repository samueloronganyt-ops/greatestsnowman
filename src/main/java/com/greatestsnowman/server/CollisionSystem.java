package com.greatestsnowman.server;

import java.util.Map;

/** Shared circle-versus-wall checks for player movement and snowball ricochets. */
public final class CollisionSystem {
    public boolean playerBlocked(ArenaMap arena, double x, double z, double radius) {
        for (Map<String, Object> wall : arena.getWalls()) {
            double centerX = number(wall, "x");
            double centerZ = number(wall, "z");
            double halfWidth = number(wall, "width") / 2.0;
            double halfDepth = number(wall, "depth") / 2.0;
            double closestX = Math.max(centerX - halfWidth, Math.min(x, centerX + halfWidth));
            double closestZ = Math.max(centerZ - halfDepth, Math.min(z, centerZ + halfDepth));
            if (Math.hypot(x - closestX, z - closestZ) < radius) return true;
        }
        return false;
    }

    /** Server-owned stance hitboxes use their configured horizontal radius. */
    public boolean playerBlocked(ArenaMap arena, double x, double z,
                                 double radius, double hitboxHeight) {
        return playerBlocked(arena, x, z, radius);
    }

    /** Rejects a rise when a low overhead obstruction occupies the player's current footprint. */
    public boolean canStandUp(ArenaMap arena, double x, double z, double radius,
                              double currentHeight, double standingHeight) {
        for (Map<String, Object> wall : arena.getWalls()) {
            double wallHeight = number(wall, "height");
            if (wallHeight <= currentHeight || wallHeight >= standingHeight) continue;
            double centerX = number(wall, "x");
            double centerZ = number(wall, "z");
            double halfWidth = number(wall, "width") / 2.0;
            double halfDepth = number(wall, "depth") / 2.0;
            double closestX = Math.max(centerX - halfWidth, Math.min(x, centerX + halfWidth));
            double closestZ = Math.max(centerZ - halfDepth, Math.min(z, centerZ + halfDepth));
            if (Math.hypot(x - closestX, z - closestZ) < radius + 0.42) return false;
        }
        return true;
    }

    public boolean bounceSnowball(ArenaMap arena, SnowballState snowball,
                                  double previousX, double previousZ) {
        for (Map<String, Object> wall : arena.getWalls()) {
            if (!snowball.intersectsWall(wall)) continue;
            snowball.bounceOff(wall, previousX, previousZ);
            return true;
        }
        return false;
    }

    private static double number(Map<String, Object> values, String key) {
        return ((Number) values.get(key)).doubleValue();
    }

}
