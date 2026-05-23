use copet_lib::config_store::ConfigStore;
use std::{env, fs, path::PathBuf};

fn builtin_pets_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("assets/pets")
}

fn builtin_audios_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("assets/audios")
}

fn make_store(temp: &tempfile::TempDir) -> ConfigStore {
    ConfigStore::with_builtin_dirs(
        temp.path().join(".copet"),
        builtin_pets_dir(),
        builtin_audios_dir(),
    )
}

fn write_audio_pack(root: &std::path::Path, id: &str, manifest_id: &str) {
    let dir = root.join(id);
    fs::create_dir_all(&dir).unwrap();
    fs::write(
        dir.join("audio.json"),
        format!(
            r#"{{
  "id": "{manifest_id}",
  "displayName": "{manifest_id} Pack",
  "interactionSounds": {{ "click": "click.mp3" }},
  "agentSounds": {{ "thinking": "thinking.mp3" }}
}}"#
        ),
    )
    .unwrap();
    fs::write(dir.join("click.mp3"), b"click").unwrap();
    fs::write(dir.join("thinking.mp3"), b"thinking").unwrap();
}

#[test]
fn discovers_builtin_and_user_audio_packs() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    write_audio_pack(&store.root().join("audios"), "retro", "retro");

    let state = store.ensure_ready().unwrap();

    assert!(state.audio_packs.iter().any(|pack| {
        pack.id == "system:copet"
            && pack.slug == "copet"
            && pack.display_name == "CoPet"
            && pack.built_in
    }));
    assert!(state.audio_packs.iter().any(|pack| {
        pack.id == "user:retro"
            && pack.slug == "retro"
            && pack.display_name == "retro Pack"
            && !pack.built_in
    }));
}

#[test]
fn skips_audio_pack_when_directory_and_manifest_id_differ() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    write_audio_pack(&store.root().join("audios"), "retro", "other");

    let state = store.ensure_ready().unwrap();
    let user_pack_ids = state
        .audio_packs
        .iter()
        .filter_map(|pack| (!pack.built_in).then_some(pack.id.as_str()))
        .collect::<Vec<_>>();

    assert!(!user_pack_ids.contains(&"user:retro"));
    assert!(!user_pack_ids.contains(&"user:other"));
}

#[test]
fn filters_unsafe_audio_pack_sound_entries() {
    let temp = tempfile::tempdir().unwrap();
    let store = make_store(&temp);
    let dir = store.root().join("audios/unsafe");
    fs::create_dir_all(&dir).unwrap();
    fs::write(
        dir.join("audio.json"),
        r#"{
  "id": "unsafe",
  "displayName": "Unsafe",
  "interactionSounds": {
    "click": "click.mp3",
    "doubleClick": "../outside.mp3",
    "petted": "nested/purr.mp3",
    "pettedSlow": "slow.ogg"
  },
  "agentSounds": {
    "thinking": "thinking.mp3",
    "failed": "/tmp/fail.mp3"
  }
}"#,
    )
    .unwrap();
    fs::write(dir.join("click.mp3"), b"click").unwrap();
    fs::write(dir.join("thinking.mp3"), b"thinking").unwrap();
    fs::create_dir_all(dir.join("nested")).unwrap();
    fs::write(dir.join("nested/purr.mp3"), b"purr").unwrap();
    fs::write(dir.join("slow.ogg"), b"ogg").unwrap();

    let state = store.ensure_ready().unwrap();
    let sounds = &state
        .audio_packs
        .iter()
        .find(|pack| pack.id == "user:unsafe")
        .unwrap()
        .sounds;

    assert!(sounds.interaction_sounds.click.is_some());
    assert!(sounds.interaction_sounds.double_click.is_none());
    assert!(sounds.interaction_sounds.petted.is_none());
    assert!(sounds.interaction_sounds.petted_slow.is_none());
    assert!(sounds.agent_sounds.thinking.is_some());
    assert!(sounds.agent_sounds.failed.is_none());
}
