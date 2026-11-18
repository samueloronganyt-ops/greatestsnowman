package com.greatestsnowman.server;

import com.greatestsnowman.account.SnowmanLook;

import java.util.Map;

/** Server-owned player movement, health, throw charge, and knockout state. */
public final class PlayerState {
    private static final double MAX_HEALTH = 100;
    private static final long RESPAWN_MILLIS = 2600;
    private final String id;
    private final MovementController movement = new MovementController();
    private String name;
    private String color;
    private SnowmanLook look = SnowmanLook.defaults();
    private double x;
    private double z;
    private double spawnX;
    private double spawnZ;
    private double yaw;
    private double moveYaw;
    private double aimYaw;
    private double aimPitch;
    private boolean aiming;
    private boolean aimInputAvailable;
    private double moveX;
    private double moveZ;
    private double health = MAX_HEALTH;
    private int score;
    private long lastInputAt;
    private long chargeStartedAt;
    private boolean chargeCancelledByDash;
    private long nextThrowAt;
    private long respawnAt;
    private long invulnerableUntil;
    private long speedUntil;
    private long strongUntil;
    private long shieldUntil;
    private int extraLives;

    public PlayerState(String id, String name, String color, double x, double z) {
        this.id = id;
        this.name = name;
        this.color = color;
        this.x = x;
        this.z = z;
        this.spawnX = x;
        this.spawnZ = z;
        this.lastInputAt = System.currentTimeMillis();
    }

    public String getId() { return id; }
    public synchronized String getName() { return name; }
    public String getColor() { return color; }
    public synchronized SnowmanLook getLook() { return look; }
    public synchronized double getX() { return x; }
    public synchronized double getZ() { return z; }
    public synchronized double getYaw() { return yaw; }
    public synchronized double getMoveYaw() { return moveYaw; }
    public synchronized double getAimYaw() { return aimYaw; }
    public synchronized double getAimPitch() { return aimPitch; }
    public synchronized boolean isAiming() { return aiming; }
    public synchronized boolean hasAimInput() { return aimInputAvailable; }
    public synchronized double getHealth() { return health; }
    public synchronized int getScore() { return score; }
    public synchronized boolean isCharging() { return chargeStartedAt > 0; }
    public synchronized boolean isAlive() { return health > 0; }
    public synchronized boolean isInvulnerable() { return System.currentTimeMillis() < invulnerableUntil; }
    public synchronized MovementState getMovementState() { return movement.getState(); }
    public synchronized MovementState getStanceState() { return movement.getStanceState(); }
    public synchronized double getDashCooldownSeconds() {
        return movement.getDashCooldownSeconds(System.currentTimeMillis());
    }
    public synchronized double getHitboxHeight() { return movement.getHitboxHeight(System.currentTimeMillis()); }
    public synchronized double getHitboxRadius() { return movement.getHitboxRadius(); }
    public synchronized double getAccuracyRadians() { return movement.getAccuracyRadians(); }
    public synchronized double getThrowHeight() { return movement.getThrowHeight(); }
    public synchronized SnowmanVariant getVariant() { return SnowmanVariant.fromKey(look.body()); }
    public synchronized double getDashDirectionX() { return movement.getDashDirectionX(); }
    public synchronized double getDashDirectionZ() { return movement.getDashDirectionZ(); }

    public synchronized boolean intersects(SnowballState snowball) {
        double fromX = snowball.getPreviousX();
        double fromY = snowball.getPreviousY();
        double fromZ = snowball.getPreviousZ();
        double deltaX = snowball.getX() - fromX;
        double deltaY = snowball.getY() - fromY;
        double deltaZ = snowball.getZ() - fromZ;
        double horizontalLengthSquared = deltaX * deltaX + deltaZ * deltaZ;
        double along = horizontalLengthSquared < 1e-12 ? 0
                : Math.max(0, Math.min(1, ((x - fromX) * deltaX + (z - fromZ) * deltaZ)
                / horizontalLengthSquared));
        double closestX = fromX + deltaX * along;
        double closestY = fromY + deltaY * along;
        double closestZ = fromZ + deltaZ * along;
        double distance = Math.hypot(x - closestX, z - closestZ);
        double horizontalRadius = movement.getHitboxRadius();
        boolean withinHeight = closestY <= movement.getHitboxHeight(System.currentTimeMillis())
                + snowball.getHitRadius();
        return withinHeight && closestY >= -snowball.getHitRadius()
                && distance <= horizontalRadius + snowball.getHitRadius();
    }

    public synchronized double getThrowWindupSeconds(boolean critical) {
        double windup = critical ? MovementConfig.CHARGED_THROW_WINDUP_SECONDS
                : MovementConfig.QUICK_THROW_WINDUP_SECONDS;
        return windup;
    }

