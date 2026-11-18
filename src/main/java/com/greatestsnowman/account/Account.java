package com.greatestsnowman.account;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.ArrayList;
import java.util.List;

/** Persistent account data. Password material is stored only as a salted hash. */
@JsonIgnoreProperties(ignoreUnknown = true)
public final class Account {
    @JsonProperty private String username;
    @JsonProperty private String salt;
    @JsonProperty private String passwordHash;
    @JsonProperty private String snowmanColor;
    @JsonProperty private String hat = "top-hat";
    @JsonProperty private String scarf = "classic";
    @JsonProperty private String nose = "carrot";
    @JsonProperty private String arms = "twigs";
    @JsonProperty private String body = "classic";
    @JsonProperty private int wins;
    @JsonProperty private int totalScore;
    @JsonProperty private int gamesPlayed;
    @JsonProperty private List<String> achievements = new ArrayList<>();

    /** Required by Jackson when reading the local JSON account store. */
    public Account() { }

    Account(String username, String salt, String passwordHash, String snowmanColor) {
        this.username = username;
        this.salt = salt;
        this.passwordHash = passwordHash;
        this.snowmanColor = snowmanColor;
    }

    public String getUsername() { return username; }
    String getSalt() { return salt; }
    String getPasswordHash() { return passwordHash; }
    public String getSnowmanColor() { return snowmanColor; }
    @JsonIgnore
    public SnowmanLook getSnowmanLook() { return new SnowmanLook(hat, scarf, nose, arms, body); }
    public int getWins() { return wins; }
    public int getTotalScore() { return totalScore; }
    public int getGamesPlayed() { return gamesPlayed; }
    public List<String> getAchievements() { return List.copyOf(achievements); }

    void setUsername(String username) { this.username = username; }
    void setSnowmanColor(String snowmanColor) { this.snowmanColor = snowmanColor; }
    void setSnowmanLook(SnowmanLook look) {
        hat = look.hat();
        scarf = look.scarf();
        nose = look.nose();
        arms = look.arms();
        body = look.body();
    }
    void addMatchResult(int score, boolean won) {
        gamesPlayed++;
        totalScore += Math.max(0, score);
        if (won) wins++;
        if (score > 0 && !achievements.contains("First Point")) achievements.add("First Point");
        if (won && !achievements.contains("Match Winner")) achievements.add("Match Winner");
        if (score >= 5 && !achievements.contains("Five Points")) achievements.add("Five Points");
    }
    void setPassword(String salt, String passwordHash) {
        this.salt = salt;
        this.passwordHash = passwordHash;
    }
}
