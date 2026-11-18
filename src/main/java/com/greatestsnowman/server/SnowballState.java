package com.greatestsnowman.server;

import java.util.Map;
import java.util.UUID;

/** Server-owned snowball projectile. Clients only receive its snapshots. */
public final class SnowballState {
    private final String id = UUID.randomUUID().toString();
    private final String ownerId;
    private final boolean critical;
    private final double damage;
    private final double hitRadius;
    private final double blastRadius;
    private double x;
    private double y;
    private double z;
    private final double originHeight;
    private double startX;
    private double startY;
    private double startZ;
    private double previousX;
    private double previousY;
    private double previousZ;
    private double velocityX;
    private double velocityY;
    private double velocityZ;
    private double ageSeconds;
    private double launchDelayRemaining;
    private boolean launched;
    private boolean launchEventPending;
    private double maxTravel;
    private double traveled;
    private boolean reachedTarget;
    private int bouncesLeft = 3;
    private boolean removed;

    public SnowballState(String ownerId, double x, double z, double yaw, double chargeSeconds) {
        this(ownerId, x, z, yaw, chargeSeconds, 36.0);
    }

    public SnowballState(String ownerId, double x, double z, double yaw, double chargeSeconds, double maxTravel) {
        this(ownerId, x, z, yaw, chargeSeconds, maxTravel,
                MovementConfig.STANDING_THROW_HEIGHT, 0);
    }

    public SnowballState(String ownerId, double x, double z, double yaw, double chargeSeconds,
                         double maxTravel, double originHeight, double launchDelaySeconds) {
        this.ownerId = ownerId;
        this.x = x;
        this.z = z;
        this.startX = x;
        this.startY = Math.max(0.1, originHeight);
        this.startZ = z;
        this.previousX = x;
        this.previousY = this.startY;
        this.previousZ = z;
        this.originHeight = Math.max(0.1, originHeight);
        this.y = this.originHeight;
        this.launchDelayRemaining = Math.max(0, launchDelaySeconds);
        this.launched = this.launchDelayRemaining == 0;
        this.launchEventPending = this.launched;
        this.maxTravel = Math.max(0.5, maxTravel);
        this.critical = chargeSeconds >= 1.15;
        this.damage = critical ? 52 : 26;
        this.hitRadius = critical ? 0.62 : 0.32;
        this.blastRadius = critical ? 2.45 : 0;
        double speed = critical ? 20 : 100;
        this.velocityX = Math.sin(yaw) * speed;
        this.velocityZ = Math.cos(yaw) * speed;
    }

    public SnowballState(String ownerId, double x, double z, double originHeight,
                         double yaw, double pitch, double chargeSeconds,
                         double maxTravel, double launchDelaySeconds) {
        this.ownerId = ownerId;
        this.x = x;
        this.y = Math.max(0.1, originHeight);
        this.z = z;
        this.startX = x;
        this.startY = this.y;
        this.startZ = z;
        this.previousX = x;
        this.previousY = this.y;
        this.previousZ = z;
        this.originHeight = this.y;
        this.launchDelayRemaining = Math.max(0, launchDelaySeconds);
        this.launched = this.launchDelayRemaining == 0;
        this.launchEventPending = this.launched;
        this.maxTravel = Math.max(0.5, maxTravel);
        this.critical = chargeSeconds >= 1.15;
        this.damage = critical ? 52 : 26;
        this.hitRadius = critical ? 0.62 : 0.32;
        this.blastRadius = critical ? 2.45 : 0;
        double speed = critical ? 20 : 100;
        double elevation = Math.max(-0.45, Math.min(0.45, pitch));
        this.velocityX = Math.sin(yaw) * Math.cos(elevation) * speed;
        this.velocityY = Math.sin(elevation) * speed;
        this.velocityZ = Math.cos(yaw) * Math.cos(elevation) * speed;
    }

    public String getOwnerId() { return ownerId; }
    public boolean isCritical() { return critical; }
    public double getDamage() { return damage; }
    public double getHitRadius() { return hitRadius; }
    public double getBlastRadius() { return blastRadius; }
    public double getX() { return x; }
    public double getY() { return y; }
    public double getZ() { return z; }
    public double getStartX() { return startX; }
    public double getStartY() { return startY; }
    public double getStartZ() { return startZ; }
    public double getPreviousX() { return previousX; }
    public double getPreviousY() { return previousY; }
    public double getPreviousZ() { return previousZ; }
    public double getDistanceTravelled() { return traveled; }
    public double getMaxTravel() { return maxTravel; }
    public boolean isLaunched() { return launched; }
    public boolean consumeLaunchEvent() {
        boolean pending = launchEventPending;
        launchEventPending = false;
        return pending;
    }
    public boolean isRemoved() { return removed; }
    public double getAgeSeconds() { return ageSeconds; }
    public boolean hasReachedTarget() { return reachedTarget; }

