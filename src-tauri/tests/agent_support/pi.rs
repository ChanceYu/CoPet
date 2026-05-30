use super::helpers::{manager_with_fake_agents, read_json};
use std::fs;

#[test]
fn pi_install_writes_managed_extension() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".copet");
    let manager = manager_with_fake_agents(&root, &home);

    let result = manager.install("pi").unwrap();
    let extension_dir = home.join(".pi/agent/extensions/copet");
    let index = fs::read_to_string(extension_dir.join("index.ts")).unwrap();
    let marker = read_json(extension_dir.join(".copet-managed.json"));

    assert!(result.adapter.installed);
    assert_eq!(result.adapter.id, "pi");
    assert_eq!(result.adapter.display_name, "Pi");
    assert_eq!(marker["app"], "copet");
    assert_eq!(marker["integration"], "pi");
    assert_eq!(marker["managed"], true);
    assert!(index.contains("copetPiExtension"));
    assert!(index.contains("before_agent_start"));
    assert!(index.contains("tool_call"));
    assert!(index.contains("tool_result"));
    assert!(index.contains("agent_end"));
    assert!(index.contains("session_shutdown"));
    assert!(index.contains(".copet"));
    assert!(index.contains("/v1/events"));
    assert!(index.contains("copet-managed-pi-extension"));
    assert!(index.contains("url.protocol !== \"http:\""));
    assert!(index.contains("\"127.0.0.1\""));
    assert!(index.contains("\"localhost\""));
    assert!(index.contains("\"::1\""));
    assert!(index.contains("url.pathname !== EVENTS_PATH"));
    assert!(
        index.contains(
            "function send(kind: string, nativeEvent: ExtensionEvent, ctx: ExtensionContext): void"
        )
    );
    assert!(index.contains("pi.on(\"session_shutdown\", async"));
    assert!(!index.contains("return send("));
    assert!(!index.contains("=> send("));
}

#[test]
fn pi_install_updates_existing_managed_extension() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".copet");
    let extension_dir = home.join(".pi/agent/extensions/copet");
    fs::create_dir_all(&extension_dir).unwrap();
    fs::write(
        extension_dir.join(".copet-managed.json"),
        r#"{"app":"copet","integration":"pi","managed":true,"version":1}"#,
    )
    .unwrap();
    fs::write(extension_dir.join("index.ts"), "old").unwrap();
    let manager = manager_with_fake_agents(&root, &home);

    manager.install("pi").unwrap();

    let index = fs::read_to_string(extension_dir.join("index.ts")).unwrap();
    assert!(index.contains("copetPiExtension"));
    assert!(!index.contains("old"));
}

#[test]
fn pi_install_refuses_unmanaged_extension_directory() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".copet");
    let extension_dir = home.join(".pi/agent/extensions/copet");
    fs::create_dir_all(&extension_dir).unwrap();
    fs::write(extension_dir.join("index.ts"), "user extension").unwrap();
    let manager = manager_with_fake_agents(&root, &home);

    let error = manager.install("pi").unwrap_err().to_string();

    assert!(error.contains("Pi extension directory already exists"));
    assert_eq!(
        fs::read_to_string(extension_dir.join("index.ts")).unwrap(),
        "user extension"
    );
}

#[test]
fn pi_inspect_rejects_managed_marker_with_stale_extension_source() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".copet");
    let extension_dir = home.join(".pi/agent/extensions/copet");
    fs::create_dir_all(&extension_dir).unwrap();
    fs::write(
        extension_dir.join(".copet-managed.json"),
        r#"{"app":"copet","integration":"pi","managed":true,"version":1}"#,
    )
    .unwrap();
    fs::write(extension_dir.join("index.ts"), "stale user content").unwrap();
    let manager = manager_with_fake_agents(&root, &home);

    let result = manager.inspect("pi").unwrap();

    assert!(!result.installed);
    assert!(!result.healthy);
}

