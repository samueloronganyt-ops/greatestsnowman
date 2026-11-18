package com.greatestsnowman.server;

import java.util.Map;

/** Variant proportions and collider dimensions used by both rig and server. */
public enum SnowmanVariant {
    CLASSIC("classic", 1.00, 0.72, 0.50, 0.88, 0.30, 1.20, 1.00, 0.070, 0.25, 1.000, 0.82, 4.13, 1.00),
    TALL("tall", 0.85, 0.65, 0.45, 1.04, 0.27, 1.38, 0.88, 0.055, 0.21, 1.425, 0.77, 5.16, 0.95),
    WIDE("wide", 1.20, 0.80, 0.52, 0.72, 0.34, 0.91, 1.18, 0.115, 0.30, 0.790, 0.98, 3.72, 0.90);

    private final String key;
    private final double baseRadius, torsoRadius, headRadius, armLength, armRestAngle;
    private final double strideLength, stepFrequency, waddle, footSize, visualScaleY, hitboxRadius, hitboxHeight, speedMultiplier;

    SnowmanVariant(String key, double baseRadius, double torsoRadius, double headRadius,
                   double armLength, double armRestAngle, double strideLength, double stepFrequency,
                   double waddle, double footSize, double visualScaleY, double hitboxRadius, double hitboxHeight, double speedMultiplier) {
        this.key = key;
        this.baseRadius = baseRadius;
        this.torsoRadius = torsoRadius;
        this.headRadius = headRadius;
        this.armLength = armLength;
        this.armRestAngle = armRestAngle;
        this.strideLength = strideLength;
        this.stepFrequency = stepFrequency;
        this.waddle = waddle;
        this.footSize = footSize;
        this.visualScaleY = visualScaleY;
        this.hitboxRadius = hitboxRadius;
        this.hitboxHeight = hitboxHeight;
        this.speedMultiplier = speedMultiplier;
    }

    public String key() { return key; }
    public double baseRadius() { return baseRadius; }
    public double torsoRadius() { return torsoRadius; }
    public double armLength() { return armLength; }
    public double armRestAngle() { return armRestAngle; }
    public double visualScaleY() { return visualScaleY; }
    public double hitboxRadius() { return hitboxRadius; }
    public double hitboxHeight() { return hitboxHeight; }
    public double speedMultiplier() { return speedMultiplier; }

    /** Serialized values are mirrored by client/src/SnowmanConfig.js for the procedural rig. */
    public Map<String, Object> snapshot() {
        return Map.ofEntries(Map.entry("name", name()), Map.entry("baseRadius", baseRadius),
                Map.entry("torsoRadius", torsoRadius), Map.entry("headRadius", headRadius),
                Map.entry("armLength", armLength), Map.entry("armRestAngle", armRestAngle),
                Map.entry("strideLength", strideLength), Map.entry("stepFrequency", stepFrequency),
                Map.entry("waddle", waddle), Map.entry("footSize", footSize), Map.entry("visualScaleY", visualScaleY),
                Map.entry("hitboxRadius", hitboxRadius), Map.entry("hitboxHeight", hitboxHeight),
                Map.entry("speedMultiplier", speedMultiplier));
    }

    public static SnowmanVariant fromKey(String key) {
        for (SnowmanVariant variant : values()) if (variant.key.equals(key)) return variant;
        return CLASSIC;
    }
}
