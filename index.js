const express = require("express");
const axios = require("axios");
const querystring = require("querystring");
require("dotenv").config();
const cors = require("cors");

let accessToken = "";
let refreshToken = "";

const app = express();
app.use(express.json());
app.use(cors());
app.get("/", (req, res) => {
  res.send("testing");
});

app.get("/login", async (req, res) => {
  const scope =
    "user-read-playback-state user-modify-playback-state user-read-currently-playing user-follow-read user-top-read streaming";
  const redirectUrl =
    "https://accounts.spotify.com/authorize?" +
    querystring.stringify({
      response_type: "code",
      client_id: process.env.SPOTIFY_ID,
      scope: scope,
      redirect_uri: process.env.SPOTIFY_REDIRECT,
    });
  res.redirect(redirectUrl);
});

app.get("/callback", async (req, res) => {
  const code = req.query.code || null;
  try {
    const response = await axios.post(
      "https://accounts.spotify.com/api/token",
      querystring.stringify({
        code: code,
        redirect_uri: process.env.SPOTIFY_REDIRECT,
        grant_type: "authorization_code",
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
    refreshToken = response.data.refresh_token;
    res.send("Authorization successful. You can now access /spotify endpoint.");
  } catch (err) {
    res.status(500).json({ message: "Internal Server Error", err });
  }
});

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
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    res.send("Paused");
  } catch (err) {
    res.status(400).send("Error pausing playback");
  }
});

app.put("/spotify/play", async (req, res) => {
  if (!accessToken) return res.status(401).send("Not authorized");

  const { uri } = req.body;
  try {
    await axios.put(
      "https://api.spotify.com/v1/me/player/play",
      { uris: [uri] },
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    res.send("Playing song");
  } catch (err) {
    res.status(400).send("Error playing track");
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log("Server Running on PORT", PORT);
});
