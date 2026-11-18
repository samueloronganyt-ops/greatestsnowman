package com.greatestsnowman.account;

import com.fasterxml.jackson.annotation.JsonIgnore;

/** Saved appearance choices and the allowed values shown in the lobby editor. */
public record SnowmanLook(String hat, String scarf, String nose, String arms, String body) {
    public static SnowmanLook defaults() {
        return new SnowmanLook("top-hat", "classic", "carrot", "twigs", "classic");
    }

    @JsonIgnore
    public boolean isValid() {
        return contains("top-hat", "beanie", "crown", "none", hat)
                && contains("classic", "striped", "bowtie", "none", scarf)
                && contains("carrot", "button", "golden", nose)
                && contains("twigs", "candy-canes", "none", arms)
                && contains("classic", "wide", "tall", body);
    }

    private boolean contains(String a, String b, String c, String value) {
        return a.equals(value) || b.equals(value) || c.equals(value);
    }

    private boolean contains(String a, String b, String c, String d, String value) {
        return a.equals(value) || b.equals(value) || c.equals(value) || d.equals(value);
    }
}
