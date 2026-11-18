package com.greatestsnowman.server;

/** Legacy construction facade; all room sizes now load the same shared Christmas map. */
public final class MapGenerator {
    public ArenaMap generate(String ignoredLegacySize) {
        return new ArenaMap(MapDefinition.load());
    }
}
