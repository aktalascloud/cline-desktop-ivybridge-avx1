use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::PathBuf;
use std::process::{ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Manager, WebviewWindow};

const ORIGIN: &str = "https://chat.deepseek.com";
static ACTIVE: AtomicBool = AtomicBool::new(false);
static CANCELLED: AtomicBool = AtomicBool::new(false);
static INPUT: Mutex<Option<ChildStdin>> = Mutex::new(None);

pub fn cancel_owned_browser() {
    CANCELLED.store(true, Ordering::Release);
    if let Ok(mut input) = INPUT.lock() {
        if let Some(mut pipe) = input.take() {
            let _ = pipe.write_all(b"cancel\n");
            let _ = pipe.flush();
        }
    }
}

struct LoginGuard;
impl Drop for LoginGuard {
    fn drop(&mut self) {
        cancel_owned_browser();
        ACTIVE.store(false, Ordering::Release);
    }
}

#[derive(Deserialize, Serialize)]
pub struct BrowserSession {
    origin: String,
    token: String,
    cookies: String,
}

fn parse_session(bytes: &[u8]) -> Result<BrowserSession, String> {
    if bytes.len() > 262_144 {
        return Err("Invalid browser session".into());
    }
    let value: BrowserSession =
        serde_json::from_slice(bytes).map_err(|_| "Invalid browser session")?;
    if value.origin != ORIGIN
        || value.token.is_empty()
        || value.token.len() > 16_384
        || value.cookies.len() > 65_536
        || value.token.contains('\r')
        || value.token.contains('\n')
    {
        return Err("Invalid browser session".into());
    }
    Ok(value)
}

fn browser_executable(command: &str) -> Option<PathBuf> {
    let text = command.trim().strip_prefix('"')?;
    let path = PathBuf::from(text.split('"').next()?);
    let name = path.file_name()?.to_str()?.to_ascii_lowercase();
    if !path.is_absolute()
        || ![
            "brave.exe",
            "chrome.exe",
            "msedge.exe",
            "vivaldi.exe",
            "opera.exe",
        ]
        .contains(&name.as_str())
    {
        return None;
    }
    Some(path)
}

#[cfg(windows)]
fn default_browser() -> Result<PathBuf, String> {
    use winreg::{
        enums::{HKEY_CLASSES_ROOT, HKEY_CURRENT_USER},
        RegKey,
    };
    let choice = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(
            "Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice",
        )
        .map_err(|_| "Default browser is unavailable")?;
    let prog: String = choice
        .get_value("ProgId")
        .map_err(|_| "Default browser is unavailable")?;
    if prog.len() > 128
        || !prog
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "._-".contains(c))
    {
        return Err("Invalid default browser registration".into());
    }
    let key = RegKey::predef(HKEY_CLASSES_ROOT)
        .open_subkey(format!("{prog}\\shell\\open\\command"))
        .map_err(|_| "Default browser is unavailable")?;
    let command: String = key
        .get_value("")
        .map_err(|_| "Default browser is unavailable")?;
    let path = browser_executable(&command).ok_or(
        "Automatic sign-in requires a Chromium default browser such as Brave, Chrome or Edge",
    )?;
    if !path.is_file() {
        return Err("Default browser is not installed".into());
    }
    Ok(path)
}

#[cfg(not(windows))]
fn default_browser() -> Result<PathBuf, String> {
    Err("This browser sign-in integration requires Windows".into())
}

#[tauri::command]
pub async fn dsw2api_browser_login(
    window: WebviewWindow,
    app: tauri::AppHandle,
) -> Result<BrowserSession, String> {
    if window.label() != "main" {
        return Err("Sign-in requires the main Desktop window".into());
    }
    if ACTIVE
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Err("DeepSeek sign-in is already open".into());
    }
    let _guard = LoginGuard;
    CANCELLED.store(false, Ordering::Release);
    let browser = default_browser()?;
    let profile = app
        .path()
        .app_local_data_dir()
        .map_err(|_| "Private browser storage is unavailable")?
        .join("deepseek-system-browser");
    std::fs::create_dir_all(&profile).map_err(|_| "Private browser storage is unavailable")?;
    let resources = app
        .path()
        .resource_dir()
        .map_err(|_| "Browser runtime is unavailable")?
        .join("bin")
        .join("browser-login");
    let node = resources.join("node.exe");
    let script = resources.join("login.mjs");
    if !node.is_file() || !script.is_file() {
        return Err("Repair the Desktop installation to restore its browser runtime".into());
    }
    if CANCELLED.load(Ordering::Acquire) {
        return Err("DeepSeek sign-in was cancelled".into());
    }
    let mut command = Command::new(node);
    command.env_clear();
    for name in [
        "SystemRoot",
        "WINDIR",
        "USERPROFILE",
        "APPDATA",
        "LOCALAPPDATA",
        "TEMP",
        "TMP",
        "COMSPEC",
        "PATH",
        "SystemDrive",
        "USERDOMAIN",
        "USERNAME",
    ] {
        if let Some(value) = std::env::var_os(name) {
            command.env(name, value);
        }
    }
    command
        .arg(script)
        .arg("--browser")
        .arg(browser)
        .arg("--profile")
        .arg(profile)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command
        .spawn()
        .map_err(|_| "Could not start the default browser sign-in")?;
    *INPUT
        .lock()
        .map_err(|_| "Browser sign-in state is unavailable")? = child.stdin.take();
    if CANCELLED.load(Ordering::Acquire) {
        cancel_owned_browser();
    }
    let task = tauri::async_runtime::spawn_blocking(move || child.wait_with_output());
    let output = tokio::time::timeout(Duration::from_secs(660), task)
        .await
        .map_err(|_| "Browser sign-in timed out")?
        .map_err(|_| "Browser sign-in was interrupted")?
        .map_err(|_| "Browser sign-in was interrupted")?;
    if let Ok(mut input) = INPUT.lock() {
        input.take();
    }
    if !output.status.success() {
        return Err("Browser sign-in was cancelled or could not finish".into());
    }
    parse_session(&output.stdout)
}

#[tauri::command]
pub fn dsw2api_close_login(window: WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Sign-in requires the main Desktop window".into());
    }
    cancel_owned_browser();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn session_origin_and_size_are_checked() {
        assert!(parse_session(
            br#"{"origin":"https://chat.deepseek.com","token":"fixture","cookies":"fixture=1"}"#
        )
        .is_ok());
        assert!(parse_session(
            br#"{"origin":"https://evil.invalid","token":"fixture","cookies":""}"#
        )
        .is_err());
        assert!(parse_session(
            br#"{"origin":"https://chat.deepseek.com","token":"","cookies":""}"#
        )
        .is_err());
    }
    #[test]
    fn never_executes_the_registry_command_or_its_arguments() {
        assert!(browser_executable("powershell.exe -Command unexpected").is_none());
        assert!(browser_executable("\"relative\\brave.exe\" %1").is_none());
        #[cfg(windows)]
        assert_eq!(
            browser_executable("\"C:\\Program Files\\Browser\\brave.exe\" --single-argument %1"),
            Some(PathBuf::from("C:\\Program Files\\Browser\\brave.exe"))
        );
    }
}
