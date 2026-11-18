package com.greatestsnowman.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.greatestsnowman.account.AccountException;
import com.greatestsnowman.account.AccountManager;
import com.greatestsnowman.account.SnowmanLook;
import io.javalin.websocket.WsContext;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Authenticates websocket players and coordinates hosted rooms and snapshots. */
public final class RoomManager {
    private static final double TICK_SECONDS = 1.0 / 30.0;
    private final ObjectMapper mapper;
    private final AccountManager accounts;
    private final RoomCodeGenerator codeGenerator = new RoomCodeGenerator();
    private final Map<String, PlayerState> players = new ConcurrentHashMap<>();
    private final Map<String, WsContext> connections = new ConcurrentHashMap<>();
    private final Map<String, String> playerRooms = new ConcurrentHashMap<>();
    private final Map<String, GameRoom> rooms = new ConcurrentHashMap<>();
    private final Map<String, String> activeAccounts = new ConcurrentHashMap<>();
    private final Map<String, String> playerUsernames = new ConcurrentHashMap<>();
    private final Map<String, String> playerTokens = new ConcurrentHashMap<>();

    public RoomManager(ObjectMapper mapper, AccountManager accounts) {
        this.mapper = mapper;
        this.accounts = accounts;
    }

    public synchronized String connect(WsContext context, String token) {
        return connect(context, token, false);
    }

    /** A player may explicitly replace their own existing game connection. */
    public synchronized String connect(WsContext context, String token, boolean takeOver) {
        AccountManager.GameIdentity identity = accounts.gameIdentity(token);
        String accountKey = identity.username().toLowerCase(java.util.Locale.ROOT);
        String id = java.util.UUID.randomUUID().toString().replace("-", "");
        String existing = activeAccounts.putIfAbsent(accountKey, id);
        if (existing != null) {
            if (!takeOver) {
                sendRaw(context, Map.of("type", "error", "code", "DUPLICATE_SESSION",
                        "message", "This account is already playing in another window or device."));
                context.session.close();
                return null;
            }
            WsContext previousContext = connections.get(existing);
            disconnect(existing);
            if (previousContext != null) {
                try { previousContext.session.close(); }
                catch (RuntimeException ignored) { }
            }
            activeAccounts.put(accountKey, id);
        }

        PlayerState player = new PlayerState(id, identity.username(), identity.snowmanColor(), 0, 0);
        player.setLook(identity.snowmanLook());
        players.put(id, player);
        connections.put(id, context);
        playerUsernames.put(id, accountKey);
        playerTokens.put(id, token);
        sendRaw(context, Map.of("type", "welcome", "id", id, "name", player.getName()));
        return id;
    }

    public synchronized void disconnect(String playerId) {
        if (playerId == null) return;
        leaveRoom(playerId, false);
        players.remove(playerId);
        connections.remove(playerId);
        playerTokens.remove(playerId);
        String username = playerUsernames.remove(playerId);
        if (username != null) activeAccounts.remove(username, playerId);
    }

    public synchronized void handleMessage(String playerId, String rawMessage) {
        PlayerState player = players.get(playerId);
        if (player == null || rawMessage == null || rawMessage.length() > 2048) return;
        try {
            JsonNode message = mapper.readTree(rawMessage);
            switch (message.path("type").asText()) {
                case "host" -> hostRoom(playerId, message);
                case "joinRoom" -> joinRoom(playerId, message.path("roomCode").asText());
                case "ready" -> markReady(playerId, message.path("ready").asBoolean());
                case "start" -> startRoom(playerId);
                case "restart" -> restartRoom(playerId);
                case "backToLobby" -> backToLobby(playerId);
                case "leave" -> leaveRoom(playerId, true);
                case "input" -> handleInput(playerId, player, message);
                case "chargeStart" -> startCharge(playerId);
                case "throw" -> {
                    if (message.path("aimYaw").isNumber() && message.path("aimPitch").isNumber()) {
                        player.updateAimAngles(message.path("aimYaw").asDouble(), message.path("aimPitch").asDouble());
                    }
                    throwSnowball(playerId);
                }
                case "customize" -> customize(playerId, player, message);
                default -> sendError(playerId, "UNKNOWN_MESSAGE", "That room message is not supported.");
            }
        } catch (IOException | RuntimeException error) {
            sendError(playerId, "INVALID_MESSAGE", "That message could not be processed.");
        }
    }

