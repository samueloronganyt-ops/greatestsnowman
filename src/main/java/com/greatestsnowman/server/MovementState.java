package com.greatestsnowman.server;

/** Server-authoritative player movement/stance states. */
public enum MovementState {
    STANDING(1.0, MovementConfig.STANDING_HEIGHT, MovementConfig.STANDING_RADIUS,
            MovementConfig.STANDING_ACCURACY_RADIANS, MovementConfig.STANDING_THROW_HEIGHT),
    CROUCHING(MovementConfig.CROUCH_SPEED_MULTIPLIER, MovementConfig.CROUCHING_HEIGHT,
            MovementConfig.CROUCHING_RADIUS, MovementConfig.CROUCHING_ACCURACY_RADIANS,
            MovementConfig.CROUCHING_THROW_HEIGHT),
    DASHING(MovementConfig.DASH_SPEED_MULTIPLIER, MovementConfig.STANDING_HEIGHT,
            MovementConfig.STANDING_RADIUS, MovementConfig.STANDING_ACCURACY_RADIANS,
            MovementConfig.STANDING_THROW_HEIGHT);

    private final double speedMultiplier;
    private final double hitboxHeight;
    private final double hitboxRadius;
    private final double accuracyRadians;
    private final double throwHeight;

    MovementState(double speedMultiplier, double hitboxHeight, double hitboxRadius,
                  double accuracyRadians, double throwHeight) {
        this.speedMultiplier = speedMultiplier;
        this.hitboxHeight = hitboxHeight;
        this.hitboxRadius = hitboxRadius;
        this.accuracyRadians = accuracyRadians;
        this.throwHeight = throwHeight;
    }

    // POLYMORPHISM: each enum state supplies its own movement and combat profile.
    public double speedMultiplier() { return speedMultiplier; }
    public double hitboxHeight() { return hitboxHeight; }
    public double hitboxRadius() { return hitboxRadius; }
    public double accuracyRadians() { return accuracyRadians; }
    public double throwHeight() { return throwHeight; }
    public boolean isStance() { return this != DASHING; }
}