#[test]
fn pi_inspect_rejects_pre_hardening_generated_extension_source() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".copet");
    let extension_dir = home.join(".pi/agent/extensions/copet");
    fs::create_dir_all(&extension_dir).unwrap();
    fs::write(
        extension_dir.join(".copet-managed.json"),
        r#"{"app":"copet","integration":"pi","managed":true,"version":1}"#,
    )
    .unwrap();
    fs::write(
        extension_dir.join("index.ts"),
        r#"// copet-managed-pi-extension
export default function copetPiExtension(pi) {
  pi.on("before_agent_start", () => {});
  pi.on("tool_call", () => {});
  pi.on("tool_result", () => {});
  pi.on("agent_end", () => {});
  pi.on("session_shutdown", () => {});
}"#,
    )
    .unwrap();
    let manager = manager_with_fake_agents(&root, &home);

    let result = manager.inspect("pi").unwrap();

    assert!(!result.installed);
    assert!(!result.healthy);
}

#[cfg(unix)]
#[test]
fn pi_install_refuses_symlinked_extension_directory() {
    use std::os::unix::fs::symlink;

    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".copet");
    let extension_parent = home.join(".pi/agent/extensions");
    let extension_dir = extension_parent.join("copet");
    let target_dir = temp.path().join("target-extension");
    fs::create_dir_all(&target_dir).unwrap();
    fs::write(
        target_dir.join(".copet-managed.json"),
        r#"{"app":"copet","integration":"pi","managed":true,"version":1}"#,
    )
    .unwrap();
    fs::create_dir_all(&extension_parent).unwrap();
    symlink(&target_dir, &extension_dir).unwrap();
    let manager = manager_with_fake_agents(&root, &home);

    let error = manager.install("pi").unwrap_err().to_string();

    assert!(error.contains("Pi extension directory already exists"));
    assert!(extension_dir.exists());
    assert!(!target_dir.join("index.ts").exists());
}

#[test]
fn pi_uninstall_removes_only_managed_extension() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".copet");
    let manager = manager_with_fake_agents(&root, &home);
    let extension_dir = home.join(".pi/agent/extensions/copet");

    manager.install("pi").unwrap();
    assert!(extension_dir.exists());

    let result = manager.uninstall("pi").unwrap();

    assert!(!result.adapter.installed);
    assert!(!extension_dir.exists());
    assert!(!root.join("adapters/pi.json").exists());
}

#[test]
fn pi_uninstall_refuses_unmanaged_extension_directory() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".copet");
    let extension_dir = home.join(".pi/agent/extensions/copet");
    fs::create_dir_all(&extension_dir).unwrap();
    fs::write(extension_dir.join("index.ts"), "user extension").unwrap();
    let manager = manager_with_fake_agents(&root, &home);

    let error = manager.uninstall("pi").unwrap_err().to_string();

    assert!(error.contains("Pi extension directory is not CoPet-managed"));
    assert!(extension_dir.exists());
}

#[cfg(unix)]
#[test]
fn pi_uninstall_refuses_symlinked_extension_directory() {
    use std::os::unix::fs::symlink;

    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".copet");
    let extension_parent = home.join(".pi/agent/extensions");
    let extension_dir = extension_parent.join("copet");
    let target_dir = temp.path().join("target-extension");
    fs::create_dir_all(&target_dir).unwrap();
    fs::write(
        target_dir.join(".copet-managed.json"),
        r#"{"app":"copet","integration":"pi","managed":true,"version":1}"#,
    )
    .unwrap();
    fs::write(target_dir.join("index.ts"), "copet-managed-pi-extension").unwrap();
    fs::create_dir_all(&extension_parent).unwrap();
    symlink(&target_dir, &extension_dir).unwrap();
    let manager = manager_with_fake_agents(&root, &home);

    let error = manager.uninstall("pi").unwrap_err().to_string();

    assert!(error.contains("Pi extension directory is not CoPet-managed"));
    assert!(extension_dir.exists());
    assert!(target_dir.exists());
}