    public synchronized void tick() {
        List<String> failedConnections = new ArrayList<>();
        for (GameRoom room : rooms.values()) {
            boolean wasInGame = "IN_GAME".equals(room.getStatus());
            room.tick(TICK_SECONDS);
            if (wasInGame && "RESULTS".equals(room.getStatus())) {
                for (PlayerState player : room.getPlayers()) {
                    try {
                        accounts.recordMatch(playerTokens.get(player.getId()), player.getScore(), player.getId().equals(room.getWinnerId()));
                    } catch (RuntimeException error) {
                        System.err.println("Could not save match result: " + error.getMessage());
                    }
                }
            }
            String payload;
            try {
                payload = mapper.writeValueAsString(room.snapshot(false));
            } catch (IOException error) {
                System.err.println("Could not encode room snapshot: " + error.getMessage());
                continue;
            }
            for (PlayerState player : room.getPlayers()) {
                WsContext context = connections.get(player.getId());
                if (context == null) continue;
                try { context.send(payload); }
                catch (RuntimeException error) { failedConnections.add(player.getId()); }
            }
        }
        failedConnections.forEach(this::disconnect);
    }

    private void hostRoom(String playerId, JsonNode message) {
        if (playerRooms.containsKey(playerId)) {
            sendError(playerId, "ALREADY_IN_ROOM", "Leave your current room before hosting another one.");
            return;
        }
        int maxPlayers = message.path("maxPlayers").asInt(4);
        int scoreGoal = message.path("scoreGoal").asInt(15);
        String mapSize = message.path("mapSize").asText("CHRISTMAS").toUpperCase(java.util.Locale.ROOT);
        if (maxPlayers < 2 || maxPlayers > 8) {
            sendError(playerId, "INVALID_SETTINGS", "Maximum players must be from 2 to 8.");
            return;
        }
        if (scoreGoal < 5 || scoreGoal > 50) {
            sendError(playerId, "INVALID_SETTINGS", "Score goal must be from 5 to 50.");
            return;
        }
        if (!List.of("CHRISTMAS", "SMALL", "MEDIUM", "LARGE").contains(mapSize)) {
            sendError(playerId, "INVALID_SETTINGS", "Choose the Christmas arena.");
            return;
        }
        String code = newRoomCode();
        GameRoom room = new GameRoom(code, playerId, maxPlayers, scoreGoal, mapSize);
        room.addPlayer(players.get(playerId));
        rooms.put(code, room);
        playerRooms.put(playerId, code);
        broadcast(room);
    }

    private void joinRoom(String playerId, String rawCode) {
        if (playerRooms.containsKey(playerId)) {
            sendError(playerId, "ALREADY_IN_ROOM", "Leave your current room before joining another one.");
            return;
        }
        String code = rawCode == null ? "" : rawCode.trim().toUpperCase(java.util.Locale.ROOT);
        GameRoom room = rooms.get(code);
        if (room == null) {
            sendError(playerId, "ROOM_NOT_FOUND", "No open room uses that code.");
            return;
        }
        if (!"LOBBY".equals(room.getStatus())) {
            sendError(playerId, "ROOM_STARTED", "That match has already started.");
            return;
        }
        if (!room.hasSpace()) {
            sendError(playerId, "ROOM_FULL", "That room is full.");
            return;
        }
        room.addPlayer(players.get(playerId));
        playerRooms.put(playerId, code);
        broadcast(room);
    }

    private void markReady(String playerId, boolean ready) {
        GameRoom room = roomFor(playerId);
        if (room == null || !"LOBBY".equals(room.getStatus())) {
            sendError(playerId, "NOT_IN_LOBBY", "Join a lobby before changing Ready.");
            return;
        }
        room.setReady(playerId, ready);
        broadcast(room);
    }

    private void startRoom(String playerId) {
        GameRoom room = roomFor(playerId);
        if (room == null) {
            sendError(playerId, "NOT_IN_ROOM", "Host or join a room first.");
            return;
        }
        if (!room.isHost(playerId)) {
            sendError(playerId, "HOST_ONLY", "Only the current host can start the match.");
            return;
        }
        if (!room.canStart()) {
            sendError(playerId, "PLAYERS_NOT_READY", "At least two players must join and everyone must be ready.");
            return;
        }
        room.start();
        broadcast(room);
    }

