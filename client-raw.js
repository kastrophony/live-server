(() => {
  /**
   * @type {WebSocket | undefined}
   */
  let socket;

  /**
   * @type {number | undefined}
   */
  let reconnectionTimerId;

  connect();

  function reload() {
    globalThis.location.reload();
  }

  /**
   * Connects to the WebSocket server
   * @param {(() => void) | undefined} callback - Optional callback to execute on connection open
   * @returns {void}
   */
  function connect(callback) {
    if (socket) {
      socket.close();
    }

    socket = new WebSocket(
      `${
        globalThis.location.origin.replace("http", "ws")
      }/@kastrophony/live-server`,
    );

    socket.addEventListener("open", callback);

    socket.addEventListener("message", (event) => {
      if (event.data === "reload") {
        console.log("reloading...");
        reload();
      }
    });

    socket.addEventListener("close", () => {
      console.log("reconnecting...");

      clearTimeout(reconnectionTimerId);

      reconnectionTimerId = setTimeout(() => {
        connect(reload);
      }, 1000);
    });
  }
})();
