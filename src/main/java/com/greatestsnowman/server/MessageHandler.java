package com.greatestsnowman.server;

import com.greatestsnowman.account.AccountException;
import io.javalin.config.JavalinConfig;
import io.javalin.websocket.WsContext;

/** Connects WebSocket events to validated room methods. */
public final class MessageHandler {
    private final RoomManager rooms;
    public MessageHandler(RoomManager rooms) { this.rooms = rooms; }

    public void register(JavalinConfig config) {
        config.routes.ws("/ws", socket -> {
            socket.onConnect(context -> {
                try {
                    boolean takeover = Boolean.parseBoolean(context.queryParam("takeover"));
                    context.attribute("playerId", rooms.connect(context, context.queryParam("token"), takeover));
                } catch (AccountException error) {
                    context.send("{\"type\":\"error\",\"code\":\"AUTH_REQUIRED\",\"message\":\"" + error.getMessage() + "\"}");
                    context.session.close();
                }
            });
            socket.onMessage(context -> rooms.handleMessage(playerId(context), context.message()));
            socket.onClose(context -> rooms.disconnect(playerId(context)));
            socket.onError(context -> rooms.disconnect(playerId(context)));
        });
    }

    private String playerId(WsContext context) { return context.attribute("playerId"); }
}
