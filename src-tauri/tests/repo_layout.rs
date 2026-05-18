use std::{fs, path::Path};

use serde_json::Value;

#[test]
fn rust_tests_only_live_under_src_tauri_tests() {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let repo_root = manifest_dir
        .parent()
        .expect("src-tauri has a parent repo root");
    let root_tests = repo_root.join("tests");

    assert!(
        !root_tests.exists(),
        "repository-root tests directory must be removed; use src-tauri/tests for Rust and src/tests for frontend"
    );

    let mut offenders = Vec::new();
    collect_rs_test_offenders(repo_root, manifest_dir, &mut offenders);
    offenders.sort();

    assert!(
        offenders.is_empty(),
        "Rust test attributes are only allowed in src-tauri/tests:\n{}",
        offenders.join("\n")
    );
}

#[test]
fn capabilities_allow_pet_window_frontend_resizing() {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let capabilities = fs::read_to_string(manifest_dir.join("capabilities/default.json"))
        .expect("read default capability file");
    let capabilities: Value =
        serde_json::from_str(&capabilities).expect("parse default capability file");
    let permissions = capabilities
        .get("permissions")
        .and_then(Value::as_array)
        .expect("default capability permissions should be an array");

    assert!(
        permissions
            .iter()
            .any(|permission| permission == "core:window:allow-set-size"),
        "pet window slider drag calls getCurrentWebviewWindow().setSize from the frontend"
    );
    assert!(
        permissions
            .iter()
            .any(|permission| permission == "core:window:allow-set-position"),
        "pet window slider drag keeps resize anchored to the current window center"
    );
}

fn collect_rs_test_offenders(repo_root: &Path, manifest_dir: &Path, offenders: &mut Vec<String>) {
    let skip_dirs = [
        repo_root.join(".git"),
        repo_root.join(".worktrees"),
        repo_root.join("node_modules"),
        manifest_dir.join("target"),
        manifest_dir.join("tests"),
    ];

    visit(repo_root, &skip_dirs, &mut |path| {
        if path.extension().is_some_and(|extension| extension == "rs") {
            let contents = fs::read_to_string(path).expect("read Rust source");
            if contains_rust_test_attribute(&contents) {
                offenders.push(path.strip_prefix(repo_root).unwrap().display().to_string());
            }
        }
    });
}

fn visit(path: &Path, skip_dirs: &[std::path::PathBuf], on_file: &mut impl FnMut(&Path)) {
    if skip_dirs.iter().any(|skip| skip == path) {
        return;
    }
    if path.is_dir() {
        for entry in fs::read_dir(path).expect("read directory") {
            visit(
                &entry.expect("read directory entry").path(),
                skip_dirs,
                on_file,
            );
        }
    } else {
        on_file(path);
    }
}

fn contains_rust_test_attribute(contents: &str) -> bool {
    contents.contains("#[test]")
        || contents.contains("#[cfg(test)]")
        || contents.contains("#[tokio::test]")
}