    public synchronized void activateSpeedBoost() { speedUntil = System.currentTimeMillis() + 8000; }
    public synchronized void activateStrongThrows() { strongUntil = System.currentTimeMillis() + 8000; }
    public synchronized void activateShield() { shieldUntil = System.currentTimeMillis() + 8000; }
    public synchronized void heal(double amount) { health = Math.min(MAX_HEALTH, health + Math.max(0, amount)); }
    public synchronized void grantExtraLife() { extraLives = Math.min(1, extraLives + 1); }

    public synchronized double getDamageMultiplier() {
        return System.currentTimeMillis() < strongUntil ? 1.5 : 1.0;
    }

    public synchronized Map<String, Object> powerUpSnapshot() {
        long now = System.currentTimeMillis();
        return Map.of("speed", Math.max(0, (speedUntil - now) / 1000.0),
                "strong", Math.max(0, (strongUntil - now) / 1000.0),
                "shield", Math.max(0, (shieldUntil - now) / 1000.0),
                "extraLives", extraLives);
    }

    public synchronized double getChargeRatio() {
        if (chargeStartedAt == 0) return 0;
        return Math.min(1, (System.currentTimeMillis() - chargeStartedAt) / 1250.0);
    }

    public synchronized double getRespawnSeconds() {
        if (health > 0) return 0;
        return Math.max(0, (respawnAt - System.currentTimeMillis()) / 1000.0);
    }

    public synchronized void setName(String name) { this.name = name; }
    public synchronized void setColor(String color) { this.color = color; }
    public synchronized void setLook(SnowmanLook look) {
        this.look = look == null ? SnowmanLook.defaults() : look;
        movement.setVariant(SnowmanVariant.fromKey(this.look.body()));
    }

    public synchronized void setSpawn(double x, double z) {
        this.spawnX = x;
        this.spawnZ = z;
        this.x = x;
        this.z = z;
    }

    /** Store bounded client intent; the server remains responsible for all motion. */
    public synchronized void setInput(double moveX, double moveZ, double yaw) {
        setInput(moveX, moveZ, yaw, false, false);
        aimInputAvailable = false;
    }

    /** Client sends requested stance controls; MovementController validates every transition. */
    public synchronized void setInput(double moveX, double moveZ, double yaw,
                                      boolean crouch, boolean dash) {
        setInput(moveX, moveZ, yaw, yaw, yaw, 0, false, crouch, dash);
        aimInputAvailable = false;
    }

    /** Movement heading, body heading, and look angles stay separate for TPS strafing. */
    public synchronized void setInput(double moveX, double moveZ, double moveYaw,
                                      double bodyYaw, double lookYaw, double lookPitch,
                                      boolean aiming, boolean crouch, boolean dash) {
        this.moveX = clamp(moveX, -1, 1);
        this.moveZ = clamp(moveZ, -1, 1);
        movement.setRequests(crouch, dash);
        if (Double.isFinite(moveYaw)) this.moveYaw = Math.IEEEremainder(moveYaw, Math.PI * 2);
        if (Double.isFinite(bodyYaw)) this.yaw = Math.IEEEremainder(bodyYaw, Math.PI * 2);
        if (Double.isFinite(lookYaw)) this.aimYaw = Math.IEEEremainder(lookYaw, Math.PI * 2);
        if (Double.isFinite(lookPitch)) this.aimPitch = clamp(lookPitch, -AimResolver.MAX_PITCH, AimResolver.MAX_PITCH);
        this.aiming = aiming;
        this.aimInputAvailable = true;
        this.lastInputAt = System.currentTimeMillis();
    }

    /** Update only the release-frame aim; movement and stance remain server-owned. */
    public synchronized void updateAimAngles(double lookYaw, double lookPitch) {
        if (Double.isFinite(lookYaw)) this.aimYaw = Math.IEEEremainder(lookYaw, Math.PI * 2);
        if (Double.isFinite(lookPitch)) {
            this.aimPitch = clamp(lookPitch, -AimResolver.MAX_PITCH, AimResolver.MAX_PITCH);
        }
        this.aimInputAvailable = true;
        this.lastInputAt = System.currentTimeMillis();
    }

    public synchronized boolean startCharge() {
        if (health > 0 && movement.getState() != MovementState.DASHING
                && chargeStartedAt == 0 && System.currentTimeMillis() >= nextThrowAt) {
            chargeStartedAt = System.currentTimeMillis();
            chargeCancelledByDash = false;
            return true;
        }
        return false;
    }

    /** End charge and return its server-measured hold duration, or -1 when rate limited. */
    public synchronized double releaseCharge() {
        long now = System.currentTimeMillis();
        if (chargeCancelledByDash) return -1;
        if (health <= 0 || movement.getState() == MovementState.DASHING
                || now < nextThrowAt) {
            if (movement.getState() == MovementState.DASHING
                    && chargeStartedAt > 0) chargeCancelledByDash = true;
            chargeStartedAt = 0;
            return -1;
        }
        double chargeSeconds = chargeStartedAt == 0 ? 0
                : Math.min(1.5, (now - chargeStartedAt) / 1000.0);
        chargeStartedAt = 0;
        nextThrowAt = now + 320;
        return chargeSeconds;
    }

