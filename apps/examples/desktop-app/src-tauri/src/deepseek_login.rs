use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

const LABEL: &str = "dsw2api-login";
const ORIGIN: &str = "https://chat.deepseek.com";
static ACTIVE: AtomicBool = AtomicBool::new(false);

struct LoginGuard;
impl Drop for LoginGuard {
    fn drop(&mut self) {
        ACTIVE.store(false, Ordering::Release);
    }
}

#[derive(Serialize)]
pub struct BrowserSession {
    token: String,
    cookies: String,
}

fn valid_origin(url: &tauri::Url) -> bool {
    url.origin().ascii_serialization() == ORIGIN
        && url.username().is_empty()
        && url.password().is_none()
}

fn captured_token(value: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(value).ok()?;
    if value.get("origin")?.as_str()? != ORIGIN {
        return None;
    }
    let token = value.get("token")?.as_str()?.trim();
    if token.is_empty() || token.len() > 16_384 || token.contains('\r') || token.contains('\n') {
        return None;
    }
    Some(token.to_string())
}

// Executed only in our isolated sign-in WebView, on the exact HTTPS origin.
// No IPC bridge or app capabilities are granted to the remote page. Passwords
// remain on DeepSeek's page; only a verified session reaches the main window.
const CAPTURE: &str = r#"(() => {
  if (location.origin !== 'https://chat.deepseek.com') return null;
  try {
    let raw = localStorage.getItem('userToken');
    if (!raw) return null;
    let token = raw;
    try { const parsed = JSON.parse(raw); token = typeof parsed === 'string' ? parsed : parsed.value; } catch {}
    if (typeof token !== 'string' || !token.trim() || token.length > 16384) return null;
    token = token.replace(/^Bearer\s+/, '').trim();
    let state = window.__clineDswAuthCheck;
    if (state && state.token === token && state.verified) return {origin: location.origin, token};
    if (!state || state.token !== token || (!state.pending && Date.now() - state.time > 10000)) {
      state = {token, verified: false, pending: true, time: Date.now()};
      window.__clineDswAuthCheck = state;
      fetch('/api/v0/users/current', {credentials: 'include', headers: {Authorization: 'Bearer ' + token, 'X-App-Version': '2.0.0', 'X-Client-Version': '2.0.0', 'X-Client-Platform': 'web'}, signal: AbortSignal.timeout(8000)})
        .then(response => response.ok ? response.json() : null)
        .then(value => { state.verified = !!(value && value.code === 0 && value.data && (value.data.biz_code || 0) === 0 && value.data.biz_data); })
        .catch(() => {}).finally(() => { state.pending = false; });
    }
  } catch {}
  return null;
})()"#;

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
        if let Some(login) = app.get_webview_window(LABEL) {
            let _ = login.set_focus();
        }
        return Err("DeepSeek sign-in is already open".into());
    }
    let _guard = LoginGuard;
    let login = if let Some(existing) = app.get_webview_window(LABEL) {
        let _ = existing.show();
        let _ = existing.set_focus();
        existing
    } else {
        let data = app
            .path()
            .app_local_data_dir()
            .map_err(|_| "Private browser storage is unavailable")?
            .join("deepseek-browser");
        std::fs::create_dir_all(&data).map_err(|_| "Private browser storage is unavailable")?;
        WebviewWindowBuilder::new(
            &app,
            LABEL,
            WebviewUrl::External(format!("{ORIGIN}/sign_in").parse().unwrap()),
        )
        .title("DeepSeek — вход / sign in")
        .inner_size(1040.0, 800.0)
        .data_directory(data)
        .on_navigation(|url| url.scheme() == "https" || url.as_str() == "about:blank")
        .build()
        .map_err(|_| "Could not open the DeepSeek sign-in browser")?
    };
    let deadline = tokio::time::Instant::now() + Duration::from_secs(600);
    while tokio::time::Instant::now() < deadline {
        if app.get_webview_window(LABEL).is_none() {
            return Err("DeepSeek sign-in was cancelled".into());
        }
        if login.url().map(|url| valid_origin(&url)).unwrap_or(false) {
            let (sender, mut receiver) = tokio::sync::mpsc::unbounded_channel();
            if login
                .eval_with_callback(CAPTURE, move |value| {
                    let _ = sender.send(value);
                })
                .is_ok()
            {
                if let Ok(Some(value)) =
                    tokio::time::timeout(Duration::from_secs(3), receiver.recv()).await
                {
                    if let Some(token) = captured_token(&value) {
                        if !login.url().map(|url| valid_origin(&url)).unwrap_or(false) {
                            continue;
                        }
                        let reader = login.clone();
                        let cookies = tokio::time::timeout(
                            Duration::from_secs(10),
                            tauri::async_runtime::spawn_blocking(move || {
                                reader.cookies_for_url(ORIGIN.parse().unwrap())
                            }),
                        )
                        .await
                        .map_err(|_| "Browser cookie read timed out")?
                        .map_err(|_| "Could not read the browser session")?
                        .map_err(|_| "Could not read the browser session")?;
                        let cookies = cookies
                            .iter()
                            .map(|cookie| format!("{}={}", cookie.name(), cookie.value()))
                            .collect::<Vec<_>>()
                            .join("; ");
                        if cookies.len() > 65_536 {
                            return Err("DeepSeek session cookies are too large".into());
                        }
                        return Ok(BrowserSession { token, cookies });
                    }
                }
            }
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    Err("DeepSeek sign-in timed out; sign in and try again".into())
}

#[tauri::command]
pub fn dsw2api_close_login(window: WebviewWindow, app: tauri::AppHandle) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Sign-in requires the main Desktop window".into());
    }
    if let Some(login) = app.get_webview_window(LABEL) {
        login.close().map_err(|_| "Could not close sign-in")?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_foreign_and_insecure_origins() {
        for url in [
            "http://chat.deepseek.com/",
            "https://chat.deepseek.com.evil.invalid/",
            "https://chat.deepseek.com:444/",
            "https://user@chat.deepseek.com/",
        ] {
            assert!(!valid_origin(&url.parse().unwrap()));
        }
        assert!(valid_origin(
            &"https://chat.deepseek.com/sign_in".parse().unwrap()
        ));
    }
    #[test]
    fn accepts_only_bounded_verified_origin_results() {
        assert_eq!(
            captured_token(r#"{"origin":"https://chat.deepseek.com","token":"fixture"}"#)
                .as_deref(),
            Some("fixture")
        );
        for value in [
            "null",
            "{}",
            r#"{"origin":"https://evil.invalid","token":"fixture"}"#,
            r#"{"origin":"https://chat.deepseek.com","token":""}"#,
        ] {
            assert!(captured_token(value).is_none());
        }
    }
}
