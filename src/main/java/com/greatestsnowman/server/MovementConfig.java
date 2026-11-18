package com.greatestsnowman.server;

import java.util.Map;

/** Canonical movement tuning shared with clients through each room snapshot. */
public final class MovementConfig {
    public static final double BASE_SPEED = 6.0;
    public static final long DASH_DURATION_MILLIS = 250;
    public static final long DASH_COOLDOWN_MILLIS = 2500;
    public static final double DASH_SPEED_MULTIPLIER = 3.0;
    public static final double CROUCH_SPEED_MULTIPLIER = 0.55;
    public static final double STANDING_HEIGHT = 3.4;
    public static final double CROUCHING_HEIGHT = STANDING_HEIGHT * 0.60;
    public static final double STANDING_RADIUS = 0.82;
    public static final double CROUCHING_RADIUS = 0.74;
    public static final double STANDING_ACCURACY_RADIANS = 0.045;
    public static final double CROUCHING_ACCURACY_RADIANS = 0.026;
    public static final double STANDING_THROW_HEIGHT = 2.54;
    public static final double CROUCHING_THROW_HEIGHT = 1.55;
    public static final double QUICK_THROW_WINDUP_SECONDS = 0.16;
    public static final double CHARGED_THROW_WINDUP_SECONDS = 0.32;

    private MovementConfig() { }

    /** Values serialized to browsers, avoiding a second independent client tuning table. */
    public static Map<String, Object> snapshot() {
        return Map.ofEntries(
                Map.entry("baseSpeed", BASE_SPEED),
                Map.entry("dashDurationSeconds", DASH_DURATION_MILLIS / 1000.0),
                Map.entry("dashCooldownSeconds", DASH_COOLDOWN_MILLIS / 1000.0),
                Map.entry("dashSpeedMultiplier", DASH_SPEED_MULTIPLIER),
                Map.entry("variants", Map.of(
                        "classic", SnowmanVariant.CLASSIC.snapshot(),
                        "tall", SnowmanVariant.TALL.snapshot(),
                        "wide", SnowmanVariant.WIDE.snapshot())),
                Map.entry("states", Map.of(
                        "STANDING", state(STANDING_HEIGHT, STANDING_RADIUS, 1.0,
                                STANDING_ACCURACY_RADIANS, STANDING_THROW_HEIGHT),
                        "CROUCHING", state(CROUCHING_HEIGHT, CROUCHING_RADIUS,
                                CROUCH_SPEED_MULTIPLIER, CROUCHING_ACCURACY_RADIANS, CROUCHING_THROW_HEIGHT),
                        "DASHING", state(STANDING_HEIGHT, STANDING_RADIUS,
                                DASH_SPEED_MULTIPLIER, STANDING_ACCURACY_RADIANS, STANDING_THROW_HEIGHT))));
    }

    private static Map<String, Object> state(double height, double radius, double speed,
                                             double accuracyRadians, double throwHeight) {
        return Map.of("height", height, "radius", radius, "speedMultiplier", speed,
                "accuracyRadians", accuracyRadians, "throwHeight", throwHeight);
    }
}
