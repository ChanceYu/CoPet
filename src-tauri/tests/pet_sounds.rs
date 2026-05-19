use pethover_lib::config_store::ConfigStore;
use std::{
    fs,
    path::{Path, PathBuf},
};

const SOUND_LIMIT_BYTES: u64 = 16 * 1024 * 1024;

fn builtin_pets_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("assets/pets")
}

fn make_store(temp: &tempfile::TempDir) -> ConfigStore {
    ConfigStore::with_builtin_dir(temp.path().join(".pethover"), builtin_pets_dir())
}

#[test]
fn builtin_pethover_exposes_valid_interaction_and_agent_sounds() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);

    let state = store.ensure_ready().unwrap();
    let pet = state.pets.iter().find(|pet| pet.id == "pethover").unwrap();
    let sounds = pet.sounds.as_ref().unwrap();

    assert!(sounds
        .interaction_sounds
        .click
        .as_ref()
        .unwrap()
        .ends_with("pethover/audio/click.mp3"));
    assert!(sounds
        .interaction_sounds
        .double_click
        .as_ref()
        .unwrap()
        .ends_with("pethover/audio/surprised.mp3"));
    assert!(sounds
        .interaction_sounds
        .petted
        .as_ref()
        .unwrap()
        .ends_with("pethover/audio/purr.mp3"));
    assert!(sounds
        .interaction_sounds
        .petted_slow
        .as_ref()
        .unwrap()
        .ends_with("pethover/audio/sigh.mp3"));
    assert!(sounds
        .interaction_sounds
        .drag_land
        .as_ref()
        .unwrap()
        .ends_with("pethover/audio/wheee.mp3"));
    assert!(sounds
        .agent_sounds
        .thinking
        .as_ref()
        .unwrap()
        .ends_with("pethover/audio/hmm.mp3"));
    assert!(sounds
        .agent_sounds
        .editing
        .as_ref()
        .unwrap()
        .ends_with("pethover/audio/tap.mp3"));
    assert!(sounds
        .agent_sounds
        .inspecting
        .as_ref()
        .unwrap()
        .ends_with("pethover/audio/peek.mp3"));
    assert!(sounds
        .agent_sounds
        .awaiting_approval
        .as_ref()
        .unwrap()
        .ends_with("pethover/audio/wait.mp3"));
    assert!(sounds
        .agent_sounds
        .celebrating
        .as_ref()
        .unwrap()
        .ends_with("pethover/audio/yay.mp3"));
    assert!(sounds
        .agent_sounds
        .failed
        .as_ref()
        .unwrap()
        .ends_with("pethover/audio/oof.mp3"));
}

#[test]
fn invalid_sound_entries_are_filtered_without_hiding_pet() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    store.ensure_ready().unwrap();
    let pet_dir = store.root().join("pets/sound-filter-pet");
    create_pet_with_manifest(
        &pet_dir,
        r#"{
  "id": "sound-filter-pet",
  "slug": "sound-filter-pet",
  "displayName": "Sound Filter Pet",
  "frameWidth": 160,
  "frameHeight": 64,
  "gridColumns": 8,
  "gridRows": 9,
  "pethover": {
    "audio": {
      "interactionSounds": {
        "click": "pethover/audio/click.mp3",
        "doubleClick": "/tmp/outside.mp3",
        "petted": "../escape.mp3",
        "pettedSlow": "pethover/audio/sigh.ogg",
        "dragLand": "pethover/other/wheee.mp3"
      },
      "agentSounds": {
        "thinking": "pethover/audio/hmm.mp3",
        "failed": "pethover/audio/missing.mp3"
      }
    }
  }
}"#,
    );
    fs::create_dir_all(pet_dir.join("pethover/audio")).unwrap();
    fs::write(pet_dir.join("pethover/audio/click.mp3"), b"click").unwrap();
    fs::write(pet_dir.join("pethover/audio/hmm.mp3"), b"hmm").unwrap();
    fs::write(pet_dir.join("pethover/audio/sigh.ogg"), b"ogg").unwrap();
    fs::create_dir_all(pet_dir.join("pethover/other")).unwrap();
    fs::write(pet_dir.join("pethover/other/wheee.mp3"), b"outside").unwrap();

    let state = store.app_state().unwrap();
    let pet = state
        .pets
        .iter()
        .find(|pet| pet.id == "sound-filter-pet")
        .unwrap();
    let sounds = pet.sounds.as_ref().unwrap();

    assert!(sounds.interaction_sounds.click.is_some());
    assert!(sounds.interaction_sounds.double_click.is_none());
    assert!(sounds.interaction_sounds.petted.is_none());
    assert!(sounds.interaction_sounds.petted_slow.is_none());
    assert!(sounds.interaction_sounds.drag_land.is_none());
    assert!(sounds.agent_sounds.thinking.is_some());
    assert!(sounds.agent_sounds.failed.is_none());
}

#[test]
fn oversized_sound_entries_are_filtered() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    store.ensure_ready().unwrap();
    let pet_dir = store.root().join("pets/oversized-sound-pet");
    create_pet_with_manifest(
        &pet_dir,
        r#"{
  "id": "oversized-sound-pet",
  "slug": "oversized-sound-pet",
  "displayName": "Oversized Sound Pet",
  "frameWidth": 160,
  "frameHeight": 64,
  "gridColumns": 8,
  "gridRows": 9,
  "pethover": {
    "audio": {
      "interactionSounds": {
        "click": "pethover/audio/click.mp3"
      }
    }
  }
}"#,
    );
    let audio_dir = pet_dir.join("pethover/audio");
    fs::create_dir_all(&audio_dir).unwrap();
    let large = fs::File::create(audio_dir.join("click.mp3")).unwrap();
    large.set_len(SOUND_LIMIT_BYTES + 1).unwrap();

    let state = store.app_state().unwrap();
    let pet = state
        .pets
        .iter()
        .find(|pet| pet.id == "oversized-sound-pet")
        .unwrap();

    assert!(pet.sounds.is_none());
}

fn create_pet_with_manifest(dir: &Path, manifest: &str) {
    fs::create_dir_all(dir).unwrap();
    fs::write(dir.join("pet.json"), manifest).unwrap();
    fs::write(dir.join("spritesheet.png"), b"sprite").unwrap();
}
