package com.greatestsnowman.server;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class ChristmasArenaTest {
    @Test
    void sharedJsonLoadsAndPassesSymmetryClearanceReachabilityAndLineOfSightRules() {
        MapDefinition definition = MapDefinition.load();
        Map<String, Object> arena = definition.snapshot();
        MapValidator.Report report = MapValidator.validate(arena);

        assertTrue(report.isValid(), String.join("\n", report.issues()));
        assertEquals(63, report.colliderCount());
        assertEquals(4.9, report.minimumCorridorWorld(), 1e-9);
        assertEquals(8, ((List<?>) arena.get("spawns")).size());
        assertEquals(7, ((List<?>) arena.get("pickupSpawns")).size());
        assertEquals(2, ((List<?>) arena.get("pads")).size());
        assertEquals("center-legendary", ((Map<?, ?>) ((List<?>) arena.get("pickupSpawns")).get(0)).get("id"));
        assertEquals("EXTRA_LIFE", ((Map<?, ?>) ((List<?>) arena.get("pickupSpawns")).get(0)).get("type"));
        assertEquals(4.13, arena.get("classicSnowmanHeight"));
    }

    @Test
    void perimeterSegmentsAndPillarsMeetAtEdgesWithoutGapsOrOverlaps() {
        List<Map<String, Object>> walls = MapDefinition.load().getWalls();
        assertEquals(63, walls.size());
        assertEquals(20, walls.stream().filter(wall -> "PILLAR".equals(wall.get("type"))).count());
        assertEquals(20, walls.stream().filter(wall -> "PERIMETER".equals(wall.get("type"))).count());
        assertEquals(2, walls.stream().filter(wall -> "SIDE_POST".equals(wall.get("type"))).count());
        assertEquals(4, walls.stream().filter(wall -> "PINE".equals(wall.get("type"))).count());
    }

    @Test
    void sharedJsonScalesTheSameRepresentativeCollidersAsTheClient() {
        List<Map<String, Object>> walls = MapDefinition.load().getWalls();
        Map<String, Object> pillar = walls.stream().filter(wall -> "perimeter-pillar-h-north-0".equals(wall.get("id")))
                .findFirst().orElseThrow();
        Map<String, Object> cover = walls.stream().filter(wall -> "long-cover+x-z".equals(wall.get("id")))
                .findFirst().orElseThrow();
        assertArrayEquals(new double[]{-69, -45, 6, 6, 7.434}, dimensions(pillar), 1e-9);
        assertArrayEquals(new double[]{29, -11, 28, 5, 2.478}, dimensions(cover), 1e-9);
    }

    private static double[] dimensions(Map<String, Object> wall) {
        return new double[]{((Number) wall.get("x")).doubleValue(), ((Number) wall.get("z")).doubleValue(),
                ((Number) wall.get("width")).doubleValue(), ((Number) wall.get("depth")).doubleValue(),
                ((Number) wall.get("height")).doubleValue()};
    }
}
