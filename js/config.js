// Small helper: draws a labelled placeholder image as an inline SVG data
// URI, purely so the wall-frame + lightbox system has something real to
// display before actual photos are uploaded. Never a real memory — just
// a coloured rectangle + label. Safe to delete once real photos.src
// values are filled in below.
function placeholderPhotoDataUri(label, w, h) {
  const bg = "#241536";
  const fg = "#d4a84b";
  const fontSize = Math.max(14, Math.round(Math.min(w, h) / 11));
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="100%" height="100%" fill="${bg}"/>` +
    `<rect x="6" y="6" width="${w - 12}" height="${h - 12}" fill="none" stroke="${fg}" stroke-width="2" stroke-dasharray="8 7"/>` +
    `<text x="50%" y="50%" fill="${fg}" font-family="monospace" font-size="${fontSize}" text-anchor="middle" dominant-baseline="middle">${label}</text>` +
    `</svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

const CONFIG = {
  herName: "Cherry",
  museumTitle: "Museum of Memories",
  startSubtitle: "A small private gallery, built just for you. Step inside whenever you're ready.",

  rooms: {
    room1: {
      exhibitNo: "01",
      title: "Cherry — Growing Up",
      type: "photo-gallery",
      photos: [
        // Sample/placeholder entries so the wall-frame, chronological
        // sort, and lightbox can be tested before real photos exist.
        // Replace src/year/caption/note with real content later — do
        // not treat this text as an actual memory.
        //
        // Optional: any photo entry may add a manual placement override
        // instead of relying on automatic layout, e.g.:
        //   position: { wall: "north", offset: -1.2 }
        // wall is one of "north" | "east" | "south" | "west"; offset is
        // world units from that wall's center (roughly -5.2..5.2 for the
        // current room size). The engine validates this against the
        // room's actual doors/corners and silently falls back to
        // automatic placement (with a console warning) if it would ever
        // put the frame through a wall or over a doorway — no engine
        // changes needed to use it.
        {
          src: placeholderPhotoDataUri("Placeholder — 2019", 1000, 420),
          year: "2019",
          caption: "Sample photo — replace with a real memory",
          note: "Placeholder note. Swap this entry's src/year/caption/note once real photos are ready."
        },
        {
          src: placeholderPhotoDataUri("Placeholder — 2003", 800, 600),
          year: "2003",
          caption: "Sample photo — replace with a real memory",
          note: "Placeholder note."
        },
        {
          src: placeholderPhotoDataUri("Placeholder — 2015", 600, 900),
          year: "2015",
          caption: "Sample photo — replace with a real memory",
          note: "Placeholder note."
        },
        {
          src: placeholderPhotoDataUri("Placeholder — 2011", 700, 700),
          year: "2011",
          caption: "Sample photo — replace with a real memory",
          note: "Placeholder note."
        },
        {
          src: "photos/room1/coming-soon.webp", // intentionally missing —
          // demonstrates the never-crash placeholder-frame fallback
          year: "2022",
          caption: "Sample photo — file not uploaded yet",
          note: "This entry points at a file that doesn't exist yet, to show the missing-photo fallback frame."
        },
        {
          src: placeholderPhotoDataUri("Placeholder — 2007", 900, 500),
          year: "2007",
          caption: "Sample photo — replace with a real memory",
          note: "Placeholder note."
        },
        {
          src: placeholderPhotoDataUri("Placeholder — 2018", 1200, 800),
          year: "2018",
          caption: "Sample photo — replace with a real memory",
          note: "Placeholder note."
        },
        {
          src: placeholderPhotoDataUri("Placeholder — 2013", 800, 1200),
          year: "2013",
          caption: "Sample photo — replace with a real memory",
          note: "Placeholder note."
        },
        {
          src: placeholderPhotoDataUri("Placeholder — 2005", 1000, 600),
          year: "2005",
          caption: "Sample photo — replace with a real memory",
          note: "Placeholder note."
        },
        {
          src: placeholderPhotoDataUri("Placeholder — 2017", 600, 800),
          year: "2017",
          caption: "Sample photo — replace with a real memory",
          note: "Placeholder note."
        },
        {
          src: placeholderPhotoDataUri("Placeholder — 2010", 800, 800),
          year: "2010",
          caption: "Sample photo — replace with a real memory",
          note: "Placeholder note."
        },
        {
          src: placeholderPhotoDataUri("Placeholder — 2009", 700, 500),
          year: "2009",
          caption: "Sample photo — replace with a real memory",
          note: "Placeholder note."
        },
        {
          src: placeholderPhotoDataUri("Placeholder — 2016", 900, 700),
          year: "2016",
          caption: "Sample photo — replace with a real memory",
          note: "Placeholder note."
        }
      ],
      doors: [
        {
          target: "room2",
          label: "Family Archive",
          question: {
            prompt: "SAMPLE QUESTION — what is 2 + 2?",
            answers: ["4", "four"],
            hint: "It's a basic sum."
          }
        },
        {
          target: "room3",
          label: "Friends Archive",
          question: {
            prompt: "SAMPLE QUESTION — what color is the sky on a clear day?",
            answers: ["blue"],
            hint: "Same color as the ocean, usually."
          }
        },
        {
          target: "room5",
          label: "Our Videos",
          question: {
            prompt: "SAMPLE QUESTION — how many days are in a week?",
            answers: ["7", "seven"],
            hint: "One for each day from Monday to Sunday."
          }
        }
      ]
    },

    room2: {
      exhibitNo: "02",
      title: "Cherry + Family",
      type: "photo-gallery",
      photos: [],
      doors: [
        { target: "room1", label: "Back to Growing Up", question: { prompt: "SAMPLE QUESTION — what is 2 + 2?", answers: ["4", "four"], hint: "It's a basic sum." } },
        { target: "room4", label: "Cherry Archive", question: { prompt: "SAMPLE QUESTION — what is the opposite of hot?", answers: ["cold"], hint: "Think ice, not fire." } },
        { target: "room5", label: "Our Videos", question: { prompt: "SAMPLE QUESTION — what is the first letter of the alphabet?", answers: ["a"], hint: "It comes right before B." } }
      ]
    },

    room3: {
      exhibitNo: "03",
      title: "Cherry + Friends",
      type: "photo-gallery",
      photos: [],
      doors: [
        { target: "room1", label: "Back to Growing Up", question: { prompt: "SAMPLE QUESTION — what color is the sky on a clear day?", answers: ["blue"], hint: "Same color as the ocean, usually." } },
        { target: "room5", label: "Our Videos", question: { prompt: "SAMPLE QUESTION — how many legs does a spider have?", answers: ["8", "eight"], hint: "It's not 6 — that's an insect." } }
      ]
    },

    room4: {
      exhibitNo: "04",
      title: "The Cherry Archive",
      type: "interest-gallery",
      playlistUrl: "YOUTUBE_PLAYLIST_URL", // placeholder — add later
      interests: [
        { type: "book", title: "Omniscient Reader's Viewpoint (ORV)", description: "A book exhibit in Cherry's archive." },
        { type: "book", title: "Little Mushroom — An Zhe", description: "A book exhibit in Cherry's archive." },
        { type: "book", title: "Heaven Official's Blessing", description: "A book exhibit in Cherry's archive." },
        { type: "game", title: "DragonVale", description: "A game exhibit in Cherry's archive." },
        { type: "game", title: "Travel Town", description: "A game exhibit in Cherry's archive." },
        { type: "one-piece", title: "One Piece", description: "A One Piece exhibit in Cherry's archive." },
        { type: "one-piece", title: "Sanji", description: "A One Piece character exhibit in Cherry's archive." },
        { type: "one-piece", title: "Zoro", description: "A One Piece character exhibit in Cherry's archive." },
        { type: "flower", title: "Roses", description: "A flower exhibit in Cherry's archive." },
        { type: "flower", title: "Lilies", description: "A flower exhibit in Cherry's archive." }
      ],
      doors: [
        { target: "room2", label: "Back to Family Archive", question: { prompt: "SAMPLE QUESTION — what is the opposite of hot?", answers: ["cold"], hint: "Think ice, not fire." } },
        { target: "room5", label: "Our Videos", question: { prompt: "SAMPLE QUESTION — what do bees make?", answers: ["honey"], hint: "It's sweet and golden." } }
      ]
    },

    room5: {
      exhibitNo: "05",
      title: "Our Videos",
      type: "video-gallery",
      videos: [
        // { src: "videos/placeholder.mp4", poster: "videos/placeholder-thumb.webp", title: "Placeholder video", note: "Placeholder caption." }
      ],
      doors: [
        { target: "room1", label: "Growing Up", question: { prompt: "SAMPLE QUESTION — how many days are in a week?", answers: ["7", "seven"], hint: "One for each day from Monday to Sunday." } },
        { target: "room2", label: "Family Archive", question: { prompt: "SAMPLE QUESTION — what is the first letter of the alphabet?", answers: ["a"], hint: "It comes right before B." } },
        { target: "room3", label: "Friends Archive", question: { prompt: "SAMPLE QUESTION — how many legs does a spider have?", answers: ["8", "eight"], hint: "It's not 6 — that's an insect." } },
        { target: "room4", label: "Cherry Archive", question: { prompt: "SAMPLE QUESTION — what do bees make?", answers: ["honey"], hint: "It's sweet and golden." } },
        { target: "room6", label: "Final Room", question: { prompt: "SAMPLE QUESTION — type the word \"open\" to continue.", answers: ["open"], hint: "It's the same word as in the question." }, oneWay: true }
      ]
    },

    room6: {
      exhibitNo: "06",
      title: "The Final Room",
      type: "external-walls",
      entryFacingWall: "wallOfVoices",
      externalWalls: [
        { id: "wallOfVoices", title: "Wall of Voices", url: "WALL_OF_VOICES_URL", primary: true, position: "opposite-entry" },
        { id: "wall2", title: "Wall Exhibit 2", url: "EXTERNAL_URL_2" },
        { id: "wall3", title: "Wall Exhibit 3", url: "EXTERNAL_URL_3" },
        { id: "wall4", title: "Wall Exhibit 4", url: "EXTERNAL_URL_4" }
      ]
    }
  },

  finale: {
    title: "For You",
    message: "PLACEHOLDER FINALE MESSAGE — replace with the real closing message for Cherry."
  }
};

// Expose for later milestones / debugging
window.MUSEUM_CONFIG = CONFIG;
// This is the only file the user should normally edit when adding or changing personal content.
// Keep names, rooms, doors, questions, photos, videos, links, and finale text here.
