package com.greatestsnowman.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Loads and scales the one JSON arena definition used by both game runtimes. */
public final class MapDefinition {
    public static final String RESOURCE = "/maps/christmas_arena.json";
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static volatile MapDefinition cached;

    private final String id;
    private final String title;
    private final double scale;
    private final double snowmanHeight;
    private final double worldWidth;
    private final double worldDepth;
    private final List<Wall> wallObjects;
    private final List<Map<String, Object>> walls;
    private final List<SpawnPoint> spawnPoints;
    private final List<PickupSpawn> pickupSpawns;
    private final List<Decoration> decorations;
    private final List<Map<String, Object>> zones;
    private final List<Map<String, Object>> pads;
    private final Map<String, Object> island;

    private MapDefinition(JsonNode root) {
        JsonNode units = root.path("units");
        this.id = root.path("id").asText("christmas-arena-v1");
        this.title = root.path("title").asText("Christmas Arena");
        this.scale = units.path("worldScale").asDouble();
        this.snowmanHeight = units.path("classicSnowmanHeight").asDouble();
        this.worldWidth = units.path("width").asDouble() * scale;
        this.worldDepth = units.path("depth").asDouble() * scale;

        this.wallObjects = new ArrayList<>();
        loadPerimeter(root.path("perimeter"), units);
        for (JsonNode solid : root.path("solids")) addMirroredWall(solid);
        this.decorations = new ArrayList<>();
        for (JsonNode decoration : root.path("decorations")) addMirroredDecoration(decoration);
        for (Decoration decoration : decorations) {
            if (decoration.isCollidable()) wallObjects.add(decoration.asWall());
        }
        this.walls = wallObjects.stream().map(wall -> wall.snapshot(scale, snowmanHeight)).toList();
        this.spawnPoints = new ArrayList<>();
        for (JsonNode spawn : root.path("spawns")) spawnPoints.add(new SpawnPoint(spawn, scale));
        this.pickupSpawns = new ArrayList<>();
        for (JsonNode pickup : root.path("pickupSpawns")) pickupSpawns.add(new PickupSpawn(pickup, scale));

        JsonNode features = root.path("features");
        this.zones = scaledRows(features.path("zones"), scale, snowmanHeight);
        this.pads = scaledRows(features.path("pads"), scale, snowmanHeight);
        JsonNode islandNode = features.path("island");
        this.island = Map.of("id", islandNode.path("id").asText("center-island"),
                "x", islandNode.path("x").asDouble() * scale,
                "z", islandNode.path("z").asDouble() * scale,
                "radius", islandNode.path("radius").asDouble() * scale,
                "height", islandNode.path("heightHs").asDouble() * snowmanHeight);
    }

    public static MapDefinition load() {
        MapDefinition result = cached;
        if (result != null) return result;
        synchronized (MapDefinition.class) {
            if (cached == null) {
                try (InputStream stream = MapDefinition.class.getResourceAsStream(RESOURCE)) {
                    if (stream == null) throw new IllegalStateException("Missing shared map resource " + RESOURCE);
                    MapDefinition loaded = new MapDefinition(MAPPER.readTree(stream));
                    MapValidator.Report report = MapValidator.validate(loaded.snapshot());
                    System.out.printf("[Christmas Arena] %s; %d colliders; minimum corridor %.2f world units%s%n",
                            report.isValid() ? "valid" : "needs attention", report.colliderCount(),
                            report.minimumCorridorWorld(), report.issues().isEmpty() ? "" : " - " + report.issues());
                    if (!report.isValid()) throw new IllegalStateException("Invalid Christmas arena: " + report.issues());
                    cached = loaded;
                } catch (IOException error) {
                    throw new IllegalStateException("Could not load shared Christmas arena definition", error);
                }
            }
            return cached;
        }
    }

    public String getId() { return id; }
    public double getWorldWidth() { return worldWidth; }
    public double getWorldDepth() { return worldDepth; }
    public double getWorldSize() { return Math.max(worldWidth, worldDepth); }
    public List<Map<String, Object>> getWalls() { return walls; }
    public List<SpawnPoint> getSpawnPoints() { return spawnPoints; }
    public List<PickupSpawn> getPickupSpawns() { return pickupSpawns; }
    public List<Decoration> getDecorations() { return decorations; }

