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

    // keyboard Enter â€” listens on the whole document, not just the
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
    document.title = `${CONFIG.museumTitle || "Museum of Memories"} â€” ${CONFIG.herName || ""}`.trim();
