package com.greatestsnowman.server;

import java.util.Map;

/** Shared Java-side aiming math and segment checks for throws. */
public final class AimResolver {
    public static final double MAX_DISTANCE = 60.0;
    public static final double MIN_DISTANCE = 1.5;
    public static final double MAX_PITCH = 0.45;

    private AimResolver() { }

    public record Direction(double yaw, double pitch, double distance,
                            double x, double y, double z) { }

    public static double angleDiff(double from, double to) {
        return Math.atan2(Math.sin(to - from), Math.cos(to - from));
    }

    public static double lerpAngle(double from, double to, double amount) {
        double bounded = Math.max(0, Math.min(1, amount));
        return wrapAngle(from + angleDiff(from, to) * bounded);
    }

    public static double wrapAngle(double angle) {
        return Math.atan2(Math.sin(angle), Math.cos(angle));
    }

    public static boolean canHitPlayer(String projectileOwnerId, String targetPlayerId) {
        return projectileOwnerId != null && targetPlayerId != null
                && !projectileOwnerId.equals(targetPlayerId);
    }

    /** Resolve +Z-forward yaw/pitch from the authoritative hand to a bounded target. */
    public static Direction resolve(double originX, double originY, double originZ,
                                    double targetX, double targetY, double targetZ,
                                    double fallbackYaw) {
        double dx = targetX - originX;
        double dy = targetY - originY;
        double dz = targetZ - originZ;
        double horizontal = Math.hypot(dx, dz);
        double distance = Math.hypot(horizontal, dy);
        if (!Double.isFinite(distance) || distance < MIN_DISTANCE) {
            double safeYaw = Double.isFinite(fallbackYaw) ? wrapAngle(fallbackYaw) : 0;
            return new Direction(safeYaw, 0, MAX_DISTANCE,
                    Math.sin(safeYaw), 0, Math.cos(safeYaw));
        }
        double yaw = wrapAngle(Math.atan2(dx, dz));
        double pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, Math.atan2(dy, horizontal)));
        double cosPitch = Math.cos(pitch);
        return new Direction(yaw, pitch, Math.min(MAX_DISTANCE, distance),
                Math.sin(yaw) * cosPitch, Math.sin(pitch), Math.cos(yaw) * cosPitch);
    }

    /** True when a hand-to-target segment intersects a wall expanded by the projectile radius. */
    public static boolean wallBlocksSegment(Map<String, Object> wall,
                                            double fromX, double fromY, double fromZ,
                                            double toX, double toY, double toZ,
                                            double radius) {
        double centerX = number(wall, "x");
        double centerZ = number(wall, "z");
        double minX = centerX - number(wall, "width") / 2.0 - radius;
        double maxX = centerX + number(wall, "width") / 2.0 + radius;
        double minZ = centerZ - number(wall, "depth") / 2.0 - radius;
        double maxZ = centerZ + number(wall, "depth") / 2.0 + radius;
        double maxY = number(wall, "height") + radius;
        double[] interval = {0, 1};
        return intersectAxis(fromX, toX - fromX, minX, maxX, interval)
                && intersectAxis(fromZ, toZ - fromZ, minZ, maxZ, interval)
                && intersectAxis(fromY, toY - fromY, -radius, maxY, interval)
                && interval[1] >= interval[0] && interval[1] >= 0 && interval[0] <= 1;
    }

    private static boolean intersectAxis(double origin, double delta, double minimum,
                                         double maximum, double[] interval) {
        if (Math.abs(delta) < 1e-12) return origin >= minimum && origin <= maximum;
        double first = (minimum - origin) / delta;
        double second = (maximum - origin) / delta;
        if (first > second) { double swap = first; first = second; second = swap; }
        interval[0] = Math.max(interval[0], first);
        interval[1] = Math.min(interval[1], second);
        return interval[0] <= interval[1];
    }

    private static double number(Map<String, Object> values, String key) {
        Object value = values.get(key);
        return value instanceof Number number ? number.doubleValue() : 0;
    }
}
