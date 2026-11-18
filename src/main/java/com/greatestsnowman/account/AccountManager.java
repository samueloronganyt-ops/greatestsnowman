package com.greatestsnowman.account;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Account CRUD, salted password hashing, local persistence, and login sessions. */
public final class AccountManager {
    private static final int SALT_BYTES = 16;
    private static final int HASH_BITS = 256;
    private static final int HASH_ITERATIONS = 210_000;
    private static final String DEFAULT_COLOR = "#69a9e8";
    private final Path storageFile;
    private final ObjectMapper mapper;
    private final SecureRandom random = new SecureRandom();
    private final Map<String, Account> accounts = new HashMap<>();
    private final Map<String, String> sessions = new ConcurrentHashMap<>();

    public AccountManager(Path storageFile, ObjectMapper mapper) {
        this.storageFile = storageFile;
        this.mapper = mapper;
        load();
    }

    public synchronized Map<String, Object> register(String username, String password) {
        String cleanUsername = validateUsername(username);
        validatePassword(password);
        String key = keyFor(cleanUsername);
        if (accounts.containsKey(key)) throw new AccountException(409, "That username is already taken.");
        byte[] salt = new byte[SALT_BYTES];
        random.nextBytes(salt);
        Account account = new Account(cleanUsername, encode(salt), hash(password, salt), DEFAULT_COLOR);
        accounts.put(key, account);
        save();
        return createSession(account);
    }

    public synchronized Map<String, Object> login(String username, String password) {
        String cleanUsername = username == null ? "" : username.trim();
        String cleanPassword = password == null ? "" : password;
        if (cleanUsername.isEmpty() || cleanPassword.isEmpty()) {
            throw new AccountException(400, "Enter both username and password.");
        }
        Account account = accounts.get(keyFor(cleanUsername));
        if (account == null || !passwordMatches(account, cleanPassword)) {
            throw new AccountException(401, "Username or password is incorrect.");
        }
        return createSession(account);
    }

    public synchronized Map<String, Object> profile(String token) {
        return profileMap(requireSession(token));
    }

    public synchronized Map<String, Object> update(String token, String newUsername,
                                                    String currentPassword, String newPassword,
                                                    String snowmanColor, SnowmanLook snowmanLook) {
        Account account = requireSession(token);
        String oldKey = keyFor(account.getUsername());
        String cleanUsername = account.getUsername();

        if (newUsername != null && !newUsername.isBlank()) {
            cleanUsername = validateUsername(newUsername);
            String newKey = keyFor(cleanUsername);
            if (!oldKey.equals(newKey) && accounts.containsKey(newKey)) {
                throw new AccountException(409, "That username is already taken.");
            }
        }
        if (newPassword != null && !newPassword.isEmpty()) {
            if (currentPassword == null || !passwordMatches(account, currentPassword)) {
                throw new AccountException(401, "Enter your current password to change it.");
            }
            validatePassword(newPassword);
        }
        if (snowmanColor != null && !snowmanColor.isBlank() && !snowmanColor.matches("#[0-9a-fA-F]{6}")) {
            throw new AccountException(400, "Choose a valid six-digit color such as #69a9e8.");
        }
        if (snowmanLook != null && !snowmanLook.isValid()) {
            throw new AccountException(400, "Choose snowman parts from the listed lobby options.");
        }

        accounts.remove(oldKey);
        account.setUsername(cleanUsername);
        if (snowmanColor != null && !snowmanColor.isBlank()) account.setSnowmanColor(snowmanColor.toLowerCase());
        if (snowmanLook != null) account.setSnowmanLook(snowmanLook);
        if (newPassword != null && !newPassword.isEmpty()) {
            byte[] salt = new byte[SALT_BYTES];
            random.nextBytes(salt);
            account.setPassword(encode(salt), hash(newPassword, salt));
        }
        accounts.put(keyFor(cleanUsername), account);
        String newKey = keyFor(cleanUsername);
        sessions.replaceAll((session, user) -> user.equals(oldKey) ? newKey : user);
        save();
        return profileMap(account);
    }

