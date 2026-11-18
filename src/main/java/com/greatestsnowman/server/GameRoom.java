package com.greatestsnowman.server;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;

/** One hosted room and its lobby settings, membership, and ready state. */
public final class GameRoom {
    private final String code;
    private final int maxPlayers;
    private final int scoreGoal;
    private final String mapSize;
    private final ArenaMap arena;
    private final CollisionSystem collisions = new CollisionSystem();
    private final Map<String, PlayerState> players = new LinkedHashMap<>();
    private final List<SnowballState> snowballs = new ArrayList<>();
    private final List<Map<String, Object>> effects = new ArrayList<>();
    private final List<PowerUp> powerUps = new ArrayList<>();
    private final Set<String> readyPlayers = new LinkedHashSet<>();
    private String hostId;
    private String status = "LOBBY";
    private String winnerId;
    private long nextPowerUpAt;
    private int spawnRotation;
    private int pickupSpawnCursor;

    public GameRoom(String code, String hostId, int maxPlayers, int scoreGoal, String mapSize) {
        this.code = code;
        this.hostId = hostId;
        this.maxPlayers = maxPlayers;
        this.scoreGoal = scoreGoal;
        this.mapSize = "CHRISTMAS";
        this.arena = new MapGenerator().generate(mapSize);
    }

    public String getCode() { return code; }
    public int getMaxPlayers() { return maxPlayers; }
    public String getWinnerId() { return winnerId; }
    public String getStatus() { return status; }
    public ArenaMap getArena() { return arena; }
    public boolean isEmpty() { return players.isEmpty(); }
    public boolean contains(String playerId) { return players.containsKey(playerId); }
    public boolean isHost(String playerId) { return hostId.equals(playerId); }
    public PlayerState getPlayer(String playerId) { return players.get(playerId); }
    public List<PlayerState> getPlayers() { return new ArrayList<>(players.values()); }

    public boolean hasSpace() { return players.size() < maxPlayers; }

    public void addPlayer(PlayerState player) {
        int seat = players.size();
        arena.placeAtSpawn(player, seat);
        players.put(player.getId(), player);
        if (isHost(player.getId())) readyPlayers.add(player.getId());
    }

    public String removePlayer(String playerId) {
        players.remove(playerId);
        readyPlayers.remove(playerId);
        if (hostId.equals(playerId) && !players.isEmpty()) {
            hostId = players.keySet().iterator().next();
        }
        return hostId;
    }

    public void setReady(String playerId, boolean ready) {
        if (ready) readyPlayers.add(playerId);
        else readyPlayers.remove(playerId);
    }

    public boolean allReady() {
        return players.size() >= 2 && readyPlayers.containsAll(players.keySet());
    }

    public boolean canStart() { return "LOBBY".equals(status) && allReady(); }
    public void start() {
        int seat = 0;
        for (PlayerState player : players.values()) {
            arena.placeAtSpawn(player, seat++, spawnRotation);
            player.resetForMatch();
        }
        spawnRotation = (spawnRotation + 1) % arena.getSpawnCount();
        snowballs.clear();
        effects.clear();
        powerUps.clear();
        pickupSpawnCursor = 0;
        winnerId = null;
        for (int i = 0; i < 5; i++) spawnPowerUp();
        nextPowerUpAt = System.currentTimeMillis() + 6500;
        status = "IN_GAME";
    }

    public void restart() { start(); }

    public void backToLobby() {
        status = "LOBBY";
        powerUps.clear();
        snowballs.clear();
        effects.clear();
        winnerId = null;
        players.values().forEach(PlayerState::resetForMatch);
        readyPlayers.clear();
        if (players.containsKey(hostId)) readyPlayers.add(hostId);
    }

    public void startCharge(String playerId) {
        PlayerState player = players.get(playerId);
        if (player != null && "IN_GAME".equals(status) && player.startCharge()) {
            addEvent("throwStart", playerId, player.getX(), player.getZ());
        }
    }

