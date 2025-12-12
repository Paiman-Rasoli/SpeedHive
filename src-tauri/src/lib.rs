// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use futures_util::StreamExt;
use serde::Serialize;
use std::time::{Duration, Instant};
use tauri::ipc::Channel;
use std::error::Error;

#[tauri::command]
fn greet(name: &str) -> String {
    println!("You are amazing {}", name.to_string().to_uppercase());

    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn download_speed_test(url: String, duration_ms: u64, on_event: Channel<DownloadSpeedEvent>) {
    // Runs in the background and streams progress events over a Tauri Channel.
    // This matches the "Channels" pattern from Tauri docs:
    // https://tauri.app/develop/calling-frontend/#channels
    tauri::async_runtime::spawn(async move {
        fn format_error_with_chain(err: &dyn Error) -> String {
            let mut out = err.to_string();
            let mut cur = err.source();
            while let Some(e) = cur {
                out.push_str("\ncaused by: ");
                out.push_str(&e.to_string());
                cur = e.source();
            }
            out
        }

        let start = Instant::now();

        // Fallback list in case a specific host is blocked by firewall/DNS, or TLS interception
        // requires OS trust store (which reqwest default-tls uses on Windows).
        let candidates: Vec<String> = {
            let mut v = Vec::new();
            if !url.trim().is_empty() {
                v.push(url.clone());
            }
            // Cloudflare speed endpoint (HTTPS).
            v.push("https://speed.cloudflare.com/__down?bytes=25000000".to_string());
            // Plain HTTP fallback (no TLS), useful in some locked-down networks.
            v.push("http://ipv4.download.thinkbroadband.com/10MB.zip".to_string());
            v
        };

        let client = match reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .redirect(reqwest::redirect::Policy::limited(10))
            .user_agent("SpeedHive/0.1 (Tauri)")
            .build()
        {
            Ok(c) => c,
            Err(err) => {
                let _ = on_event.send(DownloadSpeedEvent::Error {
                    message: format!("Failed to build HTTP client:\n{}", format_error_with_chain(&err)),
                });
                return;
            }
        };

        let mut last_err: Option<reqwest::Error> = None;

        let mut stream = None;
        let mut chosen_url = None;

        for u in candidates {
            let _ = on_event.send(DownloadSpeedEvent::Started {
                url: u.clone(),
                duration_ms,
            });

            let response = match client.get(&u).send().await {
                Ok(resp) => resp,
                Err(err) => {
                    last_err = Some(err);
                    continue;
                }
            };

            if !response.status().is_success() {
                let _ = on_event.send(DownloadSpeedEvent::Error {
                    message: format!("HTTP error from {u}: {}", response.status()),
                });
                return;
            }

            chosen_url = Some(u);
            stream = Some(response.bytes_stream());
            break;
        }

        let Some(mut stream) = stream else {
            let msg = match last_err {
                Some(err) => format!("Request failed:\n{}", format_error_with_chain(&err)),
                None => "Request failed: no URL candidates".to_string(),
            };
            let _ = on_event.send(DownloadSpeedEvent::Error { message: msg });
            return;
        };
        let _ = chosen_url; // reserved for future UI display

        let mut total_bytes: u64 = 0;
        let mut last_emit = Instant::now();
        let mut last_bytes: u64 = 0;

        // Emit progress roughly 4 times per second.
        let emit_every = Duration::from_millis(250);
        let stop_after = Duration::from_millis(duration_ms.max(250));

        loop {
            // Stop once we've hit the target duration (even if the stream continues).
            if start.elapsed() >= stop_after {
                break;
            }

            match stream.next().await {
                Some(Ok(chunk)) => {
                    total_bytes += chunk.len() as u64;
                }
                Some(Err(err)) => {
                    let _ = on_event.send(DownloadSpeedEvent::Error {
                        message: format!("Download failed: {err}"),
                    });
                    return;
                }
                None => {
                    // Remote server ended the stream. We'll finish with whatever we measured.
                    break;
                }
            }

            if last_emit.elapsed() >= emit_every {
                let elapsed_ms = start.elapsed().as_millis() as u64;
                let interval_secs = last_emit.elapsed().as_secs_f64().max(0.001);
                let delta_bytes = total_bytes.saturating_sub(last_bytes);
                let mbps = (delta_bytes as f64 * 8.0) / (interval_secs * 1_000_000.0);

                let _ = on_event.send(DownloadSpeedEvent::Progress {
                    elapsed_ms,
                    bytes: total_bytes,
                    mbps,
                });

                last_emit = Instant::now();
                last_bytes = total_bytes;
            }
        }

        let elapsed_ms = start.elapsed().as_millis() as u64;
        let elapsed_secs = start.elapsed().as_secs_f64().max(0.001);
        let avg_mbps = (total_bytes as f64 * 8.0) / (elapsed_secs * 1_000_000.0);

        let _ = on_event.send(DownloadSpeedEvent::Finished {
            elapsed_ms,
            bytes: total_bytes,
            avg_mbps,
        });
    });
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "event", content = "data")]
enum DownloadSpeedEvent {
    Started { url: String, duration_ms: u64 },
    Progress { elapsed_ms: u64, bytes: u64, mbps: f64 },
    Finished { elapsed_ms: u64, bytes: u64, avg_mbps: f64 },
    Error { message: String },
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, download_speed_test])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