    public synchronized void addScore() { score++; }

    public synchronized void resetForMatch() {
        score = 0;
        health = MAX_HEALTH;
        chargeStartedAt = 0;
        chargeCancelledByDash = false;
        respawnAt = 0;
        speedUntil = strongUntil = shieldUntil = 0;
        extraLives = 0;
        moveX = moveZ = 0;
        movement.reset(System.currentTimeMillis());
        x = spawnX;
        z = spawnZ;
        invulnerableUntil = System.currentTimeMillis() + 1200;
    }

    /** Apply authoritative damage; true means the hit caused a knockout. */
    public synchronized boolean takeDamage(double amount) {
        if (health <= 0 || isInvulnerable()) return false;
        if (System.currentTimeMillis() < shieldUntil) return false;
        health = Math.max(0, health - Math.max(0, amount));
        if (health > 0) return false;
        respawnAt = System.currentTimeMillis() + RESPAWN_MILLIS;
        chargeStartedAt = 0;
        moveX = 0;
        moveZ = 0;
        movement.reset(System.currentTimeMillis());
        return true;
    }

    public synchronized boolean tick(double seconds, ArenaMap arena, CollisionSystem collisions) {
        long now = System.currentTimeMillis();
        if (health <= 0) {
            if (now >= respawnAt) {
                health = extraLives > 0 ? 45 : MAX_HEALTH;
                if (extraLives > 0) extraLives--;
                x = spawnX;
                z = spawnZ;
                invulnerableUntil = now + 1000;
                lastInputAt = now;
            }
            return false;
        }
        if (now - lastInputAt > 500) {
            moveX = 0;
            moveZ = 0;
        }
        double length = Math.hypot(moveX, moveZ);
        if (length > 1.0) { moveX /= length; moveZ /= length; }
        boolean dashStarted = movement.tick(now, x, z, moveX, moveZ, moveYaw, arena, collisions);
        if (dashStarted && chargeStartedAt > 0) {
            chargeStartedAt = 0;
            chargeCancelledByDash = true;
        }
        double speed = chargeStartedAt == 0 ? 6.0 : 3.4;
        if (now < speedUntil) speed *= 1.45;
        speed *= movement.getSpeedMultiplier(now);
        // Charging slows movement while the same server-owned tick still resolves motion and walls.
        // moveYaw is the camera's forward heading from +Z. With the rear camera at yaw zero,
        // screen-right points toward world -X, so positive moveX must use this basis.
        double worldX = -moveX * Math.cos(moveYaw) + moveZ * Math.sin(moveYaw);
        double worldZ = moveX * Math.sin(moveYaw) + moveZ * Math.cos(moveYaw);
        if (movement.getState() == MovementState.DASHING) {
            worldX = movement.getDashDirectionX();
            worldZ = movement.getDashDirectionZ();
        }
        double limitX = arena.getWorldWidth() / 2.0 - 3.0;
        double limitZ = arena.getWorldDepth() / 2.0 - 3.0;
        double nextX = clamp(x + worldX * speed * seconds, -limitX, limitX);
        double nextZ = clamp(z + worldZ * speed * seconds, -limitZ, limitZ);
        double radius = movement.getHitboxRadius();
        double height = movement.getHitboxHeight(now);
        if (movement.getState() == MovementState.DASHING) {
            double distance = Math.hypot(nextX - x, nextZ - z);
            int steps = Math.max(1, (int) Math.ceil(distance / 0.20));
            double safeFraction = 0;
            for (int step = 1; step <= steps; step++) {
                double fraction = step / (double) steps;
                double sampleX = x + (nextX - x) * fraction;
                double sampleZ = z + (nextZ - z) * fraction;
                if (collisions.playerBlocked(arena, sampleX, sampleZ, radius, height)) {
                    x += (nextX - x) * safeFraction;
                    z += (nextZ - z) * safeFraction;
                    movement.stopDash();
                    return dashStarted;
                }
                safeFraction = fraction;
            }
            x = nextX;
            z = nextZ;
            return dashStarted;
        }
        boolean blockedX = collisions.playerBlocked(arena, nextX, z, radius, height);
        boolean blockedZ = collisions.playerBlocked(arena, x, nextZ, radius, height);
        if (!blockedX) x = nextX;
        if (!blockedZ) z = nextZ;
        return dashStarted;
    }

    private static double clamp(double value, double min, double max) {
        if (!Double.isFinite(value)) return 0;
        return Math.max(min, Math.min(max, value));
    }
}