    public void throwSnowball(String playerId) {
        PlayerState player = players.get(playerId);
        if (player == null || !"IN_GAME".equals(status)) return;
        long owned = snowballs.stream().filter(ball -> ball.getOwnerId().equals(playerId)).count();
        if (owned >= 3) {
            player.releaseCharge();
            return;
        }
        double chargeSeconds = player.releaseCharge();
        if (chargeSeconds < 0) return;
        double[] hand = throwHandPosition(player);
        double horizontalAim = Math.cos(player.getAimPitch());
        double aimDistance = player.hasAimInput() ? AimResolver.MAX_DISTANCE : 4.0;
        // Legacy callers aim from the body center. Modern releases send only
        // release-frame angles, so their direction is rebuilt at the hand.
        double aimOriginX = player.hasAimInput() ? hand[0] : player.getX();
        double aimOriginY = hand[1];
        double aimOriginZ = player.hasAimInput() ? hand[2] : player.getZ();
        double targetX = aimOriginX + Math.sin(player.getAimYaw()) * horizontalAim * aimDistance;
        double targetY = aimOriginY + Math.sin(player.getAimPitch()) * aimDistance;
        double targetZ = aimOriginZ + Math.cos(player.getAimYaw()) * horizontalAim * aimDistance;
        AimResolver.Direction direction = AimResolver.resolve(hand[0], hand[1], hand[2],
                targetX, targetY, targetZ, player.getAimYaw());
        double[] launch = safeLaunchPosition(hand, direction, 0.36, 0.32);
        if (launch == null) return;
        double range = Math.max(0.5, direction.distance() - 0.36);
        // Charge is wound up before release; the projectile leaves the hand on the release frame.
        double launchDelay = 0;
        snowballs.add(new SnowballState(playerId,
                launch[0], launch[2], launch[1], direction.yaw(), direction.pitch(),
                chargeSeconds, range, launchDelay));
    }

    /** Advance authoritative movement, projectiles, collisions, damage, and respawns. */
    public void tick(double seconds) {
        if (!"IN_GAME".equals(status)) return;
        for (PlayerState player : players.values()) {
            MovementState previousState = player.getMovementState();
            boolean wasAlive = player.isAlive();
            boolean dashStarted = player.tick(seconds, arena, collisions);
            if (previousState != player.getMovementState()) {
                addEvent("stance", player.getId(), player.getX(), player.getZ());
            }
            if (dashStarted) addEvent("dash", player.getId(), player.getX(), player.getZ());
            if (!wasAlive && player.isAlive()) addEvent("respawn", player.getId(), player.getX(), player.getZ());
        }
        Iterator<SnowballState> iterator = snowballs.iterator();
        while (iterator.hasNext()) {
            SnowballState ball = iterator.next();
            if (!ball.isLaunched()) {
                PlayerState owner = players.get(ball.getOwnerId());
                if (owner != null && owner.hasAimInput()) {
                    double[] hand = throwHandPosition(owner);
                    double horizontalAim = Math.cos(owner.getAimPitch());
                    double targetX = hand[0] + Math.sin(owner.getAimYaw()) * horizontalAim * 32;
                    double targetY = hand[1] + Math.sin(owner.getAimPitch()) * 32;
                    double targetZ = hand[2] + Math.cos(owner.getAimYaw()) * horizontalAim * 32;
                    AimResolver.Direction direction = AimResolver.resolve(hand[0], hand[1], hand[2],
                            targetX, targetY, targetZ, owner.getAimYaw());
                    double[] launch = safeLaunchPosition(hand, direction, 0.36, ball.getHitRadius());
                    if (launch == null) { iterator.remove(); continue; }
                    ball.updatePendingDirection(launch[0], launch[1], launch[2],
                            direction.yaw(), direction.pitch(), ball.getMaxTravel());
                }
            }
            double oldX = ball.getX();
            double oldZ = ball.getZ();
            ball.advance(seconds);
            if (ball.isRemoved()) { iterator.remove(); continue; }
            if (ball.consumeLaunchEvent()) {
                addEffect("throwRelease", ball.getX(), ball.getZ(), 0, ball.getOwnerId(), ball.isCritical());
            }
            if (!ball.isLaunched()) continue;
            if (collisions.bounceSnowball(arena, ball, oldX, oldZ)) {
                if (ball.isRemoved() || ball.hasReachedTarget()) iterator.remove();
                continue;
            }
            PlayerState directHit = null;
            for (PlayerState target : players.values()) {
                if (!AimResolver.canHitPlayer(ball.getOwnerId(), target.getId())
                        || !target.isAlive() || target.isInvulnerable()) continue;
                if (target.intersects(ball)) {
                    directHit = target;
                    break;
                }
            }
            if (directHit != null) {
                PlayerState attacker = players.get(ball.getOwnerId());
                if (ball.isCritical()) {
                    for (PlayerState target : players.values()) {
                        if (!AimResolver.canHitPlayer(ball.getOwnerId(), target.getId()) || !target.isAlive()) continue;
                        double distance = Math.hypot(target.getX() - directHit.getX(), target.getZ() - directHit.getZ());
                        if (distance > ball.getBlastRadius() || target.isInvulnerable()) continue;
                        double damage = (target == directHit ? ball.getDamage() : ball.getDamage() * 0.55)
                                * (attacker == null ? 1.0 : attacker.getDamageMultiplier());
                        if (target.takeDamage(damage) && attacker != null) attacker.addScore();
                    }
                } else if (directHit.takeDamage(ball.getDamage()
                        * (attacker == null ? 1.0 : attacker.getDamageMultiplier())) && attacker != null) {
                    attacker.addScore();
                }
                addEffect(ball.isCritical() ? "criticalHit" : "snowballHit",
                        directHit.getX(), directHit.getZ(), ball.isCritical() ? ball.getBlastRadius() : 0.8,
                        directHit.getId(), ball.isCritical(), ball.getOwnerId());
                ball.remove();
                iterator.remove();
            } else if (ball.hasReachedTarget()) {
                iterator.remove();
            }
        }
        collectPowerUps();
        long nowForPickups = System.currentTimeMillis();
        if (powerUps.size() < 5 && nowForPickups >= nextPowerUpAt) {
            spawnPowerUp();
            nextPowerUpAt = nowForPickups + 6500;
        }
        for (PlayerState player : players.values()) {
            if (player.getScore() >= scoreGoal) {
                winnerId = player.getId();
                status = "RESULTS";
                powerUps.clear();
                snowballs.clear();
                break;
            }
        }
        long now = System.currentTimeMillis();
        effects.removeIf(effect -> now - ((Number) effect.get("createdAt")).longValue() > 1400);
    }

