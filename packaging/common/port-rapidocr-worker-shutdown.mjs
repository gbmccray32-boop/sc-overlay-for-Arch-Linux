const replaceOnce = (source, before, after, label) => {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one anchor, found ${count}`);
  return source.replace(before, after);
};

export function portRapidOcrWorkerShutdown(input) {
  let worker = input;
  worker = replaceOnce(
    worker,
    "let ocrPromise = null;",
    `let ocrPromise = null;
let ipcClosing = false;

function isClosedIpcError(error) {
  return error?.code === "EPIPE" || error?.code === "ERR_IPC_CHANNEL_CLOSED";
}

function handleIpcError(error) {
  if (isClosedIpcError(error)) {
    ipcClosing = true;
    return;
  }
  console.error("RapidOCR worker IPC failure:", error?.stack || error);
  process.exitCode = 1;
}

// process.connected can remain true briefly after the parent begins shutdown. Supplying a
// callback keeps that late asynchronous write failure out of EventEmitter's unhandled-error path.
function sendToParent(message) {
  if (ipcClosing || !process.connected) return false;
  try {
    process.send(message, (error) => {
      if (error) handleIpcError(error);
    });
    return true;
  } catch (error) {
    handleIpcError(error);
    return false;
  }
}

process.on("error", handleIpcError);`,
    "RapidOCR IPC shutdown guard",
  );
  worker = replaceOnce(
    worker,
    '    if (process.connected) process.send({ type: "result", id: message.id, result });',
    '    sendToParent({ type: "result", id: message.id, result });',
    "RapidOCR result send",
  );
  worker = replaceOnce(
    worker,
    '    if (process.connected) process.send({ type: "error", id: message.id, error: errorText(error) });',
    '    sendToParent({ type: "error", id: message.id, error: errorText(error) });',
    "RapidOCR error send",
  );
  worker = replaceOnce(
    worker,
    'process.on("disconnect", () => process.exit(0));\nif (process.connected) process.send({ type: "ready" });',
    `process.on("disconnect", () => {
  ipcClosing = true;
  process.exit(0);
});
sendToParent({ type: "ready" });`,
    "RapidOCR disconnect handling",
  );
  return worker;
}
