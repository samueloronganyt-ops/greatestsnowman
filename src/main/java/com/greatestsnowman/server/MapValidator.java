package com.greatestsnowman.server;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Deterministic map checks shared with the client validator's geometry rules. */
public final class MapValidator {
    private static final double EPSILON = 0.01;
    private MapValidator() { }

    public record Report(List<String> issues, int colliderCount, double minimumCorridorWorld) {
        public boolean isValid() { return issues.isEmpty(); }
    }

    public static Report validate(Map<String, Object> arena) {
        List<String> issues = new ArrayList<>();
        List<Map<String, Object>> walls = rows(arena.get("walls"));
        List<Map<String, Object>> pads = rows(arena.get("pads"));
        List<Map<String, Object>> spawns = rows(arena.get("spawns"));
        List<Map<String, Object>> pickups = rows(arena.get("pickupSpawns"));
        List<Map<String, Object>> props = rows(arena.get("props"));
        double widestRadius = Arrays.stream(SnowmanVariant.values())
                .mapToDouble(SnowmanVariant::hitboxRadius).max().orElse(1.0);
        double minimumCorridor = 2.5 * widestRadius * 2;

        for (Map<String, Object> wall : walls) {
            if (!hasMirror(walls, wall, true) || !hasMirror(walls, wall, false)) {
                issues.add("symmetry: " + wall.get("id"));
            }
            if (outside(wall, number(arena, "worldWidth") / 2.0,
                    number(arena, "worldDepth") / 2.0)) issues.add("out of bounds: " + wall.get("id"));
        }
        for (int i = 0; i < walls.size(); i++) for (int j = i + 1; j < walls.size(); j++) {
            Map<String, Object> first = walls.get(i), second = walls.get(j);
            if (overlap(first, second)) issues.add("overlap: " + first.get("id") + " / " + second.get("id"));
            if (isPerimeter(first) && isPerimeter(second)) continue;
            double gap = distance(first, second);
            if (gap + EPSILON < minimumCorridor) {
                issues.add("corridor " + gap + " world units: " + first.get("id") + " / " + second.get("id"));
            }
        }
        for (Map<String, Object> pad : pads) for (Map<String, Object> wall : walls) {
            if (overlap(pad, wall)) issues.add("pad collision: " + pad.get("id") + " / " + wall.get("id"));
        }
        for (Map<String, Object> spawn : spawns) {
            Map<String, Object> point = point(spawn);
            if (outside(point, number(arena, "worldWidth") / 2.0 - widestRadius,
                    number(arena, "worldDepth") / 2.0 - widestRadius)
                    || walls.stream().anyMatch(wall -> pointDistance(point, wall) < widestRadius)) {
                issues.add("blocked/out-of-bounds spawn: " + spawn.get("id"));
            }
        }
        for (Map<String, Object> pickup : pickups) {
            Map<String, Object> point = point(pickup);
            if (walls.stream().anyMatch(wall -> pointDistance(point, wall) < 0.9)) {
                issues.add("blocked pickup spawn: " + pickup.get("id"));
            }
            for (Map<String, Object> prop : props) {
                String type = String.valueOf(prop.get("type"));
                if (Boolean.TRUE.equals(prop.get("collidable")) || type.equals("pine")
                        || type.equals("wreath") || type.equals("snow-pile")) continue;
                if (Math.hypot(number(pickup, "x") - number(prop, "x"),
                        number(pickup, "z") - number(prop, "z")) < 1.6 * number(prop, "scale")) {
                    issues.add("decoration blocks pickup: " + pickup.get("id") + " / " + prop.get("id"));
                }
            }
        }

        Map<String, Object> north = find(spawns, "north-main"), south = find(spawns, "south-main");
        double handHeight = number(arena, "classicSnowmanHeight") * 0.4;
        if (!lineBlocked(north, south, walls, handHeight)) issues.add("line of sight: main spawns are exposed");
        for (Map<String, Object> blue : spawns) if ("BLUE".equals(blue.get("team"))) {
            for (Map<String, Object> red : spawns) if ("RED".equals(red.get("team"))) {
                if (Math.hypot(number(blue, "x") - number(red, "x"),
                        number(blue, "z") - number(red, "z")) < 6) {
                    issues.add("enemy spawns too close: " + blue.get("id") + " / " + red.get("id"));
                }
                if (!lineBlocked(blue, red, walls, handHeight)) {
                    issues.add("line of sight: " + blue.get("id") + " / " + red.get("id") + " are exposed");
                }
            }
        }

        Grid grid = grid(arena, walls, Set.of(), widestRadius);
        List<Integer> primary = path(grid, north, south);
        if (primary.isEmpty()) issues.add("navigation: main spawn pads disconnected");
        else {
            Set<Integer> excluded = new HashSet<>();
            for (int index = 4; index < primary.size() - 4; index++) {
                int cell = primary.get(index), column = cell % grid.columns, row = cell / grid.columns;
                for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
                    if (Math.hypot(dx, dy) > 1.0) continue;
                    int x = column + dx, y = row + dy;
                    if (x >= 0 && x < grid.columns && y >= 0 && y < grid.rows) excluded.add(y * grid.columns + x);
                }
            }
            excluded.remove(grid.toIndex(north)); excluded.remove(grid.toIndex(south));
            if (path(grid(arena, walls, excluded, widestRadius), north, south).isEmpty()) {
                issues.add("navigation: only one separated route between main spawn pads");
            }
        }
        List<Map<String, Object>> landmarks = new ArrayList<>();
        landmarks.addAll(spawns);
        landmarks.addAll(pickups);
        Map<String, Object> island = castMap(arena.get("island"));
        landmarks.add(Map.of("id", "center-island", "x", number(island, "x") + number(island, "radius") * 0.75,
                "z", number(island, "z")));
        for (Map<String, Object> landmark : landmarks) if (path(grid, north, landmark).isEmpty()) {
            issues.add("navigation: unreachable " + landmark.get("id"));
        }
        return new Report(List.copyOf(issues), walls.size(), minimumCorridor);
    }

    private static boolean hasMirror(List<Map<String, Object>> walls, Map<String, Object> wall, boolean mirrorX) {
        double x = number(wall, "x") * (mirrorX ? -1 : 1), z = number(wall, "z") * (mirrorX ? 1 : -1);
        return walls.stream().anyMatch(other -> Math.abs(number(other, "x") - x) < EPSILON
                && Math.abs(number(other, "z") - z) < EPSILON
                && Math.abs(number(other, "width") - number(wall, "width")) < EPSILON
                && Math.abs(number(other, "depth") - number(wall, "depth")) < EPSILON
                && Math.abs(number(other, "height") - number(wall, "height")) < EPSILON);
    }

    private static boolean isPerimeter(Map<String, Object> wall) {
        return "PERIMETER".equals(wall.get("type")) || "PILLAR".equals(wall.get("type"));
    }

    private static boolean overlap(Map<String, Object> a, Map<String, Object> b) {
        return Math.abs(number(a, "x") - number(b, "x"))
                < (number(a, "width") + number(b, "width")) / 2.0 - EPSILON
                && Math.abs(number(a, "z") - number(b, "z"))
                < (number(a, "depth") + number(b, "depth")) / 2.0 - EPSILON;
    }

    private static double distance(Map<String, Object> a, Map<String, Object> b) {
        double dx = Math.max(0, Math.abs(number(a, "x") - number(b, "x"))
                - (number(a, "width") + number(b, "width")) / 2.0);
        double dz = Math.max(0, Math.abs(number(a, "z") - number(b, "z"))
                - (number(a, "depth") + number(b, "depth")) / 2.0);
        return Math.hypot(dx, dz);
    }

    private static double pointDistance(Map<String, Object> point, Map<String, Object> wall) {
        double dx = Math.max(0, Math.abs(number(point, "x") - number(wall, "x")) - number(wall, "width") / 2.0);
        double dz = Math.max(0, Math.abs(number(point, "z") - number(wall, "z")) - number(wall, "depth") / 2.0);
        return Math.hypot(dx, dz);
    }

    private static boolean outside(Map<String, Object> row, double halfWidth, double halfDepth) {
        return Math.abs(number(row, "x")) + number(row, "width") / 2 > halfWidth + EPSILON
                || Math.abs(number(row, "z")) + number(row, "depth") / 2 > halfDepth + EPSILON;
    }

    private static boolean lineBlocked(Map<String, Object> from, Map<String, Object> to,
                                       List<Map<String, Object>> walls, double y) {
        for (Map<String, Object> wall : walls) {
            if (number(wall, "height") < y) continue;
            double x0 = number(from, "x"), z0 = number(from, "z");
            double dx = number(to, "x") - x0, dz = number(to, "z") - z0;
            double[] interval = {0, 1};
            if (intersect(x0, dx, number(wall, "x") - number(wall, "width") / 2,
                    number(wall, "x") + number(wall, "width") / 2, interval)
                    && intersect(z0, dz, number(wall, "z") - number(wall, "depth") / 2,
                    number(wall, "z") + number(wall, "depth") / 2, interval)
                    && interval[1] >= interval[0] && interval[1] >= 0 && interval[0] <= 1) return true;
        }
        return false;
    }

    private static boolean intersect(double origin, double delta, double min, double max, double[] range) {
        if (Math.abs(delta) < 1e-9) return origin >= min && origin <= max;
        double a = (min - origin) / delta, b = (max - origin) / delta;
        if (a > b) { double swap = a; a = b; b = swap; }
        range[0] = Math.max(range[0], a); range[1] = Math.min(range[1], b);
        return range[0] <= range[1];
    }

    private static Grid grid(Map<String, Object> arena, List<Map<String, Object>> walls,
                             Set<Integer> excluded, double radius) {
        double step = 1;
        int columns = (int) Math.floor(number(arena, "worldWidth") / step) + 1;
        int rows = (int) Math.floor(number(arena, "worldDepth") / step) + 1;
        boolean[] blocked = new boolean[columns * rows];
        double minX = -number(arena, "worldWidth") / 2, minZ = -number(arena, "worldDepth") / 2;
        for (int row = 0; row < rows; row++) for (int col = 0; col < columns; col++) {
            int index = row * columns + col;
            if (excluded.contains(index)) { blocked[index] = true; continue; }
            double x = minX + col * step, z = minZ + row * step;
            Map<String, Object> point = Map.of("x", x, "z", z, "width", 0.0, "depth", 0.0);
            blocked[index] = walls.stream().anyMatch(wall -> pointDistance(point, wall) < radius);
        }
        return new Grid(columns, rows, minX, minZ, step, blocked);
    }

    private static List<Integer> path(Grid grid, Map<String, Object> start, Map<String, Object> goal) {
        int from = grid.toIndex(start), to = grid.toIndex(goal);
        if (grid.blocked[from] || grid.blocked[to]) return List.of();
        int[] previous = new int[grid.blocked.length];
        Arrays.fill(previous, -1);
        int[] queue = new int[grid.blocked.length];
        int head = 0, tail = 0;
        queue[tail++] = from; previous[from] = from;
        while (head < tail) {
            int current = queue[head++];
            if (current == to) break;
            int x = current % grid.columns, z = current / grid.columns;
            int[] neighbors = {x > 0 ? current - 1 : -1, x + 1 < grid.columns ? current + 1 : -1,
                    z > 0 ? current - grid.columns : -1, z + 1 < grid.rows ? current + grid.columns : -1};
            for (int next : neighbors) if (next >= 0 && !grid.blocked[next] && previous[next] == -1) {
                previous[next] = current; queue[tail++] = next;
            }
        }
        if (previous[to] == -1) return List.of();
        List<Integer> result = new ArrayList<>();
        for (int current = to; current != from; current = previous[current]) result.add(current);
        result.add(from);
        return result;
    }

    private record Grid(int columns, int rows, double minX, double minZ, double step, boolean[] blocked) {
        int toIndex(Map<String, Object> point) {
            int x = clamp((int) Math.round((number(point, "x") - minX) / step), 0, columns - 1);
            int z = clamp((int) Math.round((number(point, "z") - minZ) / step), 0, rows - 1);
            return z * columns + x;
        }
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> rows(Object value) {
        return (List<Map<String, Object>>) value;
    }
    @SuppressWarnings("unchecked")
    private static Map<String, Object> castMap(Object value) { return (Map<String, Object>) value; }
    private static Map<String, Object> find(List<Map<String, Object>> rows, String id) {
        return rows.stream().filter(row -> id.equals(row.get("id"))).findFirst().orElseThrow();
    }
    private static Map<String, Object> point(Map<String, Object> value) {
        return Map.of("x", number(value, "x"), "z", number(value, "z"), "width", 0.0, "depth", 0.0);
    }
    private static double number(Map<String, Object> row, String key) {
        Object value = row.get(key);
        return value instanceof Number number ? number.doubleValue() : 0;
    }
    private static int clamp(int value, int min, int max) { return Math.max(min, Math.min(max, value)); }
}