    private void collectPowerUps() {
        Iterator<PowerUp> iterator = powerUps.iterator();
        while (iterator.hasNext()) {
            PowerUp pickup = iterator.next();
            PlayerState collector = null;
            for (PlayerState player : players.values()) {
                if (player.isAlive() && Math.hypot(player.getX() - pickup.getX(), player.getZ() - pickup.getZ()) < 1.65) {
                    collector = player;
                    break;
                }
            }
            if (collector != null) {
                pickup.applyTo(collector);
                addEffect("powerUp", pickup.getX(), pickup.getZ(), 1.4);
                iterator.remove();
            }
        }
    }

    private void spawnPowerUp() {
        String[] types = {"SPEED", "STRONG", "SHIELD", "HEAL", "EXTRA_LIFE"};
        List<MapDefinition.PickupSpawn> spawns = arena.getPickupSpawns();
        for (int attempt = 0; attempt < spawns.size(); attempt++) {
            MapDefinition.PickupSpawn spawn = spawns.get(pickupSpawnCursor++ % spawns.size());
            if (powerUps.stream().anyMatch(pickup -> pickup.getSpawnId().equals(spawn.getId()))) continue;
            if (collisions.playerBlocked(arena, spawn.getX(), spawn.getZ(), 1.75)) continue;
            String type = spawn.getType() != null ? spawn.getType() : types[ThreadLocalRandom.current().nextInt(types.length)];
            powerUps.add(PowerUp.create(type, spawn.getX(), spawn.getZ(), spawn.getRarity(), spawn.getId()));
            return;
        }
    }

    /** Resolve the server-authoritative equivalent of the rig's release hand anchor. */
    private double[] throwHandPosition(PlayerState player) {
        ThrowHandResolver.Position hand = ThrowHandResolver.resolve(player);
        return new double[] { hand.x(), hand.y(), hand.z() };
    }