    public void placeAtSpawn(PlayerState player, int seat, int rotation) {
        SpawnPoint spawn = spawnPoints.get(Math.floorMod(seat + rotation, spawnPoints.size()));
        player.setSpawn(spawn.getX(), spawn.getZ());
    }

    public Map<String, Object> snapshot() {
        List<Map<String, Object>> spawns = spawnPoints.stream().map(SpawnPoint::snapshot).toList();
        List<Map<String, Object>> pickups = pickupSpawns.stream().map(PickupSpawn::snapshot).toList();
        List<Map<String, Object>> props = decorations.stream()
                .map(decoration -> decoration.snapshot(scale, snowmanHeight)).toList();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", id);
        result.put("title", title);
        result.put("size", "CHRISTMAS");
        result.put("unitScale", scale);
        result.put("classicSnowmanHeight", snowmanHeight);
        result.put("worldWidth", worldWidth);
        result.put("worldDepth", worldDepth);
        result.put("worldSize", getWorldSize());
        result.put("colliderCount", walls.size());
        result.put("zones", zones);
        result.put("walls", walls);
        result.put("props", props);
        result.put("spawns", spawns);
        result.put("pickupSpawns", pickups);
        result.put("pads", pads);
        result.put("island", island);
        return result;
    }

    private void loadPerimeter(JsonNode perimeter, JsonNode units) {
        double halfWidth = units.path("width").asDouble() / 2.0;
        double halfDepth = units.path("depth").asDouble() / 2.0;
        double thickness = perimeter.path("thickness").asDouble();
        double pillarSize = perimeter.path("pillarSize").asDouble();
        double spacing = perimeter.path("pillarSpacing").asDouble();
        double wallHeight = perimeter.path("wallHeightHs").asDouble();
        double pillarHeight = perimeter.path("pillarHeightHs").asDouble();
        List<Double> horizontalPillars = pillarCenters(halfWidth, pillarSize / 2.0, spacing);
        List<Double> verticalPillars = pillarCenters(halfDepth, pillarSize / 2.0, spacing);
        for (double zSign : new double[]{-1, 1}) {
            double z = zSign * (halfDepth - pillarSize / 2.0);
            for (int i = 0; i < horizontalPillars.size(); i++) {
                addPerimeter("perimeter-pillar-h-" + (zSign < 0 ? "north" : "south") + "-" + i,
                        horizontalPillars.get(i), z, pillarSize, pillarSize, pillarHeight, true,
                        perimeter.path("lanterns").asBoolean());
                if (i + 1 < horizontalPillars.size()) {
                    double first = horizontalPillars.get(i), next = horizontalPillars.get(i + 1);
                    double length = next - first - pillarSize;
                    addPerimeter("perimeter-h-" + (zSign < 0 ? "north" : "south") + "-" + i,
                            (first + next) / 2.0, z, length, thickness, wallHeight, false, false);
                }
            }
        }
        for (double xSign : new double[]{-1, 1}) {
            double x = xSign * (halfWidth - pillarSize / 2.0);
            for (int i = 0; i < verticalPillars.size(); i++) {
                double z = verticalPillars.get(i);
                // Corners are already part of the north/south pillar rows.
                if (i > 0 && i + 1 < verticalPillars.size()) {
                    addPerimeter("perimeter-pillar-v-" + (xSign < 0 ? "west" : "east") + "-" + i,
                            x, z, pillarSize, pillarSize, pillarHeight, true,
                            perimeter.path("lanterns").asBoolean());
                }
                if (i + 1 < verticalPillars.size()) {
                    double first = verticalPillars.get(i), next = verticalPillars.get(i + 1);
                    double length = next - first - pillarSize;
                    addPerimeter("perimeter-v-" + (xSign < 0 ? "west" : "east") + "-" + i,
                            x, (first + next) / 2.0, thickness, length, wallHeight, false, false);
                }
            }
        }
    }

    private static List<Double> pillarCenters(double halfExtent, double endInset, double spacing) {
        List<Double> centers = new ArrayList<>();
        double first = -halfExtent + endInset;
        double last = halfExtent - endInset;
        centers.add(first);
        for (double value = Math.ceil(first / spacing) * spacing; value < last - 1e-6; value += spacing) {
            if (value > first + 1e-6) centers.add(value);
        }
        centers.add(last);
        return centers;
    }

