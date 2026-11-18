package com.greatestsnowman.server;

import java.security.SecureRandom;
import java.util.function.Predicate;

/** Generates short room invitations without ambiguous characters. */
public final class RoomCodeGenerator {
    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int CODE_LENGTH = 5;
    private final SecureRandom random;

    public RoomCodeGenerator() { this(new SecureRandom()); }

    RoomCodeGenerator(SecureRandom random) { this.random = random; }

    public String next(Predicate<String> alreadyExists) {
        String code;
        do {
            StringBuilder value = new StringBuilder(CODE_LENGTH);
            for (int i = 0; i < CODE_LENGTH; i++) {
                value.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
            }
            code = value.toString();
        } while (alreadyExists.test(code));
        return code;
    }
}
