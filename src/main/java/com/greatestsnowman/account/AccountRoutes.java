package com.greatestsnowman.account;

import io.javalin.config.JavalinConfig;
import io.javalin.http.Context;

import java.util.Map;

/** HTTP endpoints for account registration, authentication, profile, and logout. */
public final class AccountRoutes {
    private final AccountManager accounts;

    public AccountRoutes(AccountManager accounts) { this.accounts = accounts; }

    public void register(JavalinConfig config) {
        config.routes.post("/api/accounts/register", context -> respond(context, () -> {
            AccountRequest request = context.bodyAsClass(AccountRequest.class);
            context.status(201).json(accounts.register(request.username(), request.password()));
        }));
        config.routes.post("/api/accounts/login", context -> respond(context, () -> {
            AccountRequest request = context.bodyAsClass(AccountRequest.class);
            context.json(accounts.login(request.username(), request.password()));
        }));
        config.routes.get("/api/accounts/profile", context -> respond(context, () ->
                context.json(accounts.profile(bearerToken(context)))));
        config.routes.put("/api/accounts/profile", context -> respond(context, () -> {
            UpdateRequest request = context.bodyAsClass(UpdateRequest.class);
            context.json(accounts.update(bearerToken(context), request.username(), request.currentPassword(),
                    request.newPassword(), request.snowmanColor(), request.snowmanLook()));
        }));
        config.routes.delete("/api/accounts/profile", context -> respond(context, () -> {
            DeleteRequest request = context.bodyAsClass(DeleteRequest.class);
            accounts.delete(bearerToken(context), request.password());
            context.status(204);
        }));
        config.routes.post("/api/accounts/logout", context -> respond(context, () -> {
            accounts.logout(bearerToken(context));
            context.status(204);
        }));
    }

    private String bearerToken(Context context) {
        String value = context.header("Authorization");
        if (value == null || !value.startsWith("Bearer ")) return null;
        return value.substring("Bearer ".length()).trim();
    }

    private void respond(Context context, Runnable action) {
        try {
            action.run();
        } catch (AccountException error) {
            context.status(error.getStatusCode()).json(Map.of("error", error.getMessage()));
        } catch (Exception error) {
            context.status(400).json(Map.of("error", "The request could not be processed."));
        }
    }

    public record AccountRequest(String username, String password) { }
    public record UpdateRequest(String username, String currentPassword, String newPassword,
                                String snowmanColor, SnowmanLook snowmanLook) { }
    public record DeleteRequest(String password) { }
}
