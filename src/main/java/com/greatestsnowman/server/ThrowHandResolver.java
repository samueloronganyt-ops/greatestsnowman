package com.greatestsnowman.server;

/** Computes the release hand from the same hierarchy and release pose as the client rig. */
public final class ThrowHandResolver {
    private static final double UPPER_ARM_RATIO = 0.62;
    private static final double LOWER_ARM_RATIO = 0.48;
    private static final double ELBOW_X = 0.025;
    private static final double FOREARM_X_RATIO = 0.12;
    private static final double HAND_Z = 0.12;
    private static final double SHOULD_X_RATIO = 0.91;
    private static final double SHOULDER_Y_RATIO = 0.22;
    private static final double SHOULDER_Z = 0.02;
    private static final double RELEASE_ARM_X = -0.8;
    private static final double RELEASE_ARM_Z = 0.10;
    private static final double CROUCH_RELEASE_ARM_X = -0.65;
    private static final double CROUCH_RELEASE_ARM_Z = 0.08;
    private static final double RELEASE_TORSO_PITCH = 0.16;
    private static final double CROUCH_RELEASE_TORSO_PITCH = 0.12;
    private static final double MAX_TORSO_PITCH = 0.21;
    private static final double MAX_TORSO_YAW = 0.43;

    private ThrowHandResolver() { }

    public record Position(double x, double y, double z) { }

    public static Position resolve(PlayerState player) {
        SnowmanVariant variant = player.getVariant();
        boolean crouching = player.getMovementState() == MovementState.CROUCHING;
        double releaseProgress = 0.12 / 0.45;
        double bodyScaleY = crouching
                ? 0.61 - Math.sin(releaseProgress * Math.PI) * 0.025
                : 1.0 - Math.sin(releaseProgress * Math.PI) * 0.035;
        double armX = crouching ? CROUCH_RELEASE_ARM_X : RELEASE_ARM_X;
        double armZ = variant.armRestAngle() + (crouching ? CROUCH_RELEASE_ARM_Z : RELEASE_ARM_Z);
        double elbowZ = Math.abs(crouching ? CROUCH_RELEASE_ARM_Z : RELEASE_ARM_Z) * 0.5;
        double torsoPitch = crouching ? CROUCH_RELEASE_TORSO_PITCH : RELEASE_TORSO_PITCH;
        double torsoYaw = 0;
        if (player.isAiming()) {
            torsoPitch -= player.getAimPitch() * 0.34;
            torsoYaw = clamp(AimResolver.angleDiff(player.getYaw(), player.getAimYaw()),
                    -MAX_TORSO_YAW, MAX_TORSO_YAW);
        }
        torsoPitch = clamp(torsoPitch, -MAX_TORSO_PITCH, MAX_TORSO_PITCH);
        return resolve(variant, player.getX(), player.getZ(), player.getYaw(), crouching,
                bodyScaleY, torsoPitch, torsoYaw, armX, armZ, elbowZ);
    }

    static Position resolve(SnowmanVariant variant, double rootX, double rootZ, double rootYaw,
                             boolean crouching, double bodyScaleY, double torsoPitch,
                             double torsoYaw, double armX, double armZ, double elbowZ) {
        // Mirror SnowmanRig's hierarchy: poseRoot -> hips -> torsoPivot -> shoulder -> elbow -> hand.
        double upperLength = variant.armLength() * UPPER_ARM_RATIO;
        double lowerLength = variant.armLength() * LOWER_ARM_RATIO;

        double[] hand = { FOREARM_X_RATIO * lowerLength, -lowerLength, HAND_Z };
        hand = rotateXyz(hand, 0, 0, elbowZ);
        hand[0] += ELBOW_X;
        hand[1] -= upperLength;
        hand = rotateXyz(hand, armX, 0, armZ);
        hand[0] += variant.torsoRadius() * SHOULD_X_RATIO;
        hand[1] += variant.torsoRadius() * SHOULDER_Y_RATIO;
        hand[2] += SHOULDER_Z;
        hand = rotateXyz(hand, torsoPitch, torsoYaw, 0);

        // Both the hips and torso pivot have a baseRadius offset in the current rig hierarchy.
        double localY = (variant.baseRadius() * 2 + variant.torsoRadius() * 0.84 + hand[1])
                * variant.visualScaleY() * bodyScaleY;
        double localX = hand[0];
        double localZ = hand[2];
        double cosine = Math.cos(rootYaw);
        double sine = Math.sin(rootYaw);
        return new Position(rootX + cosine * localX + sine * localZ,
                Math.max(0.1, localY), rootZ - sine * localX + cosine * localZ);
    }

    /** Three.js Euler order XYZ, applied to a vector in the same order as Object3D. */
    private static double[] rotateXyz(double[] v, double x, double y, double z) {
        double cx = Math.cos(x), sx = Math.sin(x);
        double cy = Math.cos(y), sy = Math.sin(y);
        double cz = Math.cos(z), sz = Math.sin(z);
        return new double[] {
                cy * cz * v[0] - cy * sz * v[1] + sy * v[2],
                (cx * sz + sx * sy * cz) * v[0] + (cx * cz - sx * sy * sz) * v[1] - sx * cy * v[2],
                (sx * sz - cx * sy * cz) * v[0] + (sx * cz + cx * sy * sz) * v[1] + cx * cy * v[2]
        };
    }

    private static double clamp(double value, double min, double max) {
        return Double.isFinite(value) ? Math.max(min, Math.min(max, value)) : 0;
    }
}
