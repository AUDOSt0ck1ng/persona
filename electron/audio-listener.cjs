"use strict";

const { LinuxPipeWireListener } = require("./linux-pipewire-listener.cjs");
const { NativeProcessAudioListener } = require("./native-process-audio-listener.cjs");
const { normalizeVoiceSource } = require("./voice-source.cjs");

function createAudioListener({ platform = process.platform, ...options } = {}) {
  if (normalizeVoiceSource(options.voiceSource).mode === "external") return null;
  if (platform === "linux") return new LinuxPipeWireListener(options);
  if (platform === "darwin" || platform === "win32") {
    return new NativeProcessAudioListener({ platform, ...options });
  }
  return null;
}

module.exports = { createAudioListener };
