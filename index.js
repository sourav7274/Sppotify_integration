const express = require("express");
const axios = require("axios");
const querystring = require("querystring");
require("dotenv").config();
const cors = require("cors");

let accessToken = "";
let refreshToken = "";

const app = express();
app.use(express.json());
const corsOptions = {
  origin: "*",
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));

app.get("/login", async (req, res) => {
  const scope =
    "user-read-playback-state user-modify-playback-state user-read-currently-playing user-follow-read user-top-read streaming";

  const authUrl =
    "https://accounts.spotify.com/authorize?" +
    querystring.stringify({
      response_type: "code",
      client_id: process.env.SPOTIFY_ID,
      scope: scope,
      redirect_uri: process.env.SPOTIFY_REDIRECT,
      state: "some_random_state_value", // Optional but recommended for security
    });

  // Return the URL instead of redirecting
  res.json({
    url: authUrl,
    message: "Visit this URL in your browser to authenticate with Spotify",
  });
});

async function refreshAccessToken() {
  try {
    const response = await axios.post(
      "https://accounts.spotify.com/api/token",
      querystring.stringify({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      {
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(
              `${process.env.SPOTIFY_ID}:${process.env.SPOTIFY_SECRET}`
            ).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    accessToken = response.data.access_token;
    return accessToken;
  } catch (err) {
    console.error("Error refreshing token:", err);
    throw err;
  }
}

app.get("/spotify", async (req, res) => {
  if (!accessToken) return res.status(401).send("Not authorized");

  try {
    const [topTracks, currentSong, followedArtists] = await Promise.all([
      axios.get("https://api.spotify.com/v1/me/top/tracks?limit=10", {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      axios.get("https://api.spotify.com/v1/me/player/currently-playing", {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      axios.get("https://api.spotify.com/v1/me/following?type=artist", {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    ]);

    res.json({
      topTracks: topTracks.data.items.map((t) => ({
        name: t.name,
        artist: t.artists.map((a) => a.name).join(", "),
        uri: t.uri,
      })),
      nowPlaying: currentSong.data?.item?.name || "Nothing playing",
      followedArtists: followedArtists.data.artists.items.map((a) => a.name),
    });
  } catch (err) {
    res.status(400).send("Error fetching Spotify data");
  }
});

app.put("/spotify/pause", async (req, res) => {
  if (!accessToken) return res.status(401).send("Not authorized");

  try {
    await axios.put(
      "https://api.spotify.com/v1/me/player/pause",
      {},
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    res.send("Playback paused successfully");
  } catch (err) {
    console.error("Error pausing playback:", err.response?.data || err.message);
    res.status(400).json({
      error: "Error pausing playback",
      details: err.response?.data || err.message,
    });
  }
});

app.put("/spotify/play", async (req, res) => {
  if (!accessToken) return res.status(401).send("Not authorized");

  const { uri } = req.body;
  if (!uri) {
    return res.status(400).json({ error: "No track URI provided" });
  }

  try {
    await axios.put(
      "https://api.spotify.com/v1/me/player/play",
      { uris: [uri] },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    res.json({ message: "Playback started successfully" });
  } catch (err) {
    console.error(
      "Error starting playback:",
      err.response?.data || err.message
    );
    res.status(400).json({
      error: "Error starting playback",
      details: err.response?.data || err.message,
    });
  }
});

app.get("/callback", async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ error: "Authorization code missing" });
    }

    if (
      !process.env.SPOTIFY_ID ||
      !process.env.SPOTIFY_SECRET ||
      !process.env.SPOTIFY_REDIRECT
    ) {
      throw new Error("Missing Spotify configuration in environment variables");
    }

    const tokenResponse = await axios.post(
      "https://accounts.spotify.com/api/token",
      querystring.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.SPOTIFY_REDIRECT,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(
            `${process.env.SPOTIFY_ID}:${process.env.SPOTIFY_SECRET}`
          ).toString("base64")}`,
        },
      }
    );

    accessToken = tokenResponse.data.access_token;
    refreshToken = tokenResponse.data.refresh_token;

    // Optional: Store tokens securely (in a database or session)
    console.log("Successfully obtained tokens");

    // Redirect or send success response
    res.redirect("/spotify"); // Or send JSON response
  } catch (error) {
    console.error("Callback error:", error.response?.data || error.message);

    let errorMessage = "Failed to authenticate with Spotify";
    if (error.response?.data?.error_description) {
      errorMessage = error.response.data.error_description;
    }

    res.status(400).json({
      error: errorMessage,
      details: error.response?.data || error.message,
    });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log("Server Running on PORT", PORT);
});
