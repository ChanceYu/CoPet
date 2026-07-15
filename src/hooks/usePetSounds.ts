import { convertFileSrc } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef } from "react";

import type {
  PetAgentSounds,
  PetInteractionSounds,
  PetSounds,
  PetStateId,
} from "../lib/appTypes";
import { copetDevLog } from "../lib/devLogger";

export type InteractionSoundKey = keyof PetInteractionSounds;
export type AgentSoundKey = keyof PetAgentSounds;

export function agentSoundKeyForPetState(state: PetStateId): AgentSoundKey | null {
  switch (state) {
    case "jumping":
    case "thinking":
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
  const soundCacheRef = useRef(new Map<string, HTMLAudioElement>());

  const stopAllSounds = useCallback(() => {
    for (const sound of soundCacheRef.current.values()) {
      sound.pause();
      sound.currentTime = 0;
    }
  }, []);

  const playUrl = useCallback(
    (path: string | undefined) => {
      if (!enabled || !path) {
        return;
      }

      const url = convertFileSrc(path);
      let sound = soundCacheRef.current.get(url);
      if (!sound) {
        sound = new Audio(url);
        sound.preload = "auto";
        soundCacheRef.current.set(url, sound);
      }

      sound.currentTime = 0;
      try {
        void sound.play().catch((error: unknown) => {
          copetDevLog("frontend.pet-sound.play-failed", {
            message: error instanceof Error ? error.message : String(error),
            url,
          });
        });
      } catch (error) {
        copetDevLog("frontend.pet-sound.play-failed", {
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
    soundCacheRef.current.clear();
  }, [enabled, sounds, stopAllSounds]);

  useEffect(() => {
    return () => {
      stopAllSounds();
      soundCacheRef.current.clear();
    };
  }, [stopAllSounds]);

  return {
    playInteractionSound,
    playAgentSound,
    stopAllSounds,
  };
}
