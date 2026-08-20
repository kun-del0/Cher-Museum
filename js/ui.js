// ---- fill in personal text from CONFIG ----
document.getElementById("start-subtitle").textContent =
  CONFIG.startSubtitle || `Happy birthday, ${CONFIG.herName}.`;

const startScreen = document.getElementById("start-screen");
const enterBtn = document.getElementById("enter-btn");
let entered = false;

function enterMuseum() {
  if (entered) return;
  entered = true;
  startScreen.classList.add("hidden");
  // Milestone hook: this is where optional room music will start
  // (Milestone 9) once the user gesture has fired.
}

// mouse / touch click
enterBtn.addEventListener("click", enterMuseum);

// keyboard Enter — listens on the whole document, not just the
// button, so it works whether or not the button has focus yet
document.addEventListener("keydown", (e) => {
  if (entered) return;
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    enterMuseum();
  }
});
const museumTitleEl = document.getElementById("museum-title");
if (museumTitleEl && CONFIG.museumTitle) {
  const words = String(CONFIG.museumTitle).trim().split(/\s+/);
  const emphasis = words.pop() || "";
  museumTitleEl.textContent = words.join(" ") + (words.length ? " " : "");
  const emphasisEl = document.createElement("em");
  emphasisEl.textContent = emphasis;
  museumTitleEl.appendChild(emphasisEl);
}
document.title = `${CONFIG.museumTitle || "Museum of Memories"} — ${CONFIG.herName || ""}`.trim();

const plaqueEl = document.getElementById("room-plaque");
const plaqueLabelEl = document.getElementById("room-plaque-label");
const plaqueTitleEl = document.getElementById("room-plaque-title");
let plaqueTimer = null;

function showRoomPlaque(room) {
  if (!room || !plaqueEl) return;
  plaqueLabelEl.textContent = `Exhibit ${room.exhibitNo || ""}`;
  plaqueTitleEl.textContent = room.title || "";
  plaqueEl.classList.remove("hidden", "visible");
  // Restart the transition when backtracking into a room quickly.
  void plaqueEl.offsetWidth;
  plaqueEl.classList.add("visible");
  clearTimeout(plaqueTimer);
  plaqueTimer = setTimeout(() => plaqueEl.classList.remove("visible"), 2500);
}

const musicControlEl = document.getElementById("music-control");
const musicStatusEl = document.getElementById("music-status");
const musicToggleEl = document.getElementById("music-toggle");
const musicMuteEl = document.getElementById("music-mute");
const playlistUrl = CONFIG.rooms && CONFIG.rooms.room4 && CONFIG.rooms.room4.playlistUrl;
let musicPlayer = null;
let musicStarted = false;
let musicPaused = false;
let musicMuted = false;

function playlistIdFrom(url) {
  if (!url || !/^https?:/i.test(url)) return null;
  try { return new URL(url).searchParams.get("list"); } catch (e) { return null; }
}

function updateMusicControl(status) {
  if (!musicControlEl) return;
  musicStatusEl.textContent = status;
  musicToggleEl.textContent = musicPaused ? "▶" : "Ⅱ";
  musicToggleEl.setAttribute("aria-label", musicPaused ? "Resume music" : "Pause music");
  musicMuteEl.textContent = musicMuted ? "×" : "⌁";
  musicMuteEl.setAttribute("aria-label", musicMuted ? "Unmute music" : "Mute music");
}

function startPlaylistMusic() {
  if (musicStarted) return;
  musicStarted = true;
  const playlistId = playlistIdFrom(playlistUrl);
  if (!playlistId) return; // Missing/placeholder URL: the Museum stays silent.
  musicControlEl.classList.remove("hidden");
  updateMusicControl("Loading playlist");

  window.onYouTubeIframeAPIReady = () => {
    musicPlayer = new YT.Player("music-player", {
      height: "1",
      width: "1",
      playerVars: { listType: "playlist", list: playlistId, autoplay: 1, playsinline: 1 },
      events: {
        onReady: (event) => {
          if (typeof event.target.setShuffle === "function") event.target.setShuffle(true);
          event.target.playVideo();
          updateMusicControl("Playlist playing");
        },
        onStateChange: (event) => {
          if (event.data === YT.PlayerState.ENDED) event.target.nextVideo();
        },
        onError: () => updateMusicControl("Playlist unavailable"),
      },
    });
  };
  const api = document.createElement("script");
  api.src = "https://www.youtube.com/iframe_api";
  api.async = true;
  api.onerror = () => updateMusicControl("Playlist unavailable");
  document.head.appendChild(api);
}

musicToggleEl.addEventListener("click", () => {
  if (!musicPlayer) return;
  musicPaused = !musicPaused;
  musicPaused ? musicPlayer.pauseVideo() : musicPlayer.playVideo();
  updateMusicControl(musicPaused ? "Playlist paused" : "Playlist playing");
});
musicMuteEl.addEventListener("click", () => {
  if (!musicPlayer) return;
  musicMuted = !musicMuted;
  musicMuted ? musicPlayer.mute() : musicPlayer.unMute();
  updateMusicControl(musicPaused ? "Playlist paused" : "Playlist playing");
});

// The only call site is the start-screen user gesture: no autoplay before Enter.
enterBtn.addEventListener("click", startPlaylistMusic);
document.addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && entered) startPlaylistMusic();
});