    /** Refreshes the server-derived hand origin and client look angles during wind-up. */
    public void updatePendingDirection(double handX, double handY, double handZ,
                                       double yaw, double pitch, double travelDistance) {
        if (launched || !Double.isFinite(handX) || !Double.isFinite(handY) || !Double.isFinite(handZ)
                || !Double.isFinite(yaw) || !Double.isFinite(pitch)) return;
        double safeYaw = AimResolver.wrapAngle(yaw);
        double safePitch = Math.max(-AimResolver.MAX_PITCH, Math.min(AimResolver.MAX_PITCH, pitch));
        x = startX = previousX = handX;
        y = startY = previousY = Math.max(0.1, handY);
        z = startZ = previousZ = handZ;
        maxTravel = Math.max(0.5, Math.min(AimResolver.MAX_DISTANCE, travelDistance));
        velocityX = Math.sin(safeYaw) * Math.cos(safePitch) * launchSpeed();
        velocityY = Math.sin(safePitch) * launchSpeed();
        velocityZ = Math.cos(safeYaw) * Math.cos(safePitch) * launchSpeed();
        traveled = 0;
        reachedTarget = false;
    }

    public void advance(double seconds) {
        if (removed) return;
        double activeSeconds = seconds;
        if (!launched) {
            double wait = Math.min(activeSeconds, launchDelayRemaining);
            launchDelayRemaining -= wait;
            activeSeconds -= wait;
            if (launchDelayRemaining <= 1e-8) {
                launchDelayRemaining = 0;
                launched = true;
                launchEventPending = true;
            }
        }
        if (!launched) return;
        if (activeSeconds <= 0) return;
        previousX = x;
        previousY = y;
        previousZ = z;
        double speed = Math.sqrt(velocityX * velocityX + velocityY * velocityY + velocityZ * velocityZ);
        double step = Math.min(speed * activeSeconds, Math.max(0, maxTravel - traveled));
        double ratio = speed == 0 ? 0 : step / speed;
        x += velocityX * ratio;
        y += velocityY * ratio;
        z += velocityZ * ratio;
        traveled += step;
        reachedTarget = traveled >= maxTravel;
        ageSeconds += activeSeconds;
        if (y < 0.12) { y = 0.12; velocityY = Math.abs(velocityY) * 0.48; }
        if (ageSeconds > 7.0) removed = true;
    }

    public boolean intersectsWall(Map<String, Object> wall) {
        return AimResolver.wallBlocksSegment(wall, previousX, previousY, previousZ,
                x, y, z, hitRadius);
    }

    public void bounceOff(Map<String, Object> wall, double previousX, double previousZ) {
        if (bouncesLeft <= 0) {
            removed = true;
            return;
        }
        double minX = number(wall, "x") - number(wall, "width") / 2.0 - hitRadius;
        double maxX = number(wall, "x") + number(wall, "width") / 2.0 + hitRadius;
        double minZ = number(wall, "z") - number(wall, "depth") / 2.0 - hitRadius;
        double maxZ = number(wall, "z") + number(wall, "depth") / 2.0 + hitRadius;
        double entryX = axisEntry(previousX, x - previousX, minX, maxX);
        double entryZ = axisEntry(previousZ, z - previousZ, minZ, maxZ);
        x = previousX;
        y = previousY;
        z = previousZ;
        if (entryX >= entryZ) {
            velocityX = -velocityX * 0.82;
        } else {
            velocityZ = -velocityZ * 0.82;
        }
        bouncesLeft--;
    }

    public Map<String, Object> snapshot() {
        return Map.ofEntries(Map.entry("id", id), Map.entry("ownerId", ownerId),
                Map.entry("x", x), Map.entry("y", y), Map.entry("z", z),
                Map.entry("critical", critical), Map.entry("radius", hitRadius),
                Map.entry("bouncesLeft", bouncesLeft), Map.entry("startX", startX),
                Map.entry("startY", startY), Map.entry("startZ", startZ), Map.entry("launched", launched));
    }

    public void remove() { removed = true; }

    private static double number(Map<String, Object> values, String key) {
        return ((Number) values.get(key)).doubleValue();
    }

    private double launchSpeed() { return critical ? 20 : 100; }

    private static double axisEntry(double origin, double delta, double minimum, double maximum) {
        if (Math.abs(delta) < 1e-12) return Double.NEGATIVE_INFINITY;
        return delta > 0 ? (minimum - origin) / delta : (maximum - origin) / delta;
    }
}