    /** Moves the spawn point forward from the hand, backing it out if a wall occupies it. */
    private double[] safeLaunchPosition(double[] hand, AimResolver.Direction direction,
                                        double forwardOffset, double radius) {
        for (int attempt = 0; attempt <= 8; attempt++) {
            double offset = forwardOffset - attempt * 0.18;
            double x = hand[0] + direction.x() * offset;
            double y = hand[1] + direction.y() * offset;
            double z = hand[2] + direction.z() * offset;
            boolean blocked = false;
            for (Map<String, Object> wall : arena.getWalls()) {
                if (AimResolver.wallBlocksSegment(wall, x, y, z, x, y, z, radius)) {
                    blocked = true;
                    break;
                }
            }
            if (!blocked) return new double[] { x, Math.max(0.1, y), z };
        }
        return null;
    }

    private void addEffect(String type, double x, double z, double radius) {
        addEffect(type, x, z, radius, null);
    }

    private void addEffect(String type, double x, double z, double radius, String playerId) {
        addEffect(type, x, z, radius, playerId, false);
    }

    private void addEffect(String type, double x, double z, double radius, String playerId, boolean critical) {
        addEffect(type, x, z, radius, playerId, critical, null);
    }

    private void addEffect(String type, double x, double z, double radius, String playerId,
                           boolean critical, String ownerId) {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("id", java.util.UUID.randomUUID().toString());
        event.put("type", type);
        event.put("x", x);
        event.put("z", z);
        event.put("radius", radius);
        event.put("createdAt", System.currentTimeMillis());
        if (playerId != null) event.put("playerId", playerId);
        if (ownerId != null) event.put("ownerId", ownerId);
        if ("throwRelease".equals(type)) event.put("critical", critical);
        effects.add(event);
    }

    private void addEvent(String type, String playerId, double x, double z) {
        addEffect(type, x, z, 0, playerId);
    }

    public Map<String, Object> snapshot(boolean includeArena) {
        List<Map<String, Object>> playerRows = new ArrayList<>();
        players.values().forEach(player -> {
            var look = player.getLook();
            Map<String, String> lookFields = Map.of("hat", look.hat(), "scarf", look.scarf(),
                    "nose", look.nose(), "arms", look.arms(), "body", look.body());
            Map<String, Object> row = new LinkedHashMap<>(Map.ofEntries(
                    Map.entry("id", player.getId()), Map.entry("name", player.getName()),
                    Map.entry("color", player.getColor()), Map.entry("x", player.getX()),
                    Map.entry("z", player.getZ()), Map.entry("yaw", player.getYaw()),
                    Map.entry("aimYaw", player.getAimYaw()), Map.entry("aimPitch", player.getAimPitch()),
                    Map.entry("aiming", player.isAiming()), Map.entry("look", lookFields),
                    Map.entry("ready", readyPlayers.contains(player.getId())),
                    Map.entry("host", isHost(player.getId()))));
            row.put("health", player.getHealth());
            row.put("score", player.getScore());
            row.put("charging", player.isCharging());
            row.put("charge", player.getChargeRatio());
            row.put("respawnSeconds", player.getRespawnSeconds());
            row.put("movementState", player.getMovementState().name());
            row.put("stanceState", player.getStanceState().name());
            row.put("dashCooldownSeconds", player.getDashCooldownSeconds());
            row.put("hitboxHeight", player.getHitboxHeight());
            row.put("invulnerable", player.isInvulnerable());
            row.put("powerUpStatus", player.powerUpSnapshot());
            playerRows.add(row);
        });
        Map<String, Object> result = new LinkedHashMap<>(Map.of("type", "roomState", "roomCode", code, "maxPlayers", maxPlayers,
                "scoreGoal", scoreGoal, "mapSize", mapSize, "status", status,
                "hostId", hostId, "canStart", canStart(), "players", playerRows));
        result.put("snowballs", snowballs.stream().map(SnowballState::snapshot).toList());
        result.put("powerUps", powerUps.stream().map(PowerUp::snapshot).toList());
        result.put("winnerId", winnerId);
        result.put("effects", List.copyOf(effects));
        result.put("movementConfig", MovementConfig.snapshot());
        if (includeArena) result.put("arena", arena.snapshot());
        return result;
    }
}