    private void addPerimeter(String id, double x, double z, double width, double depth,
                              double heightHs, boolean pillar, boolean lantern) {
        wallObjects.add(new PerimeterWall(id, x * scale, z * scale, width * scale, depth * scale,
                heightHs * snowmanHeight, pillar, lantern));
    }

    private void addMirroredWall(JsonNode source) {
        for (Point point : mirrors(source)) {
            String suffix = point.suffix();
            double x = point.x() * scale, z = point.z() * scale;
            double width = source.path("width").asDouble() * scale;
            double depth = source.path("depth").asDouble() * scale;
            double height = source.path("heightHs").asDouble() * snowmanHeight;
            String id = source.path("id").asText() + suffix;
            String type = source.path("type").asText();
            wallObjects.add(switch (type) {
                case "BARRIER" -> new Barrier(id, x, z, width, depth, height);
                case "SIDE_POST" -> new SidePost(id, x, z, width, depth, height);
                case "ICE_BLOCK" -> new IceBlock(id, x, z, width, depth, height);
                default -> throw new IllegalArgumentException("Unknown map wall type " + type);
            });
        }
    }

    private void addMirroredDecoration(JsonNode source) {
        for (Point point : mirrors(source)) {
            decorations.add(new Decoration(source, point.x() * scale, point.z() * scale,
                    point.suffix(), scale, snowmanHeight));
        }
    }

    private static List<Point> mirrors(JsonNode source) {
        double x = source.path("x").asDouble(), z = source.path("z").asDouble();
        double[] xs = source.path("mirrorX").asBoolean() ? new double[]{-1, 1} : new double[]{1};
        double[] zs = source.path("mirrorZ").asBoolean() ? new double[]{-1, 1} : new double[]{1};
        List<Point> result = new ArrayList<>();
        for (double sx : xs) for (double sz : zs) {
            double mirroredX = x * sx, mirroredZ = z * sz;
            if (result.stream().anyMatch(other -> Math.abs(other.x() - mirroredX) < 0.001
                    && Math.abs(other.z() - mirroredZ) < 0.001)) continue;
            result.add(new Point(mirroredX, mirroredZ,
                    (sx < 0 ? "-x" : "+x") + (sz < 0 ? "-z" : "+z")));
        }
        return result;
    }

