#![allow(dead_code)]

use copet_lib::agents::AgentManager;
use serde_json::Value;
use std::{env, ffi::OsString, fs, path::PathBuf, sync::Mutex};

pub static OPENCODE_ENV_LOCK: Mutex<()> = Mutex::new(());

pub fn read_json(path: impl AsRef<std::path::Path>) -> Value {
    serde_json::from_slice(&fs::read(path).unwrap()).unwrap()
}

pub fn manager_with_fake_agents(
    root: impl Into<PathBuf>,
    home: impl Into<PathBuf>,
) -> AgentManager {
    manager_with_fake_agent_names(
        root,
        home,
        &["claude", "codex", "agy", "gemini", "opencode"],
    )
}

pub fn manager_with_fake_agent_names(
    root: impl Into<PathBuf>,
    home: impl Into<PathBuf>,
    executables: &[&str],
) -> AgentManager {
    let temp = tempfile::tempdir().unwrap();
    let bin = temp.keep().join("bin");
    fs::create_dir_all(&bin).unwrap();
    for executable in executables {
        let path = bin.join(executable);
        fs::write(&path, "#!/bin/sh\nexit 0\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut permissions = fs::metadata(&path).unwrap().permissions();
            permissions.set_mode(0o755);
            fs::set_permissions(&path, permissions).unwrap();
        }
    }
    AgentManager::new_with_exact_executable_search_paths(root, home, vec![bin])
}

pub fn with_opencode_config_dir(test: impl FnOnce(&std::path::Path)) {
    let _guard = OPENCODE_ENV_LOCK.lock().unwrap();
    let temp = tempfile::tempdir().unwrap();
    let opencode_config_dir = temp.path().join("opencode-config");
    let previous = env::var_os("OPENCODE_CONFIG_DIR");

    env::set_var("OPENCODE_CONFIG_DIR", &opencode_config_dir);
    test(&opencode_config_dir);
    restore_env_var("OPENCODE_CONFIG_DIR", previous);
}

pub fn restore_env_var(key: &str, value: Option<OsString>) {
    if let Some(value) = value {
        env::set_var(key, value);
    } else {
        env::remove_var(key);
    }
}
