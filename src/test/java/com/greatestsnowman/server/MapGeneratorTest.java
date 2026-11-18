package com.greatestsnowman.server;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

class MapGeneratorTest {
    @Test
    void legacyMapSizeChoicesResolveToOneSharedChristmasArena() {
        MapGenerator generator = new MapGenerator();
        List<Map<String, Object>> maps = List.of(
                generator.generate("SMALL").snapshot(),
                generator.generate("MEDIUM").snapshot(),
                generator.generate("LARGE").snapshot());

        for (Map<String, Object> map : maps) {
            assertEquals("christmas-arena-v1", map.get("id"));
            assertEquals("CHRISTMAS", map.get("size"));
            assertEquals(144.0, map.get("worldWidth"));
            assertEquals(96.0, map.get("worldDepth"));
            assertEquals(63, ((List<?>) map.get("walls")).size());
        }
    }
}
