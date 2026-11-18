package com.greatestsnowman.server;

import java.util.List;
import java.util.Map;

/** Immutable room view of the shared hand-authored arena definition. */
public final class ArenaMap {
    private final MapDefinition definition;
    private final double legacyWorldWidth;
    private final double legacyWorldDepth;
    private final List<Map<String, Object>> legacyWalls;
    private final List<Map<String, Object>> legacySpawns;

    public ArenaMap(MapDefinition definition) {
        this.definition = definition;
        this.legacyWorldWidth = 0;
        this.legacyWorldDepth = 0;
        this.legacyWalls = List.of();
        this.legacySpawns = List.of();
    }

    /**
     * Compatibility constructor for focused collision tests and old map fixtures.
     * Production rooms use the shared JSON-backed MapDefinition constructor.
     */
    public ArenaMap(String id, int worldSize,
                    List<? extends Map<String, ?>> obstacles,
                    List<? extends Map<String, ?>> walls,
                    List<? extends Map<String, ?>> props,
                    List<? extends Map<String, ?>> spawns) {
        this.definition = null;
        this.legacyWorldWidth = worldSize;
        this.legacyWorldDepth = worldSize;
        java.util.ArrayList<Map<String, Object>> colliders = new java.util.ArrayList<>();
        appendRows(colliders, obstacles);
        appendRows(colliders, walls);
        appendRows(colliders, props);
        this.legacyWalls = List.copyOf(colliders);
        java.util.ArrayList<Map<String, Object>> spawnRows = new java.util.ArrayList<>();
        appendRows(spawnRows, spawns);
        this.legacySpawns = List.copyOf(spawnRows);
    }

    private static void appendRows(List<Map<String, Object>> target,
                                   List<? extends Map<String, ?>> source) {
        for (Map<String, ?> row : source) {
            java.util.LinkedHashMap<String, Object> copy = new java.util.LinkedHashMap<>();
            row.forEach(copy::put);
            target.add(Map.copyOf(copy));
        }
    }

    public int getWorldSize() { return definition == null ? (int) Math.ceil(legacyWorldWidth) : (int) Math.ceil(definition.getWorldSize()); }
    public double getWorldWidth() { return definition == null ? legacyWorldWidth : definition.getWorldWidth(); }
    public double getWorldDepth() { return definition == null ? legacyWorldDepth : definition.getWorldDepth(); }
    public List<Map<String, Object>> getWalls() { return definition == null ? legacyWalls : definition.getWalls(); }
    public List<MapDefinition.PickupSpawn> getPickupSpawns() { return definition == null ? List.of() : definition.getPickupSpawns(); }
    public int getSpawnCount() { return definition == null ? legacySpawns.size() : definition.getSpawnPoints().size(); }

    public void placeAtSpawn(PlayerState player, int seat) {
        placeAtSpawn(player, seat, 0);
    }

    public void placeAtSpawn(PlayerState player, int seat, int roundRotation) {
        if (definition != null) {
            definition.placeAtSpawn(player, seat, roundRotation);
        } else if (!legacySpawns.isEmpty()) {
            Map<String, Object> spawn = legacySpawns.get(Math.floorMod(seat + roundRotation, legacySpawns.size()));
            player.setSpawn(((Number) spawn.get("x")).doubleValue(), ((Number) spawn.get("z")).doubleValue());
        }
    }

    public Map<String, Object> snapshot() {
        if (definition != null) return definition.snapshot();
        return Map.of("id", "legacy-test-fixture", "worldWidth", legacyWorldWidth,
                "worldDepth", legacyWorldDepth, "walls", legacyWalls, "spawns", legacySpawns);
    }
}
