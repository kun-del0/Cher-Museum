const statusEl = document.getElementById("engine-status");

try {
  if (typeof THREE === "undefined") {
    throw new Error("THREE failed to load from CDN (window.THREE is undefined)");
  }

  // ---- basic scene / camera / renderer ----
  const sceneRoot = document.getElementById("scene-root");

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0a1f); // midnight floor tone as void colour

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(0, 1.6, 4); // roughly eye height, standing back a little

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  sceneRoot.appendChild(renderer.domElement);

  // ---- shared midnight-gallery light, supplemented by room spot pools ----
  // A low cool fill keeps the midnight atmosphere; architectural fixtures
  // and the few wall-directed spots supply the warmth.
  const ambient = new THREE.AmbientLight(0x302342, 0.98);
  scene.add(ambient);

  const skyLight = new THREE.HemisphereLight(0x483a61, 0x10091d, 0.46);
  scene.add(skyLight);

  const spot = new THREE.SpotLight(0xffe4a8, 1.95, 19, Math.PI / 4.5, 0.68, 1.4);
  spot.position.set(0, 6.1, 1);
  spot.target.position.set(0, 0, 0);
  scene.add(spot);
  scene.add(spot.target);

  // ---- Milestone 3: DOM refs for door prompt + question overlay ----
  const roomIndicatorEl = document.getElementById("room-indicator");
  const doorPromptEl = document.getElementById("door-prompt");
  const doorOverlayEl = document.getElementById("door-overlay");
  const doorOverlayLabelEl = document.getElementById("door-overlay-label");
  const doorOverlayPromptEl = document.getElementById("door-overlay-prompt");
  const doorOverlayInputEl = document.getElementById("door-overlay-input");
  const doorOverlayFeedbackEl = document.getElementById("door-overlay-feedback");
  const doorOverlayHintEl = document.getElementById("door-overlay-hint");
  const doorOverlaySubmitEl = document.getElementById("door-overlay-submit");
  const doorOverlaySkipEl = document.getElementById("door-overlay-skip");
  const doorOverlayCloseEl = document.getElementById("door-overlay-close");
  const photoOverlayEl = document.getElementById("photo-overlay");
  const photoOverlayBackdropEl = document.getElementById("photo-overlay-backdrop");
  const photoOverlayImageEl = document.getElementById("photo-overlay-image");
  const photoOverlayYearEl = document.getElementById("photo-overlay-year");
  const photoOverlayCaptionEl = document.getElementById("photo-overlay-caption");
  const photoOverlayNoteEl = document.getElementById("photo-overlay-note");
  const photoOverlayCloseEl = document.getElementById("photo-overlay-close");
  const playlistOverlayEl = document.getElementById("playlist-overlay");
  const playlistOverlayBackdropEl = document.getElementById("playlist-overlay-backdrop");
  const playlistOverlayCloseEl = document.getElementById("playlist-overlay-close");
  const playlistEmbedWrapEl = document.getElementById("playlist-embed-wrap");
  const playlistOpenLinkEl = document.getElementById("playlist-open-link");
  const exhibitOverlayEl = document.getElementById("exhibit-overlay");
  const exhibitOverlayBackdropEl = document.getElementById("exhibit-overlay-backdrop");
  const exhibitOverlayCloseEl = document.getElementById("exhibit-overlay-close");
  const exhibitOverlayLabelEl = document.getElementById("exhibit-overlay-label");
  const exhibitOverlayTitleEl = document.getElementById("exhibit-overlay-title");
  const exhibitOverlayDescriptionEl = document.getElementById("exhibit-overlay-description");
  const videoOverlayEl = document.getElementById("video-overlay");
  const videoOverlayBackdropEl = document.getElementById("video-overlay-backdrop");
  const videoOverlayCloseEl = document.getElementById("video-overlay-close");
  const videoOverlayTitleEl = document.getElementById("video-overlay-title");
  const videoOverlayNoteEl = document.getElementById("video-overlay-note");
  const videoPlayerWrapEl = document.getElementById("video-player-wrap");
  const websiteOverlayEl = document.getElementById("website-overlay");
  const websiteOverlayBackdropEl = document.getElementById("website-overlay-backdrop");
  const websiteOverlayCloseEl = document.getElementById("website-overlay-close");
  const websiteOverlayTitleEl = document.getElementById("website-overlay-title");
  const websiteEmbedWrapEl = document.getElementById("website-embed-wrap");
  const websiteOpenLinkEl = document.getElementById("website-open-link");

  // ---- Milestone 3: data-driven room graph ----
  // One room is "live" (built into roomGroup) at a time. Walking into an
  // unlocked door — or pressing Interact near one — swaps the room.
  const ROOM_SIZE = 15;          // deliberately generous gallery footprint
  const ROOM_HALF = ROOM_SIZE / 2;
  const WALL_HEIGHT = 6.6;
  const WALL_THICKNESS = 0.3;
  const PLAYER_RADIUS = 0.4;
  const EYE_HEIGHT = 1.6;
  const DOOR_WIDTH = 1.6;   // gap left open in the wall for each door
  const DOOR_HEIGHT = 3.7;
  const DOOR_EDGE_MARGIN = 1.3; // keeps doors clear of the corners

  // ---- Milestone 4: wall-mounted photo frames ----
  const PHOTO_MAX_DIM = 1.7;      // largest side a frame can be, in world units
  const PHOTO_HEIGHT = 2.45;      // generous hanging height above broad wainscot
  // Automatic layouts use three separated rows on each wall. This expands
  // usable hanging space without ever putting a frame in a doorway: each
  // row is packed only into that wall's door-free horizontal segments.
  const PHOTO_ROW_CENTERS = [2.2, 3.55, 4.85];
  const PHOTO_WALL_MARGIN = 0.55; // keeps frames clear of corners / door frames
  const PHOTO_INTERACT_DISTANCE = 1.9;
  const FRAME_BORDER_PAD = 0.12;  // physical brass border added around every frame's image plane
  const PHOTO_MIN_SPACING = 0.35; // minimum gap between two neighboring frames' borders
  const PHOTO_LOAD_TIMEOUT_MS = 6000; // don't let one slow image stall the whole room's layout

  // how close to a *solid* wall the camera is allowed to get
  const MOVE_BOUND = ROOM_HALF - WALL_THICKNESS / 2 - PLAYER_RADIUS;
  // how far past the wall plane counts as "through the doorway"
  const TRANSITION_DEPTH = 0.9;

  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x1a0f2e, // aubergine
    roughness: 0.9,
    metalness: 0.05,
  });
  const ceilingMat = new THREE.MeshStandardMaterial({
    color: 0x140b25, // slightly darker aubergine
    roughness: 0.95,
    metalness: 0.0,
  });
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x0d0a1f, // midnight
    roughness: 0.85,
    metalness: 0.05,
  });
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0xd4a84b, // brass
    roughness: 0.4,
    metalness: 0.6,
  });

  // Everything belonging to the *current* room lives in this group so
  // switching rooms is just "clear it out, build the new one".
  const roomGroup = new THREE.Group();
  scene.add(roomGroup);

  function clearRoomGroup() {
    roomGeneration++; // invalidate any in-flight async photo image loads
    playlistBoardRecord = null;
    interestRecords = [];
    videoRecords = [];
    websiteRecords = [];
    for (let i = roomGroup.children.length - 1; i >= 0; i--) {
      const child = roomGroup.children[i];
      roomGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      // per-instance materials (door panels, photo frames) are unique
      // and must be disposed, along with any texture they own; shared
      // materials (wall/ceiling/floor/frame) are reused across rooms
      // and left alone.
      if (child.material && child.material.userData && child.material.userData.disposable) {
        if (child.material.map) {
          child.material.map.dispose();
          child.material.map = null;
        }
        child.material.dispose();
      }
    }
  }

  // ---- persistence: which connections have already been unlocked ----
  const UNLOCK_STORAGE_KEY = "museum_unlocked_connections_v1";
  function connectionIdFor(roomA, roomB) {
    return [roomA, roomB].sort().join("__");
  }
  function loadUnlockedConnections() {
    try {
      const raw = localStorage.getItem(UNLOCK_STORAGE_KEY);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch (e) {
      return new Set();
    }
  }
  function saveUnlockedConnections() {
    try {
      localStorage.setItem(UNLOCK_STORAGE_KEY, JSON.stringify([...unlockedConnections]));
    } catch (e) {
      // localStorage unavailable (private mode, etc.) — fail silently,
      // doors just won't stay unlocked between visits.
    }
  }
  const unlockedConnections = loadUnlockedConnections();

  // ---- wall layout helpers ----
  // Each wall is described by which world axis runs along it ("tangent"),
  // and the fixed coordinate of the plane it sits on.
  const WALL_DEFS = {
    north: { tangentAxis: "x", fixedValue: -ROOM_HALF, normal: { x: 0, z: 1 } },
    south: { tangentAxis: "x", fixedValue: ROOM_HALF, normal: { x: 0, z: -1 } },
    west: { tangentAxis: "z", fixedValue: -ROOM_HALF, normal: { x: 1, z: 0 } },
    east: { tangentAxis: "z", fixedValue: ROOM_HALF, normal: { x: -1, z: 0 } },
  };
  const WALL_ORDER = ["north", "east", "south", "west"];

  function computeOffsets(count) {
    const spanHalf = ROOM_HALF - DOOR_EDGE_MARGIN;
    if (count <= 0) return [];
    if (count === 1) return [0];
    const offsets = [];
    const step = (spanHalf * 2) / (count - 1);
    for (let i = 0; i < count; i++) offsets.push(-spanHalf + i * step);
    return offsets;
  }

  function anchorFor(wallId, offset) {
    const def = WALL_DEFS[wallId];
    return def.tangentAxis === "x"
      ? { x: offset, z: def.fixedValue }
      : { x: def.fixedValue, z: offset };
  }

  // doorRecords: metadata for every door in the currently-built room,
  // used for proximity prompts, interaction, and movement collision.
  let doorRecords = [];
  // photoRecords: metadata for every wall-mounted photo frame in the
  // currently-built room, used for proximity prompts + the lightbox.
  let photoRecords = [];
  // Room 4's tangible archive objects use the same proximity model as
  // photos and doors, but their content remains entirely in config.js.
  let interestRecords = [];
  let videoRecords = [];
  let websiteRecords = [];
  let playlistBoardRecord = null;
  let currentRoomId = null;
  // bumped every time the room is rebuilt, so an async photo image that
  // finishes loading after the player has already left the room knows
  // to discard itself instead of mutating a disposed mesh.
  let roomGeneration = 0;

  // Free (non-door) span available for hanging photos along a wall,
  // reusing the same gap-around-doors logic the walls themselves use.
  function computeFreeWallSegments(wallId) {
    const doorsOnWall = doorRecords.filter((r) => r.wallId === wallId);
    const gaps = doorsOnWall
      .map((r) => ({ offset: r.offset, half: r.gapHalfWidth }))
      .sort((a, b) => a.offset - b.offset);

    let cursor = -ROOM_HALF;
    const segments = [];
    gaps.forEach((g) => {
      const segEnd = g.offset - g.half;
      if (segEnd - cursor > 0.05) segments.push([cursor, segEnd]);
      cursor = g.offset + g.half;
    });
    if (ROOM_HALF - cursor > 0.05) segments.push([cursor, ROOM_HALF]);
    return segments;
  }

  function buildWallWithGaps(wallId, doorsOnWall) {
    const def = WALL_DEFS[wallId];
    const dw = DOOR_WIDTH / 2;
    const gaps = doorsOnWall
      .map((d) => ({ offset: d.offset, half: dw }))
      .sort((a, b) => a.offset - b.offset);

    let cursor = -ROOM_HALF;
    const segments = [];
    gaps.forEach((g) => {
      const segEnd = g.offset - g.half;
      if (segEnd - cursor > 0.05) segments.push([cursor, segEnd]);
      cursor = g.offset + g.half;
    });
    if (ROOM_HALF - cursor > 0.05) segments.push([cursor, ROOM_HALF]);

    segments.forEach(([a, b]) => {
      const length = b - a;
      const center = (a + b) / 2;
      let mesh;
      if (def.tangentAxis === "x") {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(length, WALL_HEIGHT, WALL_THICKNESS), wallMat);
        mesh.position.set(center, WALL_HEIGHT / 2, def.fixedValue);
      } else {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, length), wallMat);
        mesh.position.set(def.fixedValue, WALL_HEIGHT / 2, center);
      }
      roomGroup.add(mesh);

      // Each door-safe segment receives a few large architectural forms:
      // deep dado, a single recessed bay, substantial end pilasters and
      // broad crown. This avoids a wallpaper of thin decorative lines.
      const frontOffset = WALL_THICKNESS / 2 + 0.025;
      const addDetail = (detailLength, height, y, depth, material, tangentCenter = center) => {
        let detail;
        if (def.tangentAxis === "x") {
          detail = new THREE.Mesh(new THREE.BoxGeometry(detailLength, height, depth), material);
          detail.position.set(tangentCenter, y, def.fixedValue + def.normal.z * frontOffset);
        } else {
          detail = new THREE.Mesh(new THREE.BoxGeometry(depth, height, detailLength), material);
          detail.position.set(def.fixedValue + def.normal.x * frontOffset, y, tangentCenter);
        }
        roomGroup.add(detail);
      };
      addDetail(length, 1.42, 0.71, 0.09, wainscotMat);
      addDetail(length - 0.48, WALL_HEIGHT - 2.18, (WALL_HEIGHT + 1.42) / 2, 0.055, upperPanelMat);
      addDetail(length + 0.06, 0.18, 0.11, 0.16, ceilingWoodMat); // plinth
      addDetail(length - 0.16, 0.16, 1.47, 0.15, ceilingWoodMat); // dado cap
      addDetail(length + 0.08, 0.34, WALL_HEIGHT - 0.17, 0.24, ceilingWoodMat); // crown
      if (length > 0.5) {
        // Keep the bay edge well outside the photo packer's 0.55-unit wall
        // margin, so it reads as architecture around—not through—an exhibit.
        addDetail(0.14, WALL_HEIGHT - 1.56, (WALL_HEIGHT + 1.42) / 2, 0.1, ceilingWoodMat, a + 0.1);
        addDetail(0.14, WALL_HEIGHT - 1.56, (WALL_HEIGHT + 1.42) / 2, 0.1, ceilingWoodMat, b - 0.1);
      }
    });
  }

  function makeDoorPanelMaterial() {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x6b3a49,
      roughness: 0.6,
      metalness: 0.1,
      emissive: 0x000000,
      emissiveIntensity: 0,
    });
    mat.userData.disposable = true;
    return mat;
  }

  function makeDoorLabelMesh(label, width = 1.25) {
    const canvas = document.createElement("canvas");
    canvas.width = 620;
    canvas.height = 150;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#160c27";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#d4a84b";
    ctx.lineWidth = 8;
    ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
    ctx.fillStyle = "#f4efe6";
    ctx.font = "28px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(label || "Gallery door").slice(0, 34), canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.FrontSide });
    material.userData.disposable = true;
    return new THREE.Mesh(new THREE.PlaneGeometry(width, width * 0.242), material);
  }

  function applyDoorLockVisual(record) {
    if (record.locked) {
      record.panelMesh.material.color.set(0x6b3a49); // dim rose — locked
      record.panelMesh.material.emissive.set(0x000000);
      record.panelMesh.material.emissiveIntensity = 0;
    } else {
      record.panelMesh.material.color.set(0xffe4a8); // warm glow — unlocked
      record.panelMesh.material.emissive.set(0xffb84d);
      record.panelMesh.material.emissiveIntensity = 0.55;
    }
  }

  function buildDoorVisual(wallId, door, offset, connectionId, locked) {
    const def = WALL_DEFS[wallId];
    const anchor = anchorFor(wallId, offset);

    // A deep dark-wood surround makes each passage a substantial reveal;
    // its dimensions do not change the existing collision opening.
    const surroundGeo = def.tangentAxis === "x"
      ? new THREE.BoxGeometry(DOOR_WIDTH + 0.54, DOOR_HEIGHT + 0.52, WALL_THICKNESS * 1.38)
      : new THREE.BoxGeometry(WALL_THICKNESS * 1.38, DOOR_HEIGHT + 0.52, DOOR_WIDTH + 0.54);
    const surround = new THREE.Mesh(surroundGeo, ceilingWoodMat);
    surround.position.set(anchor.x, DOOR_HEIGHT / 2, anchor.z);
    roomGroup.add(surround);

    const frameGeo =
      def.tangentAxis === "x"
        ? new THREE.BoxGeometry(DOOR_WIDTH, DOOR_HEIGHT, WALL_THICKNESS * 1.15)
        : new THREE.BoxGeometry(WALL_THICKNESS * 1.15, DOOR_HEIGHT, DOOR_WIDTH);
    const frameMesh = new THREE.Mesh(frameGeo, frameMat);
    frameMesh.position.set(anchor.x, DOOR_HEIGHT / 2, anchor.z);
    roomGroup.add(frameMesh);

    const panelMat = makeDoorPanelMaterial();
    const panelGeo =
      def.tangentAxis === "x"
        ? new THREE.BoxGeometry(DOOR_WIDTH - 0.18, DOOR_HEIGHT - 0.18, WALL_THICKNESS * 0.6)
        : new THREE.BoxGeometry(WALL_THICKNESS * 0.6, DOOR_HEIGHT - 0.18, DOOR_WIDTH - 0.18);
    const panelMesh = new THREE.Mesh(panelGeo, panelMat);
    panelMesh.position.set(
      anchor.x + def.normal.x * 0.035,
      DOOR_HEIGHT / 2,
      anchor.z + def.normal.z * 0.035
    );
    roomGroup.add(panelMesh);

    // Close the tall wall opening above the actual door and add restrained
    // brass joinery so every transition reads as a substantial museum door.
    const transomHeight = WALL_HEIGHT - DOOR_HEIGHT;
    if (transomHeight > 0.1) {
      const transomGeo = def.tangentAxis === "x"
        ? new THREE.BoxGeometry(DOOR_WIDTH, transomHeight, WALL_THICKNESS * 0.62)
        : new THREE.BoxGeometry(WALL_THICKNESS * 0.62, transomHeight, DOOR_WIDTH);
      const transom = new THREE.Mesh(transomGeo, upperPanelMat);
      transom.position.set(anchor.x, DOOR_HEIGHT + transomHeight / 2, anchor.z);
      roomGroup.add(transom);
    }
    const addDoorTrim = (along, y, alongSize, height) => {
      const geometry = def.tangentAxis === "x"
        ? new THREE.BoxGeometry(alongSize, height, 0.1)
        : new THREE.BoxGeometry(0.1, height, alongSize);
      const trim = new THREE.Mesh(geometry, trimMat);
      trim.position.set(
        anchor.x + (def.tangentAxis === "x" ? along : def.normal.x * 0.12),
        y,
        anchor.z + (def.tangentAxis === "x" ? def.normal.z * 0.12 : along)
      );
      roomGroup.add(trim);
    };
    addDoorTrim(-DOOR_WIDTH / 2 + 0.1, DOOR_HEIGHT / 2, 0.12, DOOR_HEIGHT + 0.2);
    addDoorTrim(DOOR_WIDTH / 2 - 0.1, DOOR_HEIGHT / 2, 0.12, DOOR_HEIGHT + 0.2);
    addDoorTrim(0, DOOR_HEIGHT - 0.1, DOOR_WIDTH, 0.12);
    const doorLabel = makeDoorLabelMesh(door.label, Math.min(1.45, DOOR_WIDTH - 0.1));
    doorLabel.position.set(
      anchor.x + def.normal.x * (WALL_THICKNESS / 2 + 0.06),
      DOOR_HEIGHT + 0.42,
      anchor.z + def.normal.z * (WALL_THICKNESS / 2 + 0.06)
    );
    doorLabel.rotation.y = def.tangentAxis === "x" ? (wallId === "south" ? Math.PI : 0) : (wallId === "east" ? -Math.PI / 2 : Math.PI / 2);
    roomGroup.add(doorLabel);

    const record = {
      wallId,
      offset,
      anchor,
      target: door.target,
      label: door.label,
      question: door.question,
      connectionId,
      locked,
      gapHalfWidth: DOOR_WIDTH / 2,
      normal: def.normal,
      panelMesh,
      frameMesh,
      cooldownUntil: 0,
    };
    applyDoorLockVisual(record);
    return record;
  }

  // ---- Milestone 4: wall-mounted photo frames ----

  function makePhotoFrameMaterials() {
    const frameBorderMat = new THREE.MeshStandardMaterial({
      color: 0xd4a84b, // brass, same family as door frames
      roughness: 0.45,
      metalness: 0.55,
    });
    frameBorderMat.userData.disposable = true;
    const photoMat = new THREE.MeshBasicMaterial({
      color: 0x2a1f3a, // dim placeholder tone until the image loads
    });
    photoMat.userData.disposable = true;
    return { frameBorderMat, photoMat };
  }

  // Draws a small "photo unavailable" canvas texture so a missing/failed
  // image never shows up as a browser broken-image icon.
  function makeMissingPhotoTexture(caption) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#241536";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#d4a84b";
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 8]);
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    ctx.fillStyle = "#d4a84b";
    ctx.textAlign = "center";
    ctx.font = "16px monospace";
    ctx.fillText("PHOTO NOT", canvas.width / 2, canvas.height / 2 - 12);
    ctx.fillText("AVAILABLE YET", canvas.width / 2, canvas.height / 2 + 12);
    if (caption) {
      ctx.font = "11px sans-serif";
      ctx.fillStyle = "#f4efe6";
      const trimmed = caption.length > 28 ? caption.slice(0, 26) + "…" : caption;
      ctx.fillText(trimmed, canvas.width / 2, canvas.height / 2 + 40);
    }
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  // Loads just enough of a photo to know its natural aspect ratio
  // *before* the layout below decides where anything goes. This is the
  // key fix for the Milestone 4 overlap bug: the old version positioned
  // every frame using a placeholder square size, then resized it after
  // the image finished loading — so a wide or tall photo could grow
  // past the space it had been given and intersect a neighboring frame
  // or a doorway. Deciding the real size first means every position
  // below is already correct and never needs to move.
  // Resolves even on error/timeout (never rejects) so one bad photo can
  // never stall — or crash — the room.
  function loadPhotoAspect(photo) {
    return new Promise((resolve) => {
      const thumbSrc = photo.thumb || photo.src;
      if (!thumbSrc) {
        resolve({ aspect: 1, failed: true, img: null });
        return;
      }
      const img = new Image();
      img.decoding = "async";
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      img.onload = () => {
        const nw = img.naturalWidth || 1;
        const nh = img.naturalHeight || 1;
        finish({ aspect: nw / nh, failed: false, img });
      };
      img.onerror = () => finish({ aspect: 1, failed: true, img: null });
      setTimeout(() => finish({ aspect: 1, failed: true, img: null }), PHOTO_LOAD_TIMEOUT_MS);
      img.src = thumbSrc;
    });
  }

  // Converts a natural aspect ratio into a frame footprint whose largest
  // side is bounded. Do not clamp the shorter side: a panoramic or very
  // tall original must keep its real aspect ratio rather than be stretched.
  function frameSizeForAspect(aspect, maxDim = PHOTO_MAX_DIM) {
    const a = aspect > 0 ? aspect : 1;
    let w, h;
    if (a >= 1) {
      w = maxDim;
      h = maxDim / a;
    } else {
      h = maxDim;
      w = maxDim * a;
    }
    return { w, h };
  }

  // As a room gains photos, reduce the preferred frame size before
  // packing. This preserves every photo's aspect ratio while allowing
  // normal rooms to comfortably reflow through 15–30+ exhibits. Room 1
  // uses the same rules, so a larger collection simply continues into
  // smaller, still-readable frames rather than assuming a fixed count.
  function photoMaxDimensionForCount(count) {
    if (count <= 12) return 1.0;
    if (count <= 24) return 0.85;
    if (count <= 40) return 0.7;
    if (count <= 60) return 0.58;
    return 0.48;
  }

  // If a frame is wider than the biggest space actually available on
  // its wall, shrink it while preserving its aspect ratio instead of
  // letting it overflow into a door or a neighboring frame.
  function shrinkItemToFit(item, maxUsableLen) {
    const footprint = item.w + FRAME_BORDER_PAD;
    if (maxUsableLen <= 0 || footprint <= maxUsableLen) return item;
    const targetW = maxUsableLen - FRAME_BORDER_PAD;
    if (targetW <= 0) return item;
    const scale = targetW / item.w;
    return {
      ...item,
      w: item.w * scale,
      h: item.h * scale,
    };
  }

  // Removes the footprint (plus minimum spacing) of one already-placed
  // frame from a list of free segments, so later placements — automatic
  // or manual — never land on top of it.
  function subtractSpanFromSegments(segments, offset, frameW) {
    const half = (frameW + FRAME_BORDER_PAD) / 2 + PHOTO_MIN_SPACING;
    const lo = offset - half;
    const hi = offset + half;
    const result = [];
    segments.forEach(([a, b]) => {
      if (hi <= a || lo >= b) {
        result.push([a, b]);
        return;
      }
      if (lo > a) result.push([a, lo]);
      if (hi < b) result.push([hi, b]);
    });
    return result;
  }

  // Greedily fills a wall's free (door-free) segments with items in
  // order, always keeping every frame's full physical footprint
  // (image + brass border) within PHOTO_WALL_MARGIN of a segment's ends
  // — which is exactly what keeps it off doorways and out of corners —
  // and at least PHOTO_MIN_SPACING away from its neighbors. Items that
  // don't fit anywhere are returned as leftovers rather than forced in.
  function packSegments(segments, items) {
    const placed = [];
    const remaining = items.slice();
    segments.forEach((seg) => {
      if (remaining.length === 0) return;
      const usableStart = seg[0] + PHOTO_WALL_MARGIN;
      const usableEnd = seg[1] - PHOTO_WALL_MARGIN;
      const usableLen = usableEnd - usableStart;
      if (usableLen <= 0) return;

      const take = [];
      let used = 0;
      for (const item of remaining) {
        const fw = item.w + FRAME_BORDER_PAD;
        const need = take.length === 0 ? fw : PHOTO_MIN_SPACING + fw;
        if (used + need > usableLen) break;
        used += need;
        take.push(item);
      }
      if (take.length === 0) return;

      remaining.splice(0, take.length);

      // Center the whole placed group in the segment, then lay items
      // out edge-to-edge with PHOTO_MIN_SPACING between them, using
      // each item's *real* footprint rather than an equal-fraction guess.
      let cursor = usableStart + (usableLen - used) / 2;
      take.forEach((item) => {
        const fw = item.w + FRAME_BORDER_PAD;
        placed.push({ item, offset: cursor + fw / 2 });
        cursor += fw + PHOTO_MIN_SPACING;
      });
    });
    return { placed, leftover: remaining };
  }

  // Packs one horizontal display row. Keeping the rows independent makes
  // mixed portrait/landscape images reflow predictably while their real
  // widths still control spacing. `y` is carried through to the mesh so
  // frames on the same wall cannot overlap vertically.
  function packSegmentsInRow(segments, items, y) {
    const { placed, leftover } = packSegments(segments, items);
    return {
      placed: placed.map((p) => ({ ...p, y })),
      leftover,
    };
  }

  // Checks a manual `photo.position = { wall, offset }` override against
  // the room's actual geometry: it must stay within the wall (clear of
  // corners) and must not overlap any doorway on that wall. Invalid
  // overrides are rejected (never crash, never place through a wall) so
  // the caller can fall back to automatic placement instead.
  function validateManualPhotoPosition(wallId, offset, frameW) {
    const def = WALL_DEFS[wallId];
    if (!def) return { ok: false, reason: `unknown wall id "${wallId}"` };
    if (typeof offset !== "number" || Number.isNaN(offset)) {
      return { ok: false, reason: "offset must be a number" };
    }
    const footprintHalf = (frameW + FRAME_BORDER_PAD) / 2;
    if (
      offset - footprintHalf < -ROOM_HALF + PHOTO_WALL_MARGIN ||
      offset + footprintHalf > ROOM_HALF - PHOTO_WALL_MARGIN
    ) {
      return { ok: false, reason: "too close to a corner / past the wall's edge" };
    }
    const collides = doorRecords.some(
      (r) =>
        r.wallId === wallId &&
        Math.abs(offset - r.offset) < footprintHalf + r.gapHalfWidth + PHOTO_WALL_MARGIN
    );
    if (collides) return { ok: false, reason: "overlaps a doorway" };
    return { ok: true };
  }

  function buildPhotoFrameMesh(wallId, offset, photo, frameW, frameH, preloaded, mountHeight = PHOTO_HEIGHT) {
    const def = WALL_DEFS[wallId];
    const anchor = anchorFor(wallId, offset);
    const normal = def.normal;

    const { frameBorderMat, photoMat } = makePhotoFrameMaterials();
    const rotY = Math.atan2(normal.x, normal.z);

    const borderMesh = new THREE.Mesh(
      new THREE.BoxGeometry(frameW + FRAME_BORDER_PAD, frameH + FRAME_BORDER_PAD, 0.05),
      frameBorderMat
    );
    const photoMesh = new THREE.Mesh(new THREE.PlaneGeometry(frameW, frameH), photoMat);

    [borderMesh, photoMesh].forEach((mesh) => {
      mesh.rotation.y = rotY;
    });
    borderMesh.position.set(
      anchor.x + normal.x * (WALL_THICKNESS / 2 + 0.03),
      mountHeight,
      anchor.z + normal.z * (WALL_THICKNESS / 2 + 0.03)
    );
    photoMesh.position.set(
      anchor.x + normal.x * (WALL_THICKNESS / 2 + 0.07),
      mountHeight,
      anchor.z + normal.z * (WALL_THICKNESS / 2 + 0.07)
    );

    roomGroup.add(borderMesh);
    roomGroup.add(photoMesh);

    const record = {
      wallId, offset, anchor, normal, photo, borderMesh, photoMesh, frameW, frameH, mountHeight,
    };

    // The image (or the missing-photo fallback) was already resolved
    // during layout — see loadPhotoAspect — so this just applies the
    // texture to the already-correctly-sized frame. No resize needed.
    if (preloaded && !preloaded.failed && preloaded.img) {
      const texture = new THREE.Texture(preloaded.img);
      texture.needsUpdate = true;
      photoMat.map = texture;
      photoMat.color.set(0xffffff);
      photoMat.needsUpdate = true;
    } else {
      const texture = makeMissingPhotoTexture(photo.caption);
      photoMat.map = texture;
      photoMat.color.set(0xffffff);
      photoMat.needsUpdate = true;
    }

    return record;
  }

  // Builds every wall-mounted photo frame for a room. Returns a Promise
  // (each photo's natural size must be known before any position can be
  // decided — see loadPhotoAspect above) resolving to the same kind of
  // frame-record array the rest of the engine already expects.
  //
  // Layout order:
  //   1. Preload every photo's aspect ratio and compute its frame size.
  //   2. Split off any photo with a valid `photo.position = { wall, offset }`
  //      manual override; invalid overrides fall back to automatic layout.
  //   3. Round-robin the rest across the four walls (same distribution
  //      as before), then pack each wall's door-free segments with
  //      packSegments — which guarantees real footprints, minimum
  //      spacing, and containment within PHOTO_WALL_MARGIN of every
  //      door/corner.
  //   4. Anything that still doesn't fit gets a second pass across
  //      whichever walls have leftover room; anything that *still*
  //      doesn't fit is skipped with a console warning rather than
  //      overlapping something.
  async function buildPhotoFrames(roomId, roomCfg, generation) {
    const photos = (roomCfg.photos || []).slice();
    if (photos.length === 0) return [];

    // Room 1 is explicitly chronological, sorted by CONFIG's year
    // field (not filename/array order). Numeric-aware so "2003" sorts
    // before "2011" etc; falls back gracefully on odd/placeholder values.
    if (roomId === "room1") {
      photos.sort((a, b) =>
        String(a.year || "").localeCompare(String(b.year || ""), undefined, { numeric: true })
      );
    }

    const loaded = await Promise.all(photos.map((photo) => loadPhotoAspect(photo)));
    if (generation !== roomGeneration) return []; // room changed while images were loading

    const maxDim = photoMaxDimensionForCount(photos.length);
    const items = photos.map((photo, i) => {
      const { w, h } = frameSizeForAspect(loaded[i].aspect, maxDim);
      return { photo, w, h, preloaded: loaded[i] };
    });

    // ---- split manual overrides out from the auto-layout queue ----
    const manual = [];
    const autoQueue = [];
    items.forEach((item) => {
      const pos = item.photo.position;
      if (pos && typeof pos === "object" && pos.wall) {
        const validation = validateManualPhotoPosition(pos.wall, pos.offset, item.w);
        if (validation.ok) {
          manual.push({ ...item, wallId: pos.wall, offset: pos.offset });
          return;
        }
        console.warn(
          `Museum: manual position for photo "${item.photo.caption || item.photo.src || "(untitled)"}" ` +
          `is invalid (${validation.reason}) — using automatic placement instead.`
        );
      }
      autoQueue.push(item);
    });

    // Spread photos through all four walls and three display rows from the
    // outset. The second pass below still borrows free space from another
    // wall when one wall has more doors than the others.
    const perWall = {
      north: [[], [], []], east: [[], [], []], south: [[], [], []], west: [[], [], []],
    };
    autoQueue.forEach((item, i) => {
      const slot = i % (WALL_ORDER.length * PHOTO_ROW_CENTERS.length);
      perWall[WALL_ORDER[slot % WALL_ORDER.length]][Math.floor(slot / WALL_ORDER.length)].push(item);
    });

    const placedRecords = []; // { wallId, offset, y, item }
    let overflow = [];

    WALL_ORDER.forEach((wallId) => {
      const manualOnWall = manual.filter((m) => m.wallId === wallId);

      let segments = computeFreeWallSegments(wallId);
      manualOnWall.forEach((m) => {
        segments = subtractSpanFromSegments(segments, m.offset, m.w);
      });

      const maxUsableLen = segments.reduce(
        (best, seg) => Math.max(best, seg[1] - seg[0] - 2 * PHOTO_WALL_MARGIN),
        0
      );
      perWall[wallId].forEach((rowItems, rowIndex) => {
        const sizedRowItems = rowItems.map((item) => shrinkItemToFit(item, maxUsableLen));
        const { placed, leftover } = packSegmentsInRow(
          segments,
          sizedRowItems,
          PHOTO_ROW_CENTERS[rowIndex]
        );
        placed.forEach((p) => placedRecords.push({ wallId, offset: p.offset, y: p.y, item: p.item }));
        overflow.push(...leftover);
      });

      manualOnWall.forEach((m) => placedRecords.push({ wallId, offset: m.offset, y: PHOTO_HEIGHT, item: m }));
    });

    // Second pass: give any photo that didn't fit on its assigned wall
    // a chance on whichever wall still has slack, accounting for
    // everything placed in the pass above.
    if (overflow.length > 0) {
      const stillOverflow = [];
      let toPlace = overflow;
      overflow = [];
      WALL_ORDER.forEach((wallId) => {
        if (toPlace.length === 0) return;
        let segments = computeFreeWallSegments(wallId);
        placedRecords
          .filter((r) => r.wallId === wallId)
          .forEach((r) => {
            segments = subtractSpanFromSegments(segments, r.offset, r.item.w);
          });
        const maxUsableLen = segments.reduce(
          (best, seg) => Math.max(best, seg[1] - seg[0] - 2 * PHOTO_WALL_MARGIN),
          0
        );
        PHOTO_ROW_CENTERS.forEach((y) => {
          if (toPlace.length === 0) return;
          const sized = toPlace.map((item) => shrinkItemToFit(item, maxUsableLen));
          const { placed, leftover } = packSegmentsInRow(segments, sized, y);
          placed.forEach((p) => placedRecords.push({ wallId, offset: p.offset, y: p.y, item: p.item }));
          toPlace = leftover;
        });
      });
      stillOverflow.push(...toPlace);
      if (stillOverflow.length > 0) {
        console.warn(
          `Museum: ${stillOverflow.length} photo(s) in room "${roomId}" didn't fit on any wall ` +
          `and were skipped rather than risk overlapping a door or another frame. ` +
          `Consider fewer photos in this room, or add manual photo.position overrides.`
        );
      }
    }

    if (generation !== roomGeneration) return []; // room changed while this ran

    return placedRecords.map((r) =>
      buildPhotoFrameMesh(r.wallId, r.offset, r.item.photo, r.item.w, r.item.h, r.item.preloaded, r.y)
    );
  }

  // ---- Room 4: physical-looking, configurable archive exhibits ----
  function makeArchiveLabel(title, category, width = 1.35) {
    const canvas = document.createElement("canvas");
    canvas.width = 700;
    canvas.height = 260;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#160c27";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#d4a84b";
    ctx.lineWidth = 10;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    ctx.textAlign = "center";
    ctx.fillStyle = "#d4a84b";
    ctx.font = "24px monospace";
    ctx.fillText(category.toUpperCase(), canvas.width / 2, 58);
    ctx.fillStyle = "#f4efe6";
    ctx.font = "38px serif";
    const words = String(title).split(" ");
    const lines = [];
    let line = "";
    words.forEach((word) => {
      const candidate = `${line} ${word}`.trim();
      if (ctx.measureText(candidate).width > 600 && line) {
        lines.push(line);
        line = word;
      } else line = candidate;
    });
    if (line) lines.push(line);
    lines.slice(0, 2).forEach((text, index) => ctx.fillText(text, canvas.width / 2, 130 + index * 48));
    const texture = new THREE.CanvasTexture(canvas);
    // Labels are intentionally front-facing only. Rendering both sides
    // makes a canvas label appear as reversed text when viewed from behind.
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.FrontSide });
    material.userData.disposable = true;
    return new THREE.Mesh(new THREE.PlaneGeometry(width, width * 0.37), material);
  }

  function addArchiveLabel(title, category, x, y, z, facing, width) {
    const label = makeArchiveLabel(title, category, width);
    label.position.set(x, y, z);
    label.rotation.y = facing;
    roomGroup.add(label);
  }

  function buildInterestGallery(roomCfg) {
    const interests = Array.isArray(roomCfg.interests) ? roomCfg.interests : [];
    const byType = interests.reduce((groups, item) => {
      const type = item && item.type || "archive";
      (groups[type] ||= []).push(item);
      return groups;
    }, {});
    const brass = new THREE.MeshStandardMaterial({ color: 0xd4a84b, roughness: 0.4, metalness: 0.65 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a2c4e, roughness: 0.78, metalness: 0.08 });
    const paper = new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.8 });
    const rose = new THREE.MeshStandardMaterial({ color: 0xff8fa3, roughness: 0.55 });
    const leaf = new THREE.MeshStandardMaterial({ color: 0x617d54, roughness: 0.8 });
    const gameBlue = new THREE.MeshStandardMaterial({ color: 0x537fa1, roughness: 0.5, metalness: 0.15 });

    const register = (item, x, z) => interestRecords.push({ item, anchor: { x, z } });
    const addMesh = (geometry, material, x, y, z, rotationY = 0) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.rotation.y = rotationY;
      roomGroup.add(mesh);
      return mesh;
    };

    // West wall: a real little bookshelf, with each configured book as a
    // separately inspectable volume rather than a gallery tile.
    (byType.book || []).forEach((item, index) => {
      const z = -2.5 + index * 2.45;
      const x = -ROOM_HALF + 1.3;
      addMesh(new THREE.BoxGeometry(0.42, 2.25, 1.55), wood, x, 1.15, z);
      addMesh(new THREE.BoxGeometry(0.08, 2.45, 1.73), brass, x - 0.24, 1.25, z);
      addMesh(new THREE.BoxGeometry(0.18, 1.2, 0.95), index % 2 ? rose : paper, x + 0.26, 1.65, z);
      addArchiveLabel(item.title, "Reading archive", x + 0.25, 0.78, z, Math.PI / 2, 1.05);
      register(item, x + 0.48, z);
    });

    // North wall: two distinct game cabinets with small warm-lit screens.
    (byType.game || []).forEach((item, index) => {
      const x = index ? 2.65 : -2.65;
      const z = -ROOM_HALF + 1.3;
      addMesh(new THREE.BoxGeometry(1.45, 1.18, 0.56), wood, x, 0.59, z);
      addMesh(new THREE.BoxGeometry(1.18, 0.72, 0.05), gameBlue, x, 1.13, z - 0.32);
      addMesh(new THREE.BoxGeometry(1.55, 0.08, 0.66), brass, x, 0.06, z);
      addArchiveLabel(item.title, "Game cabinet", x, 1.78, z - 0.29, 0, 1.32);
      register(item, x, z + 0.57);
    });

    // East wall: a character-display plinth for each configured One Piece entry.
    (byType["one-piece"] || []).forEach((item, index) => {
      const z = -2.5 + index * 2.45;
      const x = ROOM_HALF - 1.3;
      addMesh(new THREE.CylinderGeometry(0.54, 0.7, 0.72, 16), wood, x, 0.36, z);
      addMesh(new THREE.CylinderGeometry(0.38, 0.38, 0.78, 12), index === 1 ? paper : brass, x, 1.1, z);
      addMesh(new THREE.SphereGeometry(0.3, 14, 10), index === 2 ? leaf : rose, x, 1.68, z);
      addArchiveLabel(item.title, "One Piece display", x - 0.3, 0.55, z, -Math.PI / 2, 1.08);
      register(item, x - 0.48, z);
    });

    // Centre: low flower pedestals leave generous clear routes to every door.
    (byType.flower || []).forEach((item, index) => {
      const x = index ? 2.15 : 0.75;
      const z = 1.65;
      addMesh(new THREE.CylinderGeometry(0.35, 0.52, 0.92, 16), wood, x, 0.46, z);
      addMesh(new THREE.CylinderGeometry(0.18, 0.24, 0.52, 12), brass, x, 1.1, z);
      for (let petal = 0; petal < 6; petal++) {
        const angle = (petal / 6) * Math.PI * 2;
        addMesh(new THREE.SphereGeometry(0.17, 10, 8), item.title.toLowerCase().includes("lil") ? paper : rose,
          x + Math.cos(angle) * 0.2, 1.48, z + Math.sin(angle) * 0.2);
      }
      // The flower plaques are approached from the north/entry side, so
      // their readable face points back into the room rather than south.
      addArchiveLabel(item.title, "Flower study", x, 0.64, z - 0.56, Math.PI, 0.98);
      register(item, x, z - 0.42);
    });
  }

  // ---- Room 5: a small, physical video archive / cinema display ----
  function makeVideoPosterTexture(video) {
    const canvas = document.createElement("canvas");
    canvas.width = 960;
    canvas.height = 540;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#120a22";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#d4a84b";
    ctx.lineWidth = 16;
    ctx.strokeRect(22, 22, canvas.width - 44, canvas.height - 44);
    ctx.fillStyle = "#d4a84b";
    ctx.font = "28px monospace";
    ctx.textAlign = "center";
    ctx.fillText("VIDEO ARCHIVE", canvas.width / 2, 112);
    ctx.fillStyle = "#ff8fa3";
    ctx.beginPath();
    ctx.arc(canvas.width / 2, 255, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a0f2e";
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2 - 18, 218);
    ctx.lineTo(canvas.width / 2 - 18, 292);
    ctx.lineTo(canvas.width / 2 + 45, 255);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f4efe6";
    ctx.font = "42px serif";
    ctx.fillText(video.title || "Video Exhibit", canvas.width / 2, 405);
    ctx.fillStyle = "#ffe4a8";
    ctx.font = "24px sans-serif";
    ctx.fillText("Tap / press E to play", canvas.width / 2, 466);
    return new THREE.CanvasTexture(canvas);
  }

  function buildVideoArchive(roomCfg) {
    const videos = Array.isArray(roomCfg.videos) ? roomCfg.videos : [];
    // An empty configuration still reads as an archive rather than a bare room.
    const displays = videos.length ? videos : [{ title: "Video Archive", note: "Add video entries in js/config.js." }];
    const slots = [
      { x: 0, z: -ROOM_HALF + 0.26, rotation: 0, labelX: 0, labelZ: -ROOM_HALF + 0.42 },
      { x: ROOM_HALF - 0.26, z: 3.2, rotation: -Math.PI / 2, labelX: ROOM_HALF - 0.42, labelZ: 3.2 },
      { x: -3.2, z: ROOM_HALF - 0.26, rotation: Math.PI, labelX: -3.2, labelZ: ROOM_HALF - 0.42 },
      { x: -ROOM_HALF + 0.26, z: 3.2, rotation: Math.PI / 2, labelX: -ROOM_HALF + 0.42, labelZ: 3.2 },
    ];
    const brass = new THREE.MeshStandardMaterial({ color: 0xd4a84b, roughness: 0.42, metalness: 0.62 });
    const casing = new THREE.MeshStandardMaterial({ color: 0x301b47, roughness: 0.68, metalness: 0.1 });

    displays.slice(0, slots.length).forEach((video, index) => {
      const slot = slots[index];
      const backing = new THREE.Mesh(new THREE.BoxGeometry(3.25, 2.12, 0.16), casing);
      backing.position.set(slot.x, 1.95, slot.z);
      backing.rotation.y = slot.rotation;
      roomGroup.add(backing);

      const texture = makeVideoPosterTexture(video);
      const screenMat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.FrontSide });
      screenMat.userData.disposable = true;
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.92, 1.64), screenMat);
      const normalX = Math.sin(slot.rotation);
      const normalZ = Math.cos(slot.rotation);
      screen.position.set(slot.x + normalX * 0.1, 1.95, slot.z + normalZ * 0.1);
      screen.rotation.y = slot.rotation;
      roomGroup.add(screen);

      // A supplied poster replaces the canvas placeholder without touching
      // the lazy video source. If it cannot load, the placeholder remains.
      if (video.poster) {
        const screenGeneration = roomGeneration;
        new THREE.TextureLoader().load(video.poster, (posterTexture) => {
          if (screenGeneration !== roomGeneration || screen.material !== screenMat) {
            posterTexture.dispose();
            return;
          }
          texture.dispose();
          screenMat.map = posterTexture;
          screenMat.needsUpdate = true;
        });
      }

      const frameGroup = new THREE.Group();
      frameGroup.position.set(slot.x, 1.95, slot.z);
      frameGroup.rotation.y = slot.rotation;
      [
        [new THREE.BoxGeometry(3.12, 0.09, 0.1), 0, 0.91],
        [new THREE.BoxGeometry(3.12, 0.09, 0.1), 0, -0.91],
        [new THREE.BoxGeometry(0.09, 1.84, 0.1), 1.515, 0],
        [new THREE.BoxGeometry(0.09, 1.84, 0.1), -1.515, 0],
      ].forEach(([geometry, x, y]) => {
        const rail = new THREE.Mesh(geometry, brass);
        rail.position.set(x, y, 0.16);
        frameGroup.add(rail);
      });
      roomGroup.add(frameGroup);
      addArchiveLabel(video.title || "Video Exhibit", "Video archive", slot.labelX, 0.7, slot.labelZ, slot.rotation, 1.32);
      videoRecords.push({ video, anchor: { x: slot.x - normalX * 0.65, z: slot.z - normalZ * 0.65 } });
    });
  }

  // ---- Room 6: four built-in external wall exhibits + the finale plaque ----
  function makeWebsiteScreenTexture(exhibit) {
    const canvas = document.createElement("canvas");
    canvas.width = 1400;
    canvas.height = 460;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#120a22";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#d4a84b";
    ctx.lineWidth = 16;
    ctx.strokeRect(22, 22, canvas.width - 44, canvas.height - 44);
    ctx.fillStyle = "#d4a84b";
    ctx.font = "26px monospace";
    ctx.textAlign = "center";
    ctx.fillText(exhibit.primary ? "PRIMARY EXHIBIT" : "EXTERNAL EXHIBIT", canvas.width / 2, 105);
    ctx.fillStyle = "#f4efe6";
    ctx.font = "60px serif";
    ctx.fillText(exhibit.title || "External Exhibit", canvas.width / 2, 220);
    ctx.fillStyle = "#ffe4a8";
    ctx.font = "28px sans-serif";
    ctx.fillText(exhibit.url && /^https?:/i.test(exhibit.url) ? "Tap / press E to open" : "URL will be added later", canvas.width / 2, 318);
    ctx.fillStyle = "rgba(244, 239, 230, 0.62)";
    ctx.font = "22px sans-serif";
    ctx.fillText("Built-in museum wall display", canvas.width / 2, 374);
    return new THREE.CanvasTexture(canvas);
  }

  function makeFinalePlaque(title, message) {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 300;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#201336";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#d4a84b";
    ctx.lineWidth = 10;
    ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffe4a8";
    ctx.font = "48px serif";
    ctx.fillText(title || "For You", canvas.width / 2, 88);
    ctx.fillStyle = "#f4efe6";
    ctx.font = "26px sans-serif";
    const words = String(message || "").split(" ");
    const lines = [];
    let line = "";
    words.forEach((word) => {
      const candidate = `${line} ${word}`.trim();
      if (ctx.measureText(candidate).width > 1040 && line) {
        lines.push(line);
        line = word;
      } else line = candidate;
    });
    if (line) lines.push(line);
    lines.slice(0, 3).forEach((text, index) => ctx.fillText(text, canvas.width / 2, 148 + index * 42));
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.FrontSide });
    material.userData.disposable = true;
    return new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.4), material);
  }

  function buildExternalExhibition(roomCfg) {
    const walls = Array.isArray(roomCfg.externalWalls) ? roomCfg.externalWalls.slice(0, 4) : [];
    const primary = walls.find((wall) => wall.primary || wall.id === roomCfg.entryFacingWall) || walls[0];
    const remaining = walls.filter((wall) => wall !== primary);
    const ordered = [primary, ...remaining].filter(Boolean);
    const slots = [
      // The primary display sits south, directly opposite Room 6's north-side entry.
      { wallId: "south", x: 0, z: ROOM_HALF - 0.26, rotation: Math.PI },
      { wallId: "north", x: 3.4, z: -ROOM_HALF + 0.26, rotation: 0, width: 4.8 },
      { wallId: "east", x: ROOM_HALF - 0.26, z: 0, rotation: -Math.PI / 2 },
      { wallId: "west", x: -ROOM_HALF + 0.26, z: 0, rotation: Math.PI / 2 },
    ];
    const casing = new THREE.MeshStandardMaterial({ color: 0x301b47, roughness: 0.7, metalness: 0.1 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xd4a84b, roughness: 0.42, metalness: 0.62 });

    ordered.forEach((exhibit, index) => {
      const slot = slots[index];
      const normalX = Math.sin(slot.rotation);
      const normalZ = Math.cos(slot.rotation);
      const displayWidth = slot.width || 10.6;
      const backing = new THREE.Mesh(new THREE.BoxGeometry(displayWidth, 2.72, 0.16), casing);
      backing.position.set(slot.x, 2.0, slot.z);
      backing.rotation.y = slot.rotation;
      roomGroup.add(backing);
      const texture = makeWebsiteScreenTexture(exhibit);
      const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.FrontSide });
      material.userData.disposable = true;
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(displayWidth - 0.35, 2.38), material);
      screen.position.set(slot.x + normalX * 0.11, 2.0, slot.z + normalZ * 0.11);
      screen.rotation.y = slot.rotation;
      roomGroup.add(screen);
      const frameGroup = new THREE.Group();
      frameGroup.position.set(slot.x, 2.0, slot.z);
      frameGroup.rotation.y = slot.rotation;
      [[new THREE.BoxGeometry(displayWidth - 0.1, 0.1, 0.1), 0, 1.32], [new THREE.BoxGeometry(displayWidth - 0.1, 0.1, 0.1), 0, -1.32],
        [new THREE.BoxGeometry(0.1, 2.74, 0.1), displayWidth / 2 - 0.1, 0], [new THREE.BoxGeometry(0.1, 2.74, 0.1), -displayWidth / 2 + 0.1, 0]]
        .forEach(([geometry, x, y]) => {
          const rail = new THREE.Mesh(geometry, brass);
          rail.position.set(x, y, 0.17);
          frameGroup.add(rail);
        });
      roomGroup.add(frameGroup);
      websiteRecords.push({ exhibit, anchor: { x: slot.x - normalX * 1.1, z: slot.z - normalZ * 1.1 } });
    });

    // This is part of the focal wall, not a fifth external exhibit.
    const finale = makeFinalePlaque(CONFIG.finale && CONFIG.finale.title, CONFIG.finale && CONFIG.finale.message);
    finale.position.set(0, 0.52, ROOM_HALF - 0.43);
    finale.rotation.y = Math.PI;
    roomGroup.add(finale);
  }

  // ---- Milestone 5: Room 4's separate, lazy playlist-board exhibit ----
  function buildPlaylistBoard(roomCfg) {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 520;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#201336";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#d4a84b";
    ctx.lineWidth = 16;
    ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);
    ctx.fillStyle = "#d4a84b";
    ctx.font = "28px monospace";
    ctx.textAlign = "center";
    ctx.fillText("PLAYLIST EXHIBIT", canvas.width / 2, 125);
    ctx.fillStyle = "#f4efe6";
    ctx.font = "64px serif";
    ctx.fillText("Cherry's Playlist", canvas.width / 2, 255);
    ctx.font = "30px sans-serif";
    ctx.fillStyle = "#ffe4a8";
    ctx.fillText("Tap / press E to view", canvas.width / 2, 355);

    const texture = new THREE.CanvasTexture(canvas);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(4.7, 2.7),
      new THREE.MeshBasicMaterial({ map: texture })
    );
    // Room 4's south wall is free with the current door distribution.
    mesh.position.set(0, 1.9, ROOM_HALF - WALL_THICKNESS / 2 - 0.08);
    mesh.rotation.y = Math.PI;
    roomGroup.add(mesh);
    playlistBoardRecord = { anchor: { x: 0, z: ROOM_HALF }, roomCfg, mesh, texture };
  }

  function playlistIdFromUrl(url) {
    if (!url || !/^https?:/i.test(url)) return null;
    try { return new URL(url).searchParams.get("list"); } catch (e) { return null; }
  }

  function openPlaylistBoard(record) {
    if (!record || isAnyOverlayOpen()) return;
    const url = record.roomCfg.playlistUrl || "";
    const id = playlistIdFromUrl(url);
    playlistEmbedWrapEl.replaceChildren();
    playlistOpenLinkEl.classList.add("hidden");
    const showPlaylistFallback = () => {
      playlistEmbedWrapEl.replaceChildren();
      const fallback = document.createElement("p");
      fallback.className = "playlist-fallback";
      fallback.textContent = "Cherry's playlist cannot be shown here right now. You can open it directly instead.";
      playlistEmbedWrapEl.appendChild(fallback);
      if (/^https?:/i.test(url)) {
        playlistOpenLinkEl.href = url;
        playlistOpenLinkEl.classList.remove("hidden");
      }
    };
    if (id) {
      const iframe = document.createElement("iframe");
      iframe.title = "Cherry's YouTube playlist";
      iframe.loading = "lazy";
      iframe.allow = "autoplay; encrypted-media; picture-in-picture";
      iframe.src = `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(id)}`;
      iframe.addEventListener("error", showPlaylistFallback, { once: true });
      playlistEmbedWrapEl.appendChild(iframe);
      playlistOpenLinkEl.href = url;
      playlistOpenLinkEl.classList.remove("hidden");
    } else {
      const fallback = document.createElement("p");
      fallback.className = "playlist-fallback";
      fallback.textContent = "Cherry's playlist will appear here once a valid YouTube playlist URL is added in js/config.js.";
      playlistEmbedWrapEl.appendChild(fallback);
    }
    playlistOverlayEl.classList.remove("hidden");
    keys.forward = keys.backward = keys.left = keys.right = false;
  }

  function closePlaylistBoard() {
    playlistOverlayEl.classList.add("hidden");
    playlistEmbedWrapEl.replaceChildren(); // unload the visible embed until next interaction
  }

  playlistOverlayCloseEl.addEventListener("click", closePlaylistBoard);
  playlistOverlayBackdropEl.addEventListener("click", closePlaylistBoard);

  function buildCeilingArchitecture() {
    const y = WALL_HEIGHT - 0.18;
    const addBeam = (width, depth, x, z, height = 0.22) => {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), ceilingWoodMat);
      beam.position.set(x, y, z);
      roomGroup.add(beam);
    };
    const inset = ROOM_HALF - 0.5;
    // One strong perimeter and two cross beams form three generous coffers.
    addBeam(ROOM_SIZE - 0.65, 0.34, 0, -inset, 0.32);
    addBeam(ROOM_SIZE - 0.65, 0.34, 0, inset, 0.32);
    addBeam(0.34, ROOM_SIZE - 0.65, -inset, 0, 0.32);
    addBeam(0.34, ROOM_SIZE - 0.65, inset, 0, 0.32);
    [-2.35, 2.35].forEach((z) => addBeam(ROOM_SIZE - 1.0, 0.28, 0, z, 0.26));

    [-4.7, 0, 4.7].forEach((z) => {
      const canopy = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, 0.12, 16), sconceMat);
      canopy.position.set(0, WALL_HEIGHT - 0.34, z);
      roomGroup.add(canopy);
      const pendant = new THREE.PointLight(0xffcf82, 0.26, 5.0, 2);
      pendant.position.set(0, WALL_HEIGHT - 0.48, z);
      roomGroup.add(pendant);
    });
  }

  function buildWallSconces() {
    // Sconces sit above the picture-hanging zone, not beside the frames.
    const fixtureHeight = 5.62;
    const positions = [
      [-4.8, -ROOM_HALF + 0.22], [4.8, -ROOM_HALF + 0.22],
      [-4.8, ROOM_HALF - 0.22], [4.8, ROOM_HALF - 0.22],
    ];
    positions.forEach(([x, z], index) => {
      const fixture = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.36, 12), sconceMat);
      fixture.rotation.z = Math.PI / 2;
      fixture.position.set(x, fixtureHeight, z);
      roomGroup.add(fixture);
      if (index < 2) {
        const glow = new THREE.PointLight(0xffc46f, 0.26, 3.6, 2);
        glow.position.set(x, fixtureHeight, z * 0.97);
        roomGroup.add(glow);
      }
    });
  }

  function buildFloorDetails(roomId) {
    // Broad, low-contrast parquet fields read as dark flooring rather than
    // a bright grid. The room's special galleries receive a quiet runner.
    [-4.6, -1.55, 1.55, 4.6].forEach((z, row) => {
      [-4.6, -1.55, 1.55, 4.6].forEach((x, column) => {
        const horizontal = (row + column) % 2 === 0;
        const inlay = new THREE.Mesh(new THREE.BoxGeometry(horizontal ? 2.45 : 0.075, 0.014, horizontal ? 0.075 : 2.45), floorInlayMat);
        inlay.position.set(x, 0.01, z);
        roomGroup.add(inlay);
      });
    });
    if (["room4", "room5", "room6"].includes(roomId)) {
      const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 5.8), rugMat);
      rug.rotation.x = -Math.PI / 2;
      rug.position.y = 0.017;
      roomGroup.add(rug);
    }
  }

  function addGalleryLightPools() {
    // Four focused, wall-directed accents. Their origins are set forward
    // from the wall and high above the hanging zone, so no fixture appears
    // attached to a photograph.
    const pools = [[0, -3.9, 0, -ROOM_HALF + 0.32], [0, 3.9, 0, ROOM_HALF - 0.32], [-3.9, 0, -ROOM_HALF + 0.32, 0], [3.9, 0, ROOM_HALF - 0.32, 0]];
    pools.forEach(([x, z, targetX, targetZ]) => {
      const light = new THREE.SpotLight(0xffd497, 0.98, 9.4, Math.PI / 7, 0.75, 1.6);
      light.position.set(x, WALL_HEIGHT - 0.48, z);
      light.target.position.set(targetX, 2.7, targetZ);
      roomGroup.add(light);
      roomGroup.add(light.target);
    });
  }

  function buildDecorativeFinalEntrance() {
    // Room 6's north wall is intentionally closed: this preserves the
    // one-way graph while making the arrival side feel architecturally real.
    const z = -ROOM_HALF + WALL_THICKNESS / 2 + 0.01;
    const backing = new THREE.Mesh(new THREE.BoxGeometry(DOOR_WIDTH + 0.24, DOOR_HEIGHT + 0.24, 0.12), trimMat);
    backing.position.set(0, (DOOR_HEIGHT + 0.24) / 2, z + 0.02);
    roomGroup.add(backing);
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x4b2c47, roughness: 0.58, metalness: 0.12 });
    panelMat.userData.disposable = true;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(DOOR_WIDTH - 0.12, DOOR_HEIGHT - 0.12, 0.08), panelMat);
    panel.position.set(0, DOOR_HEIGHT / 2, z + 0.09);
    roomGroup.add(panel);
    const label = makeDoorLabelMesh("Museum Entrance", 1.42);
    label.position.set(0, DOOR_HEIGHT + 0.43, z + 0.1);
    roomGroup.add(label);
  }

  function openArchiveExhibit(record) {
    if (!record || isAnyOverlayOpen()) return;
    const item = record.item || {};
    exhibitOverlayLabelEl.textContent = `${item.type || "archive"} exhibit`;
    exhibitOverlayTitleEl.textContent = item.title || "Archive exhibit";
    exhibitOverlayDescriptionEl.textContent = item.description || "A curated exhibit in Cherry's archive.";
    exhibitOverlayEl.classList.remove("hidden");
    keys.forward = keys.backward = keys.left = keys.right = false;
  }

  function closeArchiveExhibit() {
    exhibitOverlayEl.classList.add("hidden");
  }

  exhibitOverlayCloseEl.addEventListener("click", closeArchiveExhibit);
  exhibitOverlayBackdropEl.addEventListener("click", closeArchiveExhibit);

  function openVideoViewer(record) {
    if (!record || isAnyOverlayOpen()) return;
    const video = record.video || {};
    videoOverlayTitleEl.textContent = video.title || "Video Exhibit";
    videoOverlayNoteEl.textContent = video.note || "";
    videoPlayerWrapEl.replaceChildren();
    if (video.src) {
      const player = document.createElement("video");
      player.controls = true;
      player.preload = "none";
      player.playsInline = true;
      if (video.poster) player.poster = video.poster;
      player.src = video.src; // the source is assigned only after opening
      player.addEventListener("error", () => {
        videoPlayerWrapEl.replaceChildren();
        const fallback = document.createElement("p");
        fallback.className = "video-fallback";
        fallback.textContent = "This video is not available yet. Add a local video file in js/config.js when it is ready.";
        videoPlayerWrapEl.appendChild(fallback);
      }, { once: true });
      videoPlayerWrapEl.appendChild(player);
    } else {
      const fallback = document.createElement("p");
      fallback.className = "video-fallback";
      fallback.textContent = "This video exhibit is ready for a local video file. Add its src in js/config.js when it is available.";
      videoPlayerWrapEl.appendChild(fallback);
    }
    videoOverlayEl.classList.remove("hidden");
    keys.forward = keys.backward = keys.left = keys.right = false;
  }

  function closeVideoViewer() {
    const player = videoPlayerWrapEl.querySelector("video");
    if (player) {
      player.pause();
      player.removeAttribute("src");
      player.load();
    }
    videoPlayerWrapEl.replaceChildren();
    videoOverlayEl.classList.add("hidden");
  }

  videoOverlayCloseEl.addEventListener("click", closeVideoViewer);
  videoOverlayBackdropEl.addEventListener("click", closeVideoViewer);

  function openWebsiteExhibit(record) {
    if (!record || isAnyOverlayOpen()) return;
    const exhibit = record.exhibit || {};
    const url = exhibit.url || "";
    const isValidUrl = /^https?:/i.test(url);
    websiteOverlayTitleEl.textContent = exhibit.title || "External Exhibit";
    websiteEmbedWrapEl.replaceChildren();
    websiteOpenLinkEl.classList.add("hidden");
    const showFallback = () => {
      websiteEmbedWrapEl.replaceChildren();
      const fallback = document.createElement("p");
      fallback.className = "website-fallback";
      fallback.textContent = isValidUrl
        ? "This exhibit opens externally."
        : "This exhibit will be available once its public URL is added in js/config.js.";
      websiteEmbedWrapEl.appendChild(fallback);
      if (isValidUrl) {
        websiteOpenLinkEl.href = url;
        websiteOpenLinkEl.classList.remove("hidden");
      }
    };
    if (isValidUrl) {
      const iframe = document.createElement("iframe");
      iframe.title = exhibit.title || "External museum exhibit";
      iframe.loading = "lazy";
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      iframe.src = url;
      iframe.addEventListener("error", showFallback, { once: true });
      websiteEmbedWrapEl.appendChild(iframe);
      // Keep the compliant escape hatch available even if a remote site
      // later declines iframe embedding through its own security policy.
      websiteOpenLinkEl.href = url;
      websiteOpenLinkEl.classList.remove("hidden");
    } else showFallback();
    websiteOverlayEl.classList.remove("hidden");
    keys.forward = keys.backward = keys.left = keys.right = false;
  }

  function closeWebsiteExhibit() {
    websiteEmbedWrapEl.replaceChildren(); // unload the external page on close
    websiteOverlayEl.classList.add("hidden");
  }

  websiteOverlayCloseEl.addEventListener("click", closeWebsiteExhibit);
  websiteOverlayBackdropEl.addEventListener("click", closeWebsiteExhibit);

  function buildRoomShell(roomId) {
    clearRoomGroup();
    const generation = roomGeneration; // captured after clearRoomGroup's bump
    currentRoomId = roomId;
    const roomCfg = CONFIG.rooms[roomId];
    if (!roomCfg) {
      console.error(`Museum: no CONFIG.rooms entry for "${roomId}"`);
      doorRecords = [];
      photoRecords = [];
      return;
    }

    const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE), floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    roomGroup.add(floorMesh);
    buildFloorDetails(roomId);

    const ceilingMesh = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE), ceilingMat);
    ceilingMesh.rotation.x = Math.PI / 2;
    ceilingMesh.position.y = WALL_HEIGHT;
    roomGroup.add(ceilingMesh);
    buildCeilingArchitecture();
    buildWallSconces();
    addGalleryLightPools();

    const doors = roomCfg.doors || [];
    const doorsByWall = { north: [], east: [], south: [], west: [] };
    doors.forEach((d, i) => doorsByWall[WALL_ORDER[i % 4]].push(d));

    const newDoorRecords = [];
    WALL_ORDER.forEach((wallId) => {
      const doorsOnWall = doorsByWall[wallId];
      const offsets = computeOffsets(doorsOnWall.length);
      const doorsWithOffsets = doorsOnWall.map((d, i) => ({ ...d, offset: offsets[i] }));
      buildWallWithGaps(wallId, doorsWithOffsets);
      doorsWithOffsets.forEach((d) => {
        const connectionId = connectionIdFor(roomId, d.target);
        const locked = !unlockedConnections.has(connectionId);
        newDoorRecords.push(buildDoorVisual(wallId, d, d.offset, connectionId, locked));
      });
    });
    doorRecords = newDoorRecords;
    if (roomId === "room6") buildDecorativeFinalEntrance();

    // Photo frames are placed after doors so their wall-segment
    // placement can see (and avoid) the door gaps just built.
    // buildPhotoFrames is async (it preloads every photo's real aspect
    // ratio before deciding where anything goes — see its comment for
    // why), so photoRecords starts empty and is filled in once layout
    // resolves. The `generation` check discards a result that finishes
    // after the player has already left this room.
    photoRecords = [];
    buildPhotoFrames(roomId, roomCfg, generation).then((records) => {
      if (generation !== roomGeneration) return;
      photoRecords = records;
    });

    if (roomId === "room4") {
      buildInterestGallery(roomCfg);
      buildPlaylistBoard(roomCfg);
    }
    if (roomId === "room5") buildVideoArchive(roomCfg);
    if (roomId === "room6") buildExternalExhibition(roomCfg);

    if (roomIndicatorEl) {
      roomIndicatorEl.textContent = `Exhibit ${roomCfg.exhibitNo} — ${roomCfg.title}`;
    }
    if (entered) showRoomPlaque(roomCfg);
  }

  // ---- Milestone 3: door interaction — proximity, questions,
  // unlocking, and room-to-room transitions ----
  const INTERACT_DISTANCE = 2.1;   // how close counts as "near" a door
  const DOOR_COOLDOWN_MS = 1300;   // pause before a closed/skipped door can auto-reopen

  let activeDoorRecord = null; // door currently shown in the question overlay
  let nearDoor = null;         // door currently in proximity range (for prompt + interact)
  let nearPhoto = null;        // photo frame currently in proximity range
  let nearInterest = null;
  let nearVideo = null;
  let nearWebsite = null;
  let nearPlaylistBoard = null;

  function isDoorOverlayOpen() {
    return !doorOverlayEl.classList.contains("hidden");
  }

  function isPhotoOverlayOpen() {
    return !photoOverlayEl.classList.contains("hidden");
  }

  function isPlaylistOverlayOpen() {
    return !playlistOverlayEl.classList.contains("hidden");
  }

  function isExhibitOverlayOpen() {
    return !exhibitOverlayEl.classList.contains("hidden");
  }

  function isVideoOverlayOpen() {
    return !videoOverlayEl.classList.contains("hidden");
  }

  function isWebsiteOverlayOpen() {
    return !websiteOverlayEl.classList.contains("hidden");
  }

  function isAnyOverlayOpen() {
    return isDoorOverlayOpen() || isPhotoOverlayOpen() || isPlaylistOverlayOpen() || isExhibitOverlayOpen() || isVideoOverlayOpen() || isWebsiteOverlayOpen();
  }

  function findDoorAtWall(wallId, tangentCoord) {
    return doorRecords.find(
      (r) => r.wallId === wallId && Math.abs(tangentCoord - r.offset) <= r.gapHalfWidth
    );
  }

  function openDoorOverlay(record) {
    if (!record || record.locked === false || isPhotoOverlayOpen()) return;
    activeDoorRecord = record;
    const q = record.question || {};
    doorOverlayLabelEl.textContent = record.label || "Locked Door";
    doorOverlayPromptEl.textContent = q.prompt || "Answer to unlock this door.";
    doorOverlayInputEl.value = "";
    doorOverlayFeedbackEl.textContent = "";
    doorOverlayFeedbackEl.classList.remove("success");
    doorOverlayHintEl.textContent = "";
    doorOverlayHintEl.classList.add("hidden");
    doorOverlaySkipEl.classList.add("hidden");
    doorOverlayEl.classList.remove("hidden");
    if (doorPromptEl) doorPromptEl.classList.remove("visible");
    // reset per-visit key state so a stray "e" doesn't leak into movement
    keys.forward = keys.backward = keys.left = keys.right = false;
    setTimeout(() => doorOverlayInputEl.focus(), 30);
  }

  function closeDoorOverlay() {
    if (activeDoorRecord) {
      activeDoorRecord.cooldownUntil = performance.now() + DOOR_COOLDOWN_MS;
    }
    activeDoorRecord = null;
    doorOverlayEl.classList.add("hidden");
  }

  function unlockConnection(record) {
    unlockedConnections.add(record.connectionId);
    saveUnlockedConnections();
    record.locked = false;
    applyDoorLockVisual(record);
  }

  const WRONG_ANSWER_NUDGES = [
    "Not quite — give it another go?",
    "Close, but not it. One more try?",
    "Still not it — take a guess, it's okay!",
  ];

  function submitDoorAnswer() {
    const record = activeDoorRecord;
    if (!record) return;
    const q = record.question || {};
    const raw = doorOverlayInputEl.value || "";
    const normalized = raw.trim().toLowerCase();

    if (!normalized) {
      doorOverlayFeedbackEl.classList.remove("success");
      doorOverlayFeedbackEl.textContent = "Type an answer first — even a guess!";
      return;
    }

    const answers = (q.answers || []).map((a) => String(a).trim().toLowerCase());
    const isCorrect = answers.length > 0 && answers.includes(normalized);

    if (isCorrect) {
      unlockConnection(record);
      doorOverlayFeedbackEl.classList.add("success");
      doorOverlayFeedbackEl.textContent = "Correct — the door opens…";
      doorOverlaySkipEl.classList.add("hidden");
      activeDoorRecord = null; // unlocked: no cooldown needed
      setTimeout(() => doorOverlayEl.classList.add("hidden"), 650);
      return;
    }

    record.attempts = (record.attempts || 0) + 1;
    doorOverlayFeedbackEl.classList.remove("success");
    doorOverlayFeedbackEl.textContent =
      WRONG_ANSWER_NUDGES[Math.min(record.attempts - 1, WRONG_ANSWER_NUDGES.length - 1)];

    if (record.attempts >= 2 && q.hint) {
      doorOverlayHintEl.textContent = `Hint: ${q.hint}`;
      doorOverlayHintEl.classList.remove("hidden");
    }
    if (record.attempts >= 3) {
      doorOverlaySkipEl.classList.remove("hidden");
    }
    doorOverlayInputEl.select();
  }

  doorOverlaySubmitEl.addEventListener("click", submitDoorAnswer);
  doorOverlayInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitDoorAnswer();
    }
  });
  doorOverlaySkipEl.addEventListener("click", closeDoorOverlay);
  doorOverlayCloseEl.addEventListener("click", closeDoorOverlay);

  // ---- Milestone 4: photo lightbox ----
  function openPhotoLightbox(record) {
    if (!record || isDoorOverlayOpen()) return;
    const photo = record.photo || {};
    photoOverlayYearEl.textContent = photo.year || "";
    photoOverlayCaptionEl.textContent = photo.caption || "";
    photoOverlayNoteEl.textContent = photo.note || "";
    // Lazy-load: the full-size <img> only ever gets a src when the
    // lightbox is actually opened. Uses a `full` field if the photo
    // supplies one (higher-res than the wall thumbnail), else falls
    // back to the same src used on the wall.
    photoOverlayImageEl.src = photo.full || photo.src || "";
    photoOverlayImageEl.alt = photo.caption || "Museum photo";
    photoOverlayImageEl.onerror = () => {
      photoOverlayImageEl.removeAttribute("src");
      photoOverlayImageEl.alt = "Photo not available yet";
    };
    photoOverlayEl.classList.remove("hidden");
    if (doorPromptEl) doorPromptEl.classList.remove("visible");
    keys.forward = keys.backward = keys.left = keys.right = false;
  }

  function closePhotoLightbox() {
    photoOverlayEl.classList.add("hidden");
    photoOverlayImageEl.removeAttribute("src");
  }

  photoOverlayCloseEl.addEventListener("click", closePhotoLightbox);
  photoOverlayBackdropEl.addEventListener("click", closePhotoLightbox);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isDoorOverlayOpen()) closeDoorOverlay();
    else if (e.key === "Escape" && isPhotoOverlayOpen()) closePhotoLightbox();
    else if (e.key === "Escape" && isPlaylistOverlayOpen()) closePlaylistBoard();
    else if (e.key === "Escape" && isExhibitOverlayOpen()) closeArchiveExhibit();
    else if (e.key === "Escape" && isVideoOverlayOpen()) closeVideoViewer();
    else if (e.key === "Escape" && isWebsiteOverlayOpen()) closeWebsiteExhibit();
  });
  const wainscotMat = new THREE.MeshStandardMaterial({
    color: 0x21132f,
    roughness: 0.78,
    metalness: 0.08,
  });
  const upperPanelMat = new THREE.MeshStandardMaterial({
    color: 0x241638,
    roughness: 0.9,
    metalness: 0.03,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x9d7938,
    roughness: 0.38,
    metalness: 0.68,
  });
  const ceilingWoodMat = new THREE.MeshStandardMaterial({
    color: 0x211713,
    roughness: 0.66,
    metalness: 0.06,
  });
  const floorInlayMat = new THREE.MeshStandardMaterial({
    color: 0x241820,
    roughness: 0.78,
    metalness: 0.04,
  });
  const rugMat = new THREE.MeshStandardMaterial({
    color: 0x221329,
    roughness: 0.94,
    metalness: 0,
  });
  const sconceMat = new THREE.MeshStandardMaterial({
    color: 0x9d7938,
    emissive: 0x351c0b,
    emissiveIntensity: 0.32,
    roughness: 0.38,
    metalness: 0.68,
  });

  function attemptOpenLockedDoor(record) {
    if (!record || record.locked === false) return;
    if (isAnyOverlayOpen()) return;
    const now = performance.now();
    if (now < (record.cooldownUntil || 0)) return;
    openDoorOverlay(record);
  }

  function updateInteractPrompt() {
    if (!doorPromptEl) return;
    if (isAnyOverlayOpen()) {
      doorPromptEl.classList.remove("visible");
      nearDoor = null;
      nearPhoto = null;
      nearInterest = null;
      nearVideo = null;
      nearWebsite = null;
      nearPlaylistBoard = null;
      return;
    }

    let closestDoor = null;
    let closestDoorDist = INTERACT_DISTANCE;
    doorRecords.forEach((r) => {
      const dist = Math.hypot(camera.position.x - r.anchor.x, camera.position.z - r.anchor.z);
      if (dist < closestDoorDist) {
        closestDoorDist = dist;
        closestDoor = r;
      }
    });

    let closestPhoto = null;
    let closestPhotoDist = PHOTO_INTERACT_DISTANCE;
    photoRecords.forEach((r) => {
      const dist = Math.hypot(camera.position.x - r.anchor.x, camera.position.z - r.anchor.z);
      if (dist < closestPhotoDist) {
        closestPhotoDist = dist;
        closestPhoto = r;
      }
    });

    let closestInterest = null;
    let closestInterestDist = PHOTO_INTERACT_DISTANCE;
    interestRecords.forEach((r) => {
      const dist = Math.hypot(camera.position.x - r.anchor.x, camera.position.z - r.anchor.z);
      if (dist < closestInterestDist) {
        closestInterestDist = dist;
        closestInterest = r;
      }
    });

    let closestVideo = null;
    let closestVideoDist = PHOTO_INTERACT_DISTANCE;
    videoRecords.forEach((r) => {
      const dist = Math.hypot(camera.position.x - r.anchor.x, camera.position.z - r.anchor.z);
      if (dist < closestVideoDist) {
        closestVideoDist = dist;
        closestVideo = r;
      }
    });

    let closestWebsite = null;
    let closestWebsiteDist = INTERACT_DISTANCE;
    websiteRecords.forEach((r) => {
      const dist = Math.hypot(camera.position.x - r.anchor.x, camera.position.z - r.anchor.z);
      if (dist < closestWebsiteDist) {
        closestWebsiteDist = dist;
        closestWebsite = r;
      }
    });

    const playlistDist = playlistBoardRecord
      ? Math.hypot(camera.position.x - playlistBoardRecord.anchor.x, camera.position.z - playlistBoardRecord.anchor.z)
      : Infinity;

    // All nearby interactables compete by physical distance. This keeps a
    // single clear prompt when a door and a Room 4 exhibit overlap.
    const closestObjectDist = Math.min(closestPhoto ? closestPhotoDist : Infinity,
      closestInterest ? closestInterestDist : Infinity, closestVideo ? closestVideoDist : Infinity,
      closestWebsite ? closestWebsiteDist : Infinity, playlistDist);
    if (closestDoor && closestDoorDist <= closestObjectDist) {
      nearDoor = closestDoor;
      nearPhoto = null;
      nearInterest = null;
      nearVideo = null;
      nearWebsite = null;
      nearPlaylistBoard = null;
      doorPromptEl.textContent = nearDoor.locked
        ? `${nearDoor.label} — tap / press E to answer`
        : `${nearDoor.label} — walk through`;
      doorPromptEl.classList.add("visible");
    } else if (closestPhoto && closestPhotoDist <= Math.min(closestInterest ? closestInterestDist : Infinity,
      closestVideo ? closestVideoDist : Infinity, closestWebsite ? closestWebsiteDist : Infinity, playlistDist)) {
      nearDoor = null;
      nearPhoto = closestPhoto;
      nearInterest = null;
      nearVideo = null;
      nearWebsite = null;
      nearPlaylistBoard = null;
      doorPromptEl.textContent = "Tap to view / press E to inspect";
      doorPromptEl.classList.add("visible");
    } else if (closestInterest && closestInterestDist <= Math.min(closestVideo ? closestVideoDist : Infinity,
      closestWebsite ? closestWebsiteDist : Infinity, playlistDist)) {
      nearDoor = null;
      nearPhoto = null;
      nearInterest = closestInterest;
      nearVideo = null;
      nearWebsite = null;
      nearPlaylistBoard = null;
      doorPromptEl.textContent = "Tap to inspect / press E to inspect";
      doorPromptEl.classList.add("visible");
    } else if (closestVideo && closestVideoDist <= Math.min(closestWebsite ? closestWebsiteDist : Infinity, playlistDist)) {
      nearDoor = null;
      nearPhoto = null;
      nearInterest = null;
      nearVideo = closestVideo;
      nearWebsite = null;
      nearPlaylistBoard = null;
      doorPromptEl.textContent = "Tap to play / press E to play";
      doorPromptEl.classList.add("visible");
    } else if (closestWebsite && closestWebsiteDist <= playlistDist) {
      nearDoor = null;
      nearPhoto = null;
      nearInterest = null;
      nearVideo = null;
      nearWebsite = closestWebsite;
      nearPlaylistBoard = null;
      doorPromptEl.textContent = "Tap to open / press E to inspect";
      doorPromptEl.classList.add("visible");
    } else if (playlistBoardRecord && playlistDist < INTERACT_DISTANCE) {
      nearDoor = null;
      nearPhoto = null;
      nearInterest = null;
      nearVideo = null;
      nearWebsite = null;
      nearPlaylistBoard = playlistBoardRecord;
      doorPromptEl.textContent = "Playlist exhibit — tap / press E to view";
      doorPromptEl.classList.add("visible");
    } else {
      nearDoor = null;
      nearPhoto = null;
      nearInterest = null;
      nearVideo = null;
      nearWebsite = null;
      nearPlaylistBoard = null;
      doorPromptEl.classList.remove("visible");
    }
  }

  function handleInteract() {
    if (!entered || isAnyOverlayOpen()) return;
    if (nearDoor && nearDoor.locked) {
      attemptOpenLockedDoor(nearDoor);
    } else if (nearPhoto) {
      openPhotoLightbox(nearPhoto);
    } else if (nearInterest) {
      openArchiveExhibit(nearInterest);
    } else if (nearVideo) {
      openVideoViewer(nearVideo);
    } else if (nearWebsite) {
      openWebsiteExhibit(nearWebsite);
    } else if (nearPlaylistBoard) {
      openPlaylistBoard(nearPlaylistBoard);
    }
  }

  function spawnPlayerEnteringFrom(targetRoomId, fromRoomId) {
    // Try to arrive just inside the door that leads back to the room
    // the player came from, facing further into the new room.
    const record = doorRecords.find((r) => r.target === fromRoomId);
    const inward = 1.8;
    if (record) {
      camera.position.set(
        record.anchor.x + record.normal.x * inward,
        EYE_HEIGHT,
        record.anchor.z + record.normal.z * inward
      );
      yaw = Math.atan2(-record.normal.x, -record.normal.z);
    } else {
      // Room 6 is reached through a one-way final door. Its intended entry
      // view is the primary Wall of Voices display on the opposite wall.
      camera.position.set(0, EYE_HEIGHT, 2);
      // buildExternalExhibition assigns the focal exhibit to the south wall.
      yaw = Math.PI;
    }
    pitch = 0;
  }

  function triggerTransition(record) {
    const targetId = record.target;
    if (!CONFIG.rooms[targetId]) {
      console.error(`Museum: missing target room "${targetId}" for door`, record);
      return;
    }
    const fromRoomId = currentRoomId;
    buildRoomShell(targetId);
    spawnPlayerEnteringFrom(targetId, fromRoomId);
    if (doorPromptEl) doorPromptEl.classList.remove("visible");
    nearDoor = null;
  }

  // ---- build the first room now that all door-interaction helpers exist ----
  buildRoomShell("room1");
  let hasShownInitialPlaque = false;
  const showInitialPlaque = () => {
    if (hasShownInitialPlaque) return;
    hasShownInitialPlaque = true;
    showRoomPlaque(CONFIG.rooms[currentRoomId]);
  };
  enterBtn.addEventListener("click", showInitialPlaque);
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && entered) showInitialPlaque();
  });

  // ---- player start position ----
  camera.position.set(0, EYE_HEIGHT, 3);
  camera.rotation.order = "YXZ"; // standard FPS-style rotation order
  let yaw = 0;
  let pitch = 0;
  const PITCH_LIMIT = Math.PI / 2 - 0.05;

  // ---- keyboard movement state (WASD + arrow keys) ----
  const keys = { forward: false, backward: false, left: false, right: false };
  const KEY_MAP = {
    KeyW: "forward", ArrowUp: "forward",
    KeyS: "backward", ArrowDown: "backward",
    KeyA: "left", ArrowLeft: "left",
    KeyD: "right", ArrowRight: "right",
  };

  window.addEventListener("keydown", (e) => {
    if (!entered) return;
    // While an overlay (question or photo lightbox) is open, let the
    // player type/scroll freely — don't hijack keystrokes as
    // movement/interact input.
    if (isAnyOverlayOpen()) return;
    const dir = KEY_MAP[e.code];
    if (dir) {
      keys[dir] = true;
      e.preventDefault();
      return;
    }
    if (e.code === "KeyE") {
      handleInteract();
    }
  });
  window.addEventListener("keyup", (e) => {
    const dir = KEY_MAP[e.code];
    if (dir) keys[dir] = false;
  });

  // ---- look controls: click-and-drag (desktop) / touch-drag (mobile) ----
  // Deliberately not using the Pointer Lock API: it needs an explicit
  // permission grant that sandboxed preview iframes can refuse outright,
  // whereas drag-to-look works everywhere with no permission step.
  const LOOK_SPEED = 0.0032;
  let looking = false;
  let lastPointerX = 0;
  let lastPointerY = 0;

  function startLook(x, y) {
    looking = true;
    lastPointerX = x;
    lastPointerY = y;
  }
  function moveLook(x, y) {
    if (!looking) return;
    const dx = x - lastPointerX;
    const dy = y - lastPointerY;
    lastPointerX = x;
    lastPointerY = y;
    yaw -= dx * LOOK_SPEED;
    pitch -= dy * LOOK_SPEED;
    pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
  }
  function endLook() {
    looking = false;
  }

  const canvasEl = renderer.domElement;

  canvasEl.addEventListener("mousedown", (e) => {
    if (!entered) return;
    startLook(e.clientX, e.clientY);
  });
  window.addEventListener("mousemove", (e) => moveLook(e.clientX, e.clientY));
  window.addEventListener("mouseup", endLook);

  canvasEl.addEventListener("touchstart", (e) => {
    if (!entered) return;
    const t = e.changedTouches[0];
    startLook(t.clientX, t.clientY);
  }, { passive: true });
  canvasEl.addEventListener("touchmove", (e) => {
    const t = e.changedTouches[0];
    moveLook(t.clientX, t.clientY);
  }, { passive: true });
  canvasEl.addEventListener("touchend", endLook);
  canvasEl.addEventListener("touchcancel", endLook);

  // ---- virtual joystick (mobile movement) ----
  const joystick = { x: 0, y: 0, active: false, pointerId: null };
  const joyBase = document.getElementById("joystick-base");
  const joyKnob = document.getElementById("joystick-knob");
  const JOY_RADIUS = 40; // max knob travel in px

  function joyReset() {
    joystick.x = 0;
    joystick.y = 0;
    joystick.active = false;
    joystick.pointerId = null;
    joyKnob.style.transform = "translate(0px, 0px)";
  }

  function joyUpdate(clientX, clientY) {
    const rect = joyBase.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > JOY_RADIUS) {
      dx = (dx / dist) * JOY_RADIUS;
      dy = (dy / dist) * JOY_RADIUS;
    }
    joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    joystick.x = dx / JOY_RADIUS; // -1 (left) .. 1 (right)
    joystick.y = dy / JOY_RADIUS; // -1 (up/forward) .. 1 (down/backward)
  }

  if (joyBase && joyKnob) {
    joyBase.addEventListener("touchstart", (e) => {
      if (!entered) return;
      const t = e.changedTouches[0];
      joystick.active = true;
      joystick.pointerId = t.identifier;
      joyUpdate(t.clientX, t.clientY);
      e.preventDefault();
    }, { passive: false });

    joyBase.addEventListener("touchmove", (e) => {
      if (!joystick.active) return;
      for (const t of e.changedTouches) {
        if (t.identifier === joystick.pointerId) joyUpdate(t.clientX, t.clientY);
      }
      e.preventDefault();
    }, { passive: false });

    const joyEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joystick.pointerId) joyReset();
      }
    };
    joyBase.addEventListener("touchend", joyEnd);
    joyBase.addEventListener("touchcancel", joyEnd);
  }

  // ---- interact button: opens the nearby locked door's question
  // overlay. (Photo / object interaction lands here in a later
  // milestone, alongside doors.) ----
  const interactBtn = document.getElementById("interact-btn");
  if (interactBtn) {
    interactBtn.addEventListener("click", () => {
      handleInteract();
    });
  }

  // ---- movement update (called every frame) ----
  const forwardVec = new THREE.Vector3();
  const rightVec = new THREE.Vector3();
  const UP_AXIS = new THREE.Vector3(0, 1, 0);
  const MOVE_SPEED = 3.2; // units per second

  function updateMovement(delta) {
    let inputX = 0; // strafe: -1 left .. 1 right
    let inputZ = 0; // -1 forward .. 1 backward
    if (keys.forward) inputZ -= 1;
    if (keys.backward) inputZ += 1;
    if (keys.left) inputX -= 1;
    if (keys.right) inputX += 1;

    inputX += joystick.x;
    inputZ += joystick.y;

    const mag = Math.hypot(inputX, inputZ);
    if (mag < 0.001) return;
    const clampedMag = Math.min(mag, 1);
    inputX /= mag;
    inputZ /= mag;

    forwardVec.set(0, 0, -1).applyAxisAngle(UP_AXIS, yaw);
    rightVec.set(1, 0, 0).applyAxisAngle(UP_AXIS, yaw);

    const step = MOVE_SPEED * delta * clampedMag;
    let newX = camera.position.x + (forwardVec.x * -inputZ + rightVec.x * inputX) * step;
    let newZ = camera.position.z + (forwardVec.z * -inputZ + rightVec.z * inputX) * step;

    // Collision, door-aware: normally the player is clamped to
    // MOVE_BOUND on every side (never through a wall, never out of the
    // room). The one exception is standing in an *unlocked* door's gap,
    // where we let them keep walking past the wall plane; once they've
    // gone TRANSITION_DEPTH past it, that counts as "through the
    // doorway" and swaps to the target room. A *locked* door blocks
    // movement exactly like a wall, but also pops open its question
    // overlay — this is the "walk into a locked door" behaviour.
    if (newX > MOVE_BOUND) {
      const door = findDoorAtWall("east", newZ);
      if (door && !door.locked) {
        if (newX - ROOM_HALF >= TRANSITION_DEPTH) {
          triggerTransition(door);
          return;
        }
      } else {
        newX = MOVE_BOUND;
        if (door) attemptOpenLockedDoor(door);
      }
    } else if (newX < -MOVE_BOUND) {
      const door = findDoorAtWall("west", newZ);
      if (door && !door.locked) {
        if (-ROOM_HALF - newX >= TRANSITION_DEPTH) {
          triggerTransition(door);
          return;
        }
      } else {
        newX = -MOVE_BOUND;
        if (door) attemptOpenLockedDoor(door);
      }
    }

    if (newZ > MOVE_BOUND) {
      const door = findDoorAtWall("south", newX);
      if (door && !door.locked) {
        if (newZ - ROOM_HALF >= TRANSITION_DEPTH) {
          triggerTransition(door);
          return;
        }
      } else {
        newZ = MOVE_BOUND;
        if (door) attemptOpenLockedDoor(door);
      }
    } else if (newZ < -MOVE_BOUND) {
      const door = findDoorAtWall("north", newX);
      if (door && !door.locked) {
        if (-ROOM_HALF - newZ >= TRANSITION_DEPTH) {
          triggerTransition(door);
          return;
        }
      } else {
        newZ = -MOVE_BOUND;
        if (door) attemptOpenLockedDoor(door);
      }
    }

    camera.position.x = newX;
    camera.position.z = newZ;
  }

  // ---- resize handling ----
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---- render loop ----
  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1); // guard against tab-switch spikes

    if (entered && !isAnyOverlayOpen()) {
      updateMovement(delta);
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;
    }
    if (entered) updateInteractPrompt();

    renderer.render(scene, camera);
  }
  animate();

  if (statusEl) statusEl.textContent = "Engine — Milestone 4: photo frames + lightbox ready";
} catch (err) {
  // The start screen and Enter button still work even if this fails —
  // only the 3D scene underneath is affected.
  console.error("Museum engine failed to initialize:", err);
  if (statusEl) statusEl.textContent = "Engine — scene failed to load (see console)";
}
