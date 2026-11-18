package com.greatestsnowman.server;

import java.util.Map;
import java.util.UUID;

/** Shared identity and position for pickups; subclasses apply effects differently. */
public abstract class PowerUp {
    private final String id = UUID.randomUUID().toString();
    private final double x;
    private final double z;
    private final String rarity;
    private final String spawnId;

    protected PowerUp(double x, double z) {
        this(x, z, "COMMON", "");
    }

    protected PowerUp(double x, double z, String rarity, String spawnId) {
        this.x = x;
        this.z = z;
        this.rarity = rarity == null || rarity.isBlank() ? "COMMON" : rarity;
        this.spawnId = spawnId == null ? "" : spawnId;
    }

    public double getX() { return x; }
    public double getZ() { return z; }
    public String getRarity() { return rarity; }
    public String getSpawnId() { return spawnId; }
    public abstract String getType();
    public abstract void applyTo(PlayerState player);

    /** POLYMORPHISM: the chosen subtype owns the pickup's effect and label. */
    public static PowerUp create(String type, double x, double z) {
        return create(type, x, z, "COMMON", "");
    }

    public static PowerUp create(String type, double x, double z, String rarity, String spawnId) {
        return switch (type) {
            case "SPEED" -> new SpeedBoost(x, z, rarity, spawnId);
            case "STRONG" -> new StrongSnowball(x, z, rarity, spawnId);
            case "SHIELD" -> new Shield(x, z, rarity, spawnId);
            case "HEAL" -> new HealPack(x, z, rarity, spawnId);
            case "EXTRA_LIFE" -> new ExtraLife(x, z, rarity, spawnId);
            default -> throw new IllegalArgumentException("Unknown power-up type: " + type);
        };
    }

    public Map<String, Object> snapshot() {
        return Map.of("id", id, "type", getType(), "x", x, "z", z,
                "rarity", rarity, "spawnId", spawnId);
    }
}

final class SpeedBoost extends PowerUp {
    SpeedBoost(double x, double z, String rarity, String spawnId) { super(x, z, rarity, spawnId); }
    @Override public String getType() { return "SPEED"; }
    @Override public void applyTo(PlayerState player) { player.activateSpeedBoost(); }
}

final class StrongSnowball extends PowerUp {
    StrongSnowball(double x, double z, String rarity, String spawnId) { super(x, z, rarity, spawnId); }
    @Override public String getType() { return "STRONG"; }
    @Override public void applyTo(PlayerState player) { player.activateStrongThrows(); }
}

final class Shield extends PowerUp {
    Shield(double x, double z, String rarity, String spawnId) { super(x, z, rarity, spawnId); }
    @Override public String getType() { return "SHIELD"; }
    @Override public void applyTo(PlayerState player) { player.activateShield(); }
}

final class HealPack extends PowerUp {
    HealPack(double x, double z, String rarity, String spawnId) { super(x, z, rarity, spawnId); }
    @Override public String getType() { return "HEAL"; }
    @Override public void applyTo(PlayerState player) { player.heal(45); }
}

final class ExtraLife extends PowerUp {
    ExtraLife(double x, double z, String rarity, String spawnId) { super(x, z, rarity, spawnId); }
    @Override public String getType() { return "EXTRA_LIFE"; }
    @Override public void applyTo(PlayerState player) { player.grantExtraLife(); }
}
