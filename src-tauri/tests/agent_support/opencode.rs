use super::helpers::{manager_with_fake_agents, read_json, with_opencode_config_dir};
use pethover_lib::agents::AgentManager;
use std::fs;

#[test]
fn opencode_install_and_uninstall_manage_only_pethover_plugin_file() {
    with_opencode_config_dir(|opencode_config_dir| {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home");
        let root = temp.path().join(".pethover");
        let manager = manager_with_fake_agents(&root, &home);
        let plugin = opencode_config_dir.join("plugins/pethover.js");
        let config = opencode_config_dir.join("opencode.json");

        manager.install("opencode").unwrap();
        assert!(fs::read_to_string(&plugin)
            .unwrap()
            .contains("pethover-managed-hook"));
        assert!(read_json(&config)["plugin"]
            .as_array()
            .unwrap()
            .iter()
            .any(|entry| entry.as_str() == Some("./plugins/pethover.js")));

        manager.uninstall("opencode").unwrap();
        assert!(!plugin.exists());
        assert!(!read_json(&config)["plugin"]
            .as_array()
            .unwrap()
            .iter()
            .any(|entry| entry.as_str() == Some("./plugins/pethover.js")));
    });
}

#[test]
fn opencode_plugin_posts_runtime_events_without_proxy_sensitive_fetch() {
    with_opencode_config_dir(|opencode_config_dir| {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home");
        let root = temp.path().join(".pethover");
        let manager = manager_with_fake_agents(&root, &home);

        manager.install("opencode").unwrap();
        let plugin = fs::read_to_string(opencode_config_dir.join("plugins/pethover.js")).unwrap();

        assert!(plugin.contains("node:http"));
        assert!(plugin.contains("http.request"));
        assert!(plugin.contains("event: async"));
        assert!(plugin.contains("event.event.type"));
        assert!(plugin.contains("\"chat.message\""));
        assert!(plugin.contains("tui.prompt.append"));
        assert!(plugin.contains("session.idle"));
        assert!(!plugin.contains("fetch(endpoint"));
    });
}

#[test]
fn opencode_install_preserves_existing_config_plugins() {
    with_opencode_config_dir(|opencode_config_dir| {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home");
        let root = temp.path().join(".pethover");
        let manager = manager_with_fake_agents(&root, &home);
        let config = opencode_config_dir.join("opencode.json");
        fs::create_dir_all(config.parent().unwrap()).unwrap();
        fs::write(
            &config,
            r#"{"$schema":"https://opencode.ai/config.json","plugin":["@scope/existing"]}"#,
        )
        .unwrap();

        manager.install("opencode").unwrap();
        let installed = read_json(&config);
        let plugins = installed["plugin"].as_array().unwrap();

        assert!(plugins
            .iter()
            .any(|entry| entry.as_str() == Some("@scope/existing")));
        assert!(plugins
            .iter()
            .any(|entry| entry.as_str() == Some("./plugins/pethover.js")));
    });
}

#[test]
fn install_finds_opencode_cli_in_official_user_bin_when_process_path_is_sparse() {
    with_opencode_config_dir(|opencode_config_dir| {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home");
        let root = temp.path().join(".pethover");
        let opencode_bin = home.join(".opencode/bin");
        fs::create_dir_all(&opencode_bin).unwrap();
        let opencode = opencode_bin.join("opencode");
        fs::write(&opencode, "#!/bin/sh\nexit 0\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut permissions = fs::metadata(&opencode).unwrap().permissions();
            permissions.set_mode(0o755);
            fs::set_permissions(&opencode, permissions).unwrap();
        }
        let manager = AgentManager::new_with_executable_search_paths(&root, &home, Vec::new());

        let result = manager.install("opencode").unwrap();

        assert!(result.adapter.installed);
        assert!(opencode_config_dir.join("plugins/pethover.js").exists());
    });
}