    private static List<Map<String, Object>> scaledRows(JsonNode rows, double scale, double height) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (JsonNode row : rows) {
            Map<String, Object> converted = new LinkedHashMap<>();
            row.fields().forEachRemaining(field -> {
                String key = field.getKey();
                JsonNode value = field.getValue();
                if (value.isNumber()) {
                    double number = value.asDouble();
                    converted.put(key, switch (key) {
                        case "x", "z", "width", "depth", "radius" -> number * scale;
                        case "raiseHs", "heightHs" -> number * height;
                        default -> number;
                    });
                } else if (value.isTextual()) converted.put(key, value.asText());
            });
            result.add(Map.copyOf(converted));
        }
        return List.copyOf(result);
    }

    private record Point(double x, double z, String suffix) { }

    /** POLYMORPHISM: every wall subtype shares its collision/snapshot contract. */
    public abstract static class Wall {
        private final String id;
        private final String type;
        private final double x, z, width, depth, height;
        protected Wall(String id, String type, double x, double z, double width, double depth, double height) {
            this.id = id; this.type = type; this.x = x; this.z = z;
            this.width = width; this.depth = depth; this.height = height;
        }
        public String getId() { return id; }
        public String getType() { return type; }
        public double getX() { return x; }
        public double getZ() { return z; }
        public double getWidth() { return width; }
        public double getDepth() { return depth; }
        public double getHeight() { return height; }
        public Map<String, Object> snapshot(double scale, double snowmanHeight) {
            return Map.of("id", id, "type", type, "x", x, "z", z,
                    "width", width, "depth", depth, "height", height, "collidable", true);
        }
    }

    public static final class PerimeterWall extends Wall {
        private final boolean pillar, lantern;
        private PerimeterWall(String id, double x, double z, double width, double depth,
                              double height, boolean pillar, boolean lantern) {
            super(id, pillar ? "PILLAR" : "PERIMETER", x, z, width, depth, height);
            this.pillar = pillar; this.lantern = lantern;
        }
        @Override public Map<String, Object> snapshot(double scale, double snowmanHeight) {
            Map<String, Object> row = new LinkedHashMap<>(super.snapshot(scale, snowmanHeight));
            row.put("pillar", pillar); row.put("lantern", lantern);
            return Map.copyOf(row);
        }
    }

    public static final class Barrier extends Wall {
        private Barrier(String id, double x, double z, double width, double depth, double height) {
            super(id, "BARRIER", x, z, width, depth, height);
        }
    }
    public static final class SidePost extends Wall {
        private SidePost(String id, double x, double z, double width, double depth, double height) {
            super(id, "SIDE_POST", x, z, width, depth, height);
        }
    }
    public static final class IceBlock extends Wall {
        private IceBlock(String id, double x, double z, double width, double depth, double height) {
            super(id, "ICE_BLOCK", x, z, width, depth, height);
        }
    }

    private static final class DecorationCollider extends Wall {
        private DecorationCollider(String id, String type, double x, double z, double width, double depth, double height) {
            super(id, type, x, z, width, depth, height);
        }
    }

    public static final class SpawnPoint {
        private final String id, team;
        private final double x, z;
        private SpawnPoint(JsonNode source, double scale) {
            id = source.path("id").asText(); team = source.path("team").asText();
            x = source.path("x").asDouble() * scale; z = source.path("z").asDouble() * scale;
        }
        public String getId() { return id; }
        public String getTeam() { return team; }
        public double getX() { return x; }
        public double getZ() { return z; }
        public Map<String, Object> snapshot() { return Map.of("id", id, "team", team, "x", x, "z", z); }
    }

    public static final class PickupSpawn {
        private final String id, type, rarity;
        private final double x, z;
        private PickupSpawn(JsonNode source, double scale) {
            id = source.path("id").asText(); type = source.path("type").asText("");
            rarity = source.path("rarity").asText("COMMON");
            x = source.path("x").asDouble() * scale; z = source.path("z").asDouble() * scale;
        }
        public String getId() { return id; }
        public String getType() { return type.isBlank() ? null : type; }
        public String getRarity() { return rarity; }
        public double getX() { return x; }
        public double getZ() { return z; }
        public Map<String, Object> snapshot() {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", id); row.put("x", x); row.put("z", z); row.put("rarity", rarity);
            if (!type.isBlank()) row.put("type", type);
            return Map.copyOf(row);
        }
    }

    public static final class Decoration {
        private final String id, type, color;
        private final double x, z, visualScale, rotation, y, width, depth, height;
        private final boolean collidable;
        private Decoration(JsonNode source, double x, double z, String suffix,
                           double mapScale, double snowmanHeight) {
            this.id = source.path("id").asText() + suffix;
            this.type = source.path("type").asText(); this.color = source.path("color").asText("");
            this.x = x; this.z = z; this.visualScale = source.path("scale").asDouble(1);
            this.rotation = source.path("rotation").asDouble();
            this.y = source.path("yHs").asDouble() * snowmanHeight;
            this.width = source.path("width").asDouble() * mapScale;
            this.depth = source.path("depth").asDouble() * mapScale;
            this.height = source.path("heightHs").asDouble() * snowmanHeight;
            this.collidable = source.path("collidable").asBoolean(false);
        }
        public String getId() { return id; }
        public String getType() { return type; }
        public String getColor() { return color; }
        public double getX() { return x; }
        public double getZ() { return z; }
        public boolean isCollidable() { return collidable; }
        private Wall asWall() {
            String colliderType = "snowman-statue".equals(type) ? "STATUE" : type.toUpperCase(java.util.Locale.ROOT);
            return new DecorationCollider(id, colliderType, x, z, width, depth, height);
        }
        public Map<String, Object> snapshot(double scale, double snowmanHeight) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", id); row.put("type", type); row.put("x", x); row.put("z", z);
            row.put("scale", visualScale); row.put("rotation", rotation); row.put("y", y);
            row.put("collidable", collidable); row.put("width", width); row.put("depth", depth);
            row.put("height", height);
            if (!color.isBlank()) row.put("color", color);
            return Map.copyOf(row);
        }
    }
}
