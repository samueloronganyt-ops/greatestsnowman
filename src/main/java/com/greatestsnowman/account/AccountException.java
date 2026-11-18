package com.greatestsnowman.account;

/** Validation or authentication failure that can be returned as an HTTP response. */
public final class AccountException extends RuntimeException {
    private final int statusCode;

    public AccountException(int statusCode, String message) {
        super(message);
        this.statusCode = statusCode;
    }

    public int getStatusCode() { return statusCode; }
}
