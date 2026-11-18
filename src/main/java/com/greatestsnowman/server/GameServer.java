package com.greatestsnowman.server;

import com.greatestsnowman.account.AccountManager;
import com.greatestsnowman.account.AccountRoutes;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.javalin.Javalin;
import io.javalin.http.staticfiles.Location;

import java.net.Inet4Address;
import java.net.NetworkInterface;
import java.util.Collections;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/** Starts the client web server and authoritative 30 Hz game tick. */
public final class GameServer {
    private static final int PORT = Integer.parseInt(System.getenv().getOrDefault("PORT", "8080"));
    private GameServer() { }

    public static void main(String[] args) {
        ObjectMapper mapper = new ObjectMapper();
        AccountManager accountManager = new AccountManager(java.nio.file.Path.of("data", "accounts.json"), mapper);
        RoomManager rooms = new RoomManager(mapper, accountManager);
        MessageHandler messages = new MessageHandler(rooms);
        AccountRoutes accounts = new AccountRoutes(accountManager);
        Javalin server = Javalin.create(config -> {
            config.staticFiles.add("client/dist", Location.EXTERNAL);
            messages.register(config);
            accounts.register(config);
            config.routes.get("/health", context -> context.json(java.util.Map.of("status", "ok")));
        });
        server.start("0.0.0.0", PORT);
        Executors.newSingleThreadScheduledExecutor(runnable -> {
            Thread thread = new Thread(runnable, "authoritative-game-tick");
            thread.setDaemon(true);
            return thread;
        }).scheduleAtFixedRate(rooms::tick, 0, 33, TimeUnit.MILLISECONDS);
        System.out.println("The Greatest Snowman server is ready.");
        System.out.println("Local URL: http://localhost:" + PORT);
        System.out.println("LAN URL:   http://" + findLanAddress() + ":" + PORT);
        System.out.println("WebSocket: ws://<host-IP>:" + PORT + "/ws");
    }

    private static String findLanAddress() {
        try {
            for (var interfaces = Collections.list(NetworkInterface.getNetworkInterfaces()).iterator(); interfaces.hasNext();) {
                NetworkInterface network = interfaces.next();
                if (!network.isUp() || network.isLoopback()) continue;
                for (var addresses = Collections.list(network.getInetAddresses()).iterator(); addresses.hasNext();) {
                    var address = addresses.next();
                    if (address instanceof Inet4Address && !address.isLoopbackAddress()) return address.getHostAddress();
                }
            }
        } catch (Exception error) {
            System.err.println("Could not detect LAN address: " + error.getMessage());
        }
        return "<host-LAN-IP>";
    }
}
