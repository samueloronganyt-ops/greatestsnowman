package com.greatestsnowman.server;

import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class RoomCodeGeneratorTest {
    @Test
    void codesAreFiveCharactersUniqueAndAvoidAmbiguousLetters() {
        RoomCodeGenerator generator = new RoomCodeGenerator();
        Set<String> allocated = new HashSet<>();
        for (int i = 0; i < 1000; i++) {
            String code = generator.next(allocated::contains);
            assertTrue(code.matches("[A-HJ-NP-Z2-9]{5}"), code);
            assertTrue(allocated.add(code), "Duplicate invitation code: " + code);
        }
    }

    @Test
    void codeGeneratorRetriesAnExistingCode() {
        java.util.concurrent.atomic.AtomicInteger calls = new java.util.concurrent.atomic.AtomicInteger();
        RoomCodeGenerator generator = new RoomCodeGenerator(new java.security.SecureRandom() {
            private static final long serialVersionUID = 1L;
            @Override public int nextInt(int bound) { return calls.getAndIncrement() < 5 ? 0 : 1; }
        });
        assertEquals("BBBBB", generator.next("AAAAA"::equals));
    }
}
