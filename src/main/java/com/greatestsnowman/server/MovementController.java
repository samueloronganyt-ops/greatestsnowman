package com.greatestsnowman.server;

/** Validates crouch, dash, cooldown, and stand-up clearance for one player. */
public final class MovementController {
    private MovementState state = MovementState.STANDING;
    private MovementState stanceBeforeDash = MovementState.STANDING;
    private SnowmanVariant variant = SnowmanVariant.CLASSIC;
    private double dashDirectionX;
    private double dashDirectionZ = 1.0;
    private boolean crouchRequested;
    private boolean dashRequested;
    private boolean previousDashRequested;
    private boolean dashStarted;
    private boolean stanceChanged;
    private long dashUntilMillis;
    private long dashCooldownUntilMillis;

    public MovementState getState() { return state; }
    public MovementState getStanceState() { return currentStance(); }
    public void setVariant(SnowmanVariant variant) { this.variant = variant == null ? SnowmanVariant.CLASSIC : variant; }

    public void setRequests(boolean crouch, boolean dash) {
        crouchRequested = crouch;
        dashRequested = dash;
    }

    public boolean tick(long now, double x, double z, double moveX, double moveZ,
                        double yaw, ArenaMap arena, CollisionSystem collisions) {
        dashStarted = false;
        stanceChanged = false;

        boolean dashEdge = dashRequested && !previousDashRequested;
        previousDashRequested = dashRequested;

        if (state == MovementState.DASHING && now >= dashUntilMillis) {
            setState(stanceBeforeDash);
        }

        if (state != MovementState.DASHING) {
            MovementState desired = crouchRequested ? MovementState.CROUCHING : MovementState.STANDING;
            if (desired != state) {
                if (desired != MovementState.STANDING) {
                    setState(desired);
                } else if (state != MovementState.STANDING) {
                    if (collisions.canStandUp(arena, x, z, getHitboxRadius(),
                            getHitboxHeight(now), variant.hitboxHeight())) {
                        setState(MovementState.STANDING);
                    }
                } else {
                    setState(MovementState.STANDING);
                }
            }
        }

        if (dashEdge && now >= dashCooldownUntilMillis && state != MovementState.DASHING
                ) {
            stanceBeforeDash = crouchRequested ? MovementState.CROUCHING : state;
            double forwardX = Math.sin(yaw), forwardZ = Math.cos(yaw);
            double worldX = -moveX * Math.cos(yaw) + moveZ * Math.sin(yaw);
            double worldZ = moveX * Math.sin(yaw) + moveZ * Math.cos(yaw);
            double length = Math.hypot(worldX, worldZ);
            if (length < 1e-5) { worldX = forwardX; worldZ = forwardZ; length = 1.0; }
            dashDirectionX = worldX / length;
            dashDirectionZ = worldZ / length;
            setState(MovementState.DASHING);
            dashUntilMillis = now + MovementConfig.DASH_DURATION_MILLIS;
            dashCooldownUntilMillis = now + MovementConfig.DASH_COOLDOWN_MILLIS;
            dashStarted = true;
        }
        return consumeDashStarted();
    }

    public boolean consumeDashStarted() {
        boolean started = dashStarted;
        dashStarted = false;
        return started;
    }

    public boolean consumeStanceChanged() {
        boolean changed = stanceChanged;
        stanceChanged = false;
        return changed;
    }

    public double getSpeedMultiplier(long now) {
        if (state == MovementState.DASHING) return MovementConfig.DASH_SPEED_MULTIPLIER * variant.speedMultiplier();
        return state.speedMultiplier() * variant.speedMultiplier();
    }

    public double getHitboxHeight(long now) {
        return variant.hitboxHeight() * currentStance().hitboxHeight() / MovementConfig.STANDING_HEIGHT;
    }

    public double getHitboxRadius() { return variant.hitboxRadius() * currentStance().hitboxRadius() / MovementConfig.STANDING_RADIUS; }
    public double getAccuracyRadians() { return currentStance().accuracyRadians(); }
    public double getThrowHeight() { return variant.hitboxHeight() * currentStance().throwHeight() / MovementConfig.STANDING_HEIGHT; }
    public double getDashCooldownSeconds(long now) {
        return Math.max(0, dashCooldownUntilMillis - now) / 1000.0;
    }
    public double getDashDirectionX() { return dashDirectionX; }
    public double getDashDirectionZ() { return dashDirectionZ; }

    public void stopDash() {
        if (state == MovementState.DASHING) {
            setState(stanceBeforeDash);
            dashUntilMillis = 0;
        }
    }

    public void reset(long now) {
        state = MovementState.STANDING;
        stanceBeforeDash = MovementState.STANDING;
        variant = SnowmanVariant.CLASSIC;
        dashDirectionX = 0;
        dashDirectionZ = 1;
        crouchRequested = dashRequested = previousDashRequested = false;
        dashStarted = stanceChanged = false;
        dashUntilMillis = 0;
        dashCooldownUntilMillis = now;
    }

    private MovementState currentStance() {
        return state == MovementState.DASHING ? stanceBeforeDash : state;
    }

    private void setState(MovementState next) {
        if (state != next) {
            state = next;
            stanceChanged = true;
        }
    }
}
