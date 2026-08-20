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

  // ---- warm gallery-at-night lighting (placeholder, room-agnostic) ----
  const ambient = new THREE.AmbientLight(0x2a1f40, 0.9);
  scene.add(ambient);

  const spot = new THREE.SpotLight(0xffe4a8, 3.2, 12, Math.PI / 5, 0.5, 1.2);
  spot.position.set(0, 4, 1);
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

  // ---- Milestone 3: data-driven room graph ----
  // One room is "live" (built into roomGroup) at a time. Walking into an
  // unlocked door — or pressing Interact near one — swaps the room.
  const ROOM_SIZE = 12;          // room is ROOM_SIZE x ROOM_SIZE
  const ROOM_HALF = ROOM_SIZE / 2;
  const WALL_HEIGHT = 3.6;
  const WALL_THICKNESS = 0.3;
  const PLAYER_RADIUS = 0.4;
  const EYE_HEIGHT = 1.6;
  const DOOR_WIDTH = 1.6;   // gap left open in the wall for each door
  const DOOR_HEIGHT = 2.6;
  const DOOR_EDGE_MARGIN = 1.3; // keeps doors clear of the corners

  // ---- Milestone 4: wall-mounted photo frames ----
  const PHOTO_MAX_DIM = 1.7;      // largest side a frame can be, in world units
  const PHOTO_HEIGHT = 1.75;      // mount height (frame centre) above the floor
  // Automatic layouts use three separated rows on each wall. This expands
  // usable hanging space without ever putting a frame in a doorway: each
  // row is packed only into that wall's door-free horizontal segments.
  const PHOTO_ROW_CENTERS = [0.75, 1.8, 2.85];
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
    panelMesh.position.set(anchor.x, DOOR_HEIGHT / 2, anchor.z);
    roomGroup.add(panelMesh);

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
    if (id) {
      const iframe = document.createElement("iframe");
      iframe.title = "Cherry's YouTube playlist";
      iframe.loading = "lazy";
      iframe.allow = "autoplay; encrypted-media; picture-in-picture";
      iframe.src = `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(id)}`;
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

    const ceilingMesh = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE), ceilingMat);
    ceilingMesh.rotation.x = Math.PI / 2;
    ceilingMesh.position.y = WALL_HEIGHT;
    roomGroup.add(ceilingMesh);

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

    if (roomId === "room4") buildPlaylistBoard(roomCfg);

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

  function isAnyOverlayOpen() {
    return isDoorOverlayOpen() || isPhotoOverlayOpen() || isPlaylistOverlayOpen();
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

    const playlistDist = playlistBoardRecord
      ? Math.hypot(camera.position.x - playlistBoardRecord.anchor.x, camera.position.z - playlistBoardRecord.anchor.z)
      : Infinity;

    // If both a door and a photo are in range, whichever is physically
    // closer wins the single on-screen prompt.
    if (closestDoor && (!closestPhoto || closestDoorDist <= closestPhotoDist)) {
      nearDoor = closestDoor;
      nearPhoto = null;
      doorPromptEl.textContent = nearDoor.locked
        ? `${nearDoor.label} — tap / press E to answer`
        : `${nearDoor.label} — walk through`;
      doorPromptEl.classList.add("visible");
    } else if (closestPhoto && closestPhotoDist <= playlistDist) {
      nearDoor = null;
      nearPhoto = closestPhoto;
      nearPlaylistBoard = null;
      doorPromptEl.textContent = "Tap to view / press E to inspect";
      doorPromptEl.classList.add("visible");
    } else if (playlistBoardRecord && playlistDist < INTERACT_DISTANCE) {
      nearDoor = null;
      nearPhoto = null;
      nearPlaylistBoard = playlistBoardRecord;
      doorPromptEl.textContent = "Playlist exhibit — tap / press E to view";
      doorPromptEl.classList.add("visible");
    } else {
      nearDoor = null;
      nearPhoto = null;
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
      // No reciprocal door record (e.g. arriving one-way, or a room
      // whose door layout isn't built yet) — safe default spawn.
      camera.position.set(0, EYE_HEIGHT, 2);
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
