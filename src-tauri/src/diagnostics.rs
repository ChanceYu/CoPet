use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone)]
pub struct RotatingLog {
    path: PathBuf,
    max_bytes: u64,
    max_files: usize,
}

impl RotatingLog {
    pub fn new(path: impl Into<PathBuf>, max_bytes: u64, max_files: usize) -> Self {
        Self {
            path: path.into(),
            max_bytes,
            max_files,
        }
    }

    pub fn append_line(&self, line: &str) -> std::io::Result<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }

        let bytes = line.len() as u64 + 1;
        if self.path.exists() && self.path.metadata()?.len().saturating_add(bytes) > self.max_bytes
        {
            self.rotate()?;
        }

        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)?;
        writeln!(file, "{line}")?;
        Ok(())
    }

    fn rotate(&self) -> std::io::Result<()> {
        if self.max_files == 0 {
            let _ = fs::remove_file(&self.path);
            return Ok(());
        }

        for index in (1..=self.max_files).rev() {
            let source = rotated_path(&self.path, index);
            let target = rotated_path(&self.path, index + 1);
            if target.exists() {
                let _ = fs::remove_file(&target);
            }
            if source.exists() && index < self.max_files {
                fs::rename(source, target)?;
            }
        }

        let first = rotated_path(&self.path, 1);
        if first.exists() {
            let _ = fs::remove_file(&first);
        }
        if self.path.exists() {
            fs::rename(&self.path, first)?;
        }
        Ok(())
    }
}

fn rotated_path(path: &Path, index: usize) -> PathBuf {
    PathBuf::from(format!("{}.{index}", path.to_string_lossy()))
}
