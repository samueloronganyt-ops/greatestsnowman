package com.greatestsnowman.account;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class AccountManagerTest {
    @TempDir Path temporaryDirectory;

    @Test
    void accountCanRegisterReadUpdatePersistLogoutAndDelete() {
        Path store = temporaryDirectory.resolve("accounts.json");
        ObjectMapper mapper = new ObjectMapper();
        AccountManager accounts = new AccountManager(store, mapper);

        Map<String, Object> registered = accounts.register("SnowFox", "snowy-password-42");
        String token = (String) registered.get("token");
        assertEquals("SnowFox", accounts.profile(token).get("username"));

        SnowmanLook look = new SnowmanLook("beanie", "striped", "golden", "twigs", "tall");
        Map<String, Object> updated = accounts.update(token, "FrostFox", null, null, "#55aacc", look);
        assertEquals("FrostFox", updated.get("username"));
        assertEquals("#55aacc", updated.get("snowmanColor"));

        AccountManager reloaded = new AccountManager(store, mapper);
        String restoredToken = (String) reloaded.login("FrostFox", "snowy-password-42").get("token");
        Map<String, Object> restoredProfile = reloaded.profile(restoredToken);
        assertEquals("FrostFox", restoredProfile.get("username"));
        assertEquals("#55aacc", restoredProfile.get("snowmanColor"));
        assertEquals(look, restoredProfile.get("snowmanLook"));
        reloaded.logout(restoredToken);
        assertThrows(AccountException.class, () -> reloaded.profile(restoredToken));

        accounts.delete(token, "snowy-password-42");
        assertThrows(AccountException.class, () -> accounts.profile(token));
        assertThrows(AccountException.class, () -> new AccountManager(store, mapper).login("FrostFox", "snowy-password-42"));
    }

    @Test
    void duplicateUsernamesAndWrongPasswordsAreRejected() {
        AccountManager accounts = new AccountManager(temporaryDirectory.resolve("accounts.json"), new ObjectMapper());
        accounts.register("SnowFox", "snowy-password-42");
        assertEquals(409, assertThrows(AccountException.class,
                () -> accounts.register("snowfox", "another-password")).getStatusCode());
        assertEquals(401, assertThrows(AccountException.class,
                () -> accounts.login("SnowFox", "incorrect-password")).getStatusCode());
    }
}