    private void restartRoom(String playerId) {
        GameRoom room = roomFor(playerId);
        if (room == null || !room.isHost(playerId) || !"RESULTS".equals(room.getStatus())) {
            sendError(playerId, "HOST_ONLY", "Only the host can restart a completed match.");
            return;
        }
        room.restart();
        broadcast(room);
    }

    private void backToLobby(String playerId) {
        GameRoom room = roomFor(playerId);
        if (room == null || !room.isHost(playerId) || !"RESULTS".equals(room.getStatus())) {
            sendError(playerId, "HOST_ONLY", "Only the host can return a completed match to the lobby.");
            return;
        }
        room.backToLobby();
        broadcast(room);
    }

    private void leaveRoom(String playerId, boolean notify) {
        String code = playerRooms.remove(playerId);
        GameRoom room = code == null ? null : rooms.get(code);
        if (room == null) return;
        room.removePlayer(playerId);
        if (room.isEmpty()) rooms.remove(code);
        else broadcast(room);
        if (notify) sendTo(playerId, Map.of("type", "roomLeft"));
    }

    private void handleInput(String playerId, PlayerState player, JsonNode message) {
        GameRoom room = roomFor(playerId);
        if (room == null || !"IN_GAME".equals(room.getStatus())) return;
        double legacyYaw = message.path("yaw").asDouble();
        double moveX = message.path("moveX").asDouble();
        double moveZ = message.path("moveZ").asDouble();
        boolean crouch = message.path("crouch").asBoolean(false);
        boolean dash = message.path("dash").asBoolean(false);
        if (message.has("aimYaw") && message.has("aimPitch")) {
            player.setInput(moveX, moveZ, message.path("moveYaw").asDouble(legacyYaw), legacyYaw,
                    message.path("aimYaw").asDouble(legacyYaw), message.path("aimPitch").asDouble(0),
                    message.path("aiming").asBoolean(false), crouch, dash);
        } else {
            player.setInput(moveX, moveZ, legacyYaw, crouch, dash);
        }
    }

    private void startCharge(String playerId) {
        GameRoom room = roomFor(playerId);
        if (room == null || !"IN_GAME".equals(room.getStatus())) return;
        room.startCharge(playerId);
    }

    private void throwSnowball(String playerId) {
        GameRoom room = roomFor(playerId);
        if (room == null || !"IN_GAME".equals(room.getStatus())) return;
        room.throwSnowball(playerId);
    }

    private void customize(String playerId, PlayerState player, JsonNode message) {
        try {
            SnowmanLook look = mapper.treeToValue(message.path("look"), SnowmanLook.class);
            String color = message.path("color").asText();
            if (!look.isValid() || !color.matches("#[0-9a-fA-F]{6}")) {
                sendError(playerId, "INVALID_LOOK", "Choose a valid color and snowman parts.");
                return;
            }
            accounts.update(playerTokens.get(playerId), null, null, null, color, look);
            player.setLook(look);
            player.setColor(color.toLowerCase(java.util.Locale.ROOT));
            GameRoom room = roomFor(playerId);
            if (room != null) broadcast(room);
        } catch (IOException | AccountException error) {
            sendError(playerId, "INVALID_LOOK", error.getMessage());
        }
    }

    private GameRoom roomFor(String playerId) {
        String code = playerRooms.get(playerId);
        return code == null ? null : rooms.get(code);
    }

    private String newRoomCode() {
        return codeGenerator.next(rooms::containsKey);
    }

    private void broadcast(GameRoom room) {
        String payload;
        try { payload = mapper.writeValueAsString(room.snapshot(true)); }
        catch (IOException error) { return; }
        for (PlayerState player : room.getPlayers()) {
            WsContext context = connections.get(player.getId());
            if (context == null) continue;
            try { context.send(payload); }
            catch (RuntimeException error) { disconnect(player.getId()); }
        }
    }

    private void sendError(String playerId, String code, String message) {
        sendTo(playerId, Map.of("type", "error", "code", code, "message", message));
    }

    private void sendTo(String playerId, Map<String, Object> message) {
        WsContext context = connections.get(playerId);
        if (context == null) return;
        try { context.send(mapper.writeValueAsString(message)); }
        catch (IOException | RuntimeException ignored) { }
    }

    private void sendRaw(WsContext context, Map<String, Object> message) {
        try { context.send(mapper.writeValueAsString(message)); }
        catch (IOException | RuntimeException ignored) { }
    }
}
