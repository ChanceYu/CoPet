import { convertFileSrc } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef } from "react";

import type {
  PetAgentSounds,
  PetInteractionSounds,
  PetSounds,
  PetStateId,
} from "../lib/appTypes";
import { pethoverDevLog } from "../lib/devLogger";

export type InteractionSoundKey = keyof PetInteractionSounds;
export type AgentSoundKey = keyof PetAgentSounds;

export function agentSoundKeyForPetState(state: PetStateId): AgentSoundKey | null {
  switch (state) {
    case "jumping":
      return "thinking";
    case "running":
      return "editing";
    case "review":
      return "inspecting";
    case "waiting":
      return "awaitingApproval";
    case "waving":
      return "celebrating";
    case "failed":
      return "failed";
    case "idle":
    case "running-left":
    case "running-right":
      return null;
  }
}

export function usePetSounds({
  enabled,
  sounds,
}: {
  enabled: boolean;
  sounds?: PetSounds;
}) {
  const audioCacheRef = useRef(new Map<string, HTMLAudioElement>());

  const stopAllSounds = useCallback(() => {
    for (const audio of audioCacheRef.current.values()) {
      audio.pause();
      audio.currentTime = 0;
    }
  }, []);

  const playUrl = useCallback(
    (path: string | undefined) => {
      if (!enabled || !path) {
        return;
      }

      const url = convertFileSrc(path);
      let audio = audioCacheRef.current.get(url);
      if (!audio) {
        audio = new Audio(url);
        audio.preload = "auto";
        audioCacheRef.current.set(url, audio);
      }

      audio.currentTime = 0;
      try {
        void audio.play().catch((error: unknown) => {
          pethoverDevLog("frontend.pet-sound.play-failed", {
            message: error instanceof Error ? error.message : String(error),
            url,
          });
        });
      } catch (error) {
        pethoverDevLog("frontend.pet-sound.play-failed", {
          message: error instanceof Error ? error.message : String(error),
          url,
        });
      }
    },
    [enabled],
  );

  const playInteractionSound = useCallback(
    (kind: InteractionSoundKey) => {
      playUrl(sounds?.interactionSounds?.[kind]);
    },
    [playUrl, sounds],
  );

  const playAgentSound = useCallback(
    (kind: AgentSoundKey) => {
      playUrl(sounds?.agentSounds?.[kind]);
    },
    [playUrl, sounds],
  );

  useEffect(() => {
    stopAllSounds();
    audioCacheRef.current.clear();
  }, [enabled, sounds, stopAllSounds]);

  useEffect(() => {
    return () => {
      stopAllSounds();
      audioCacheRef.current.clear();
    };
  }, [stopAllSounds]);

  return {
    playInteractionSound,
    playAgentSound,
    stopAllSounds,
  };
}