    public synchronized void delete(String token, String password) {
        Account account = requireSession(token);
        if (password == null || !passwordMatches(account, password)) {
            throw new AccountException(401, "Enter your password to delete this account.");
        }
        accounts.remove(keyFor(account.getUsername()));
        sessions.entrySet().removeIf(entry -> entry.getValue().equals(keyFor(account.getUsername())));
        save();
    }

    public void logout(String token) {
        if (token == null || sessions.remove(token) == null) {
            throw new AccountException(401, "You are already logged out.");
        }
    }

    private Map<String, Object> createSession(Account account) {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        sessions.put(token, keyFor(account.getUsername()));
        return Map.of("token", token, "profile", profileMap(account));
    }

    private Account requireSession(String token) {
        String key = token == null ? null : sessions.get(token);
        Account account = key == null ? null : accounts.get(key);
        if (account == null) throw new AccountException(401, "Please log in to continue.");
        return account;
    }

    private Map<String, Object> profileMap(Account account) {
        return Map.of("username", account.getUsername(), "wins", account.getWins(),
                "totalScore", account.getTotalScore(), "gamesPlayed", account.getGamesPlayed(),
                "achievements", account.getAchievements(), "snowmanColor", account.getSnowmanColor(),
                "snowmanLook", account.getSnowmanLook());
    }

    public synchronized GameIdentity gameIdentity(String token) {
        Account account = requireSession(token);
        return new GameIdentity(account.getUsername(), account.getSnowmanColor(), account.getSnowmanLook());
    }

    /** Persist one completed multiplayer match to the player's profile. */
    public synchronized void recordMatch(String token, int score, boolean won) {
        Account account = requireSession(token);
        account.addMatchResult(score, won);
        save();
    }

    public record GameIdentity(String username, String snowmanColor, SnowmanLook snowmanLook) { }

    private boolean passwordMatches(Account account, String password) {
        byte[] salt = decode(account.getSalt());
        byte[] expected = decode(account.getPasswordHash());
        byte[] actual = decode(hash(password, salt));
        return MessageDigest.isEqual(expected, actual);
    }

    private String hash(String password, byte[] salt) {
        PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, HASH_ITERATIONS, HASH_BITS);
        try {
            return encode(SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded());
        } catch (GeneralSecurityException error) {
            throw new IllegalStateException("Password hashing is not available on this Java runtime.", error);
        } finally {
            spec.clearPassword();
        }
    }

    private String validateUsername(String username) {
        String clean = username == null ? "" : username.trim();
        if (!clean.matches("[A-Za-z0-9_]{3,18}")) {
            throw new AccountException(400, "Username must be 3-18 characters using letters, numbers, or underscore.");
        }
        return clean;
    }

    private void validatePassword(String password) {
        if (password == null || password.length() < 8 || password.length() > 128) {
            throw new AccountException(400, "Password must be between 8 and 128 characters.");
        }
    }

    private String keyFor(String username) { return username.toLowerCase(java.util.Locale.ROOT); }
    private String encode(byte[] bytes) { return Base64.getEncoder().encodeToString(bytes); }
    private byte[] decode(String value) { return Base64.getDecoder().decode(value); }

    private void load() {
        if (!Files.exists(storageFile)) return;
        try {
            List<Account> loaded = mapper.readValue(storageFile.toFile(), new TypeReference<>() { });
            for (Account account : loaded) accounts.put(keyFor(account.getUsername()), account);
        } catch (IOException | RuntimeException error) {
            throw new IllegalStateException("Could not read account data at " + storageFile.toAbsolutePath(), error);
        }
    }

    private void save() {
        try {
            Path parent = storageFile.toAbsolutePath().getParent();
            Files.createDirectories(parent);
            Path temporary = Files.createTempFile(parent, "accounts-", ".tmp");
            try {
                mapper.writerWithDefaultPrettyPrinter().writeValue(temporary.toFile(), new ArrayList<>(accounts.values()));
                try {
                    Files.move(temporary, storageFile, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
                } catch (AtomicMoveNotSupportedException ignored) {
                    Files.move(temporary, storageFile, StandardCopyOption.REPLACE_EXISTING);
                }
            } finally {
                Files.deleteIfExists(temporary);
            }
        } catch (IOException error) {
            throw new IllegalStateException("Could not save account data at " + storageFile.toAbsolutePath(), error);
        }
    }
}
