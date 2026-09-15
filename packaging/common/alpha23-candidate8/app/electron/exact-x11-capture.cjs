"use strict";

// One bounded recovery episode per exact game/window/display binding. Never fall back to root XID.
function createExactX11Capture({ run, decode, remove, now = Date.now, logger = console }) {
  let binding = "";
  let remote = false;
  let retryAt = 0;
  let busy = false;
  return async function capture({ key, xid, display, output, env }) {
    if (!/^\d+$/.test(String(xid)) || Number(xid) === 0) throw new Error("exact Star Citizen XID unavailable");
    if (busy) throw new Error("exact X11 capture already in flight");
    if (binding !== key) { binding = key; remote = false; retryAt = 0; }
    if (now() < retryAt) throw new Error("exact X11 capture cooling down after failure");
    busy = true;
    const attempt = async () => {
      remove(output);
      await run("gst-launch-1.0", [
        "-q", "-e", "ximagesrc", `xid=${xid}`, `remote=${remote}`,
        "show-pointer=false", "use-damage=false", "num-buffers=1", "!",
        "videoconvert", "!", "pngenc", "compression-level=1", "!", "filesink", `location=${output}`,
      ], { timeout: 750, killSignal: "SIGKILL", maxBuffer: 2 * 1024 * 1024,
        env: { ...env, DISPLAY: display, GST_XINITTHREADS: "1" } });
      const image = decode(output);
      if (!image || image.isEmpty()) throw new Error("exact X11 capture decoded empty");
      return image;
    };
    try {
      try { return await attempt(); }
      catch (error) {
        if (remote || !/MIT-SHM|X_ShmGetImage|BadMatch/i.test(String(error.message))) throw error;
        // ximagesrc remote=true uses ordinary XGetImage rather than MIT-SHM.
        remote = true;
        logger.warn?.("[x11-window] shared-memory capture failed; retrying without MIT-SHM");
        return await attempt();
      }
    } catch (error) {
      retryAt = now() + 60000;
      logger.warn?.(`[x11-window] exact window unavailable; fallback active for 60 seconds: ${error.message}`);
      throw error;
    } finally { busy = false; }
  };
}
module.exports = { createExactX11Capture };
