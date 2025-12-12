// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use futures_util::StreamExt;
use serde::Serialize;
use bytes::Bytes;
use futures_util::stream;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc,
};
use std::time::{Duration, Instant};
use std::error::Error;
use tauri::ipc::Channel;
use tokio::time::sleep;

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

#[tauri::command]
async fn upload_speed_test(
    url: String,
    duration_ms: u64,
    chunk_size: usize,
    on_event: Channel<UploadSpeedEvent>,
) {
    // Streams upload progress via a Tauri Channel.
    // Reference pattern: https://tauri.app/develop/calling-frontend/#channels
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

        let chunk_size = chunk_size.clamp(8 * 1024, 1024 * 1024); // 8KB .. 1MB
        let stop_after = Duration::from_millis(duration_ms.max(250));
        let start = Instant::now();

        let _ = on_event.send(UploadSpeedEvent::Started {
            url: url.clone(),
            duration_ms,
            chunk_size,
        });

        let client = match reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .redirect(reqwest::redirect::Policy::limited(10))
            .user_agent("SpeedHive/0.1 (Tauri)")
            .build()
        {
            Ok(c) => c,
            Err(err) => {
                let _ = on_event.send(UploadSpeedEvent::Error {
                    message: format!(
                        "Failed to build HTTP client:\n{}",
                        format_error_with_chain(&err)
                    ),
                });
                return;
            }
        };

        let total_sent = Arc::new(AtomicU64::new(0));
        let done = Arc::new(AtomicBool::new(false));

        // Max upload: 200 MB
        let max_bytes: u64 = 200 * 1024 * 1024;

        // Many public "echo" endpoints reject long-running chunked uploads (often 500/413).
        // To be more compatible, we do multiple fixed-size POSTs with Content-Length.
        let chunk = Bytes::from(vec![0u8; chunk_size]);
        // Start with a decent payload size, but adapt downward if the server rejects it.
        let mut request_bytes: u64 = (chunk_size as u64) * 16; // ~4MB when chunk_size=256KB
        request_bytes = request_bytes.clamp(64 * 1024, 8 * 1024 * 1024);

        // Progress reporter task - shows current speed based on total bytes / total elapsed time
        let on_event_progress = on_event;
        let on_event_progress_task = on_event_progress.clone();
        let total_sent_progress = Arc::clone(&total_sent);
        let done_progress = Arc::clone(&done);
        tauri::async_runtime::spawn(async move {
            let emit_every = Duration::from_millis(250);

            loop {
                if done_progress.load(Ordering::Relaxed) {
                    break;
                }

                sleep(emit_every).await;

                if done_progress.load(Ordering::Relaxed) {
                    break;
                }

                let bytes = total_sent_progress.load(Ordering::Relaxed);
                let elapsed_secs = start.elapsed().as_secs_f64().max(0.001);
                let elapsed_ms = start.elapsed().as_millis() as u64;
                // Actual throughput: total bytes sent / total elapsed time
                let mbps = (bytes as f64 * 8.0) / (elapsed_secs * 1_000_000.0);

                let _ = on_event_progress_task.send(UploadSpeedEvent::Progress {
                    elapsed_ms,
                    bytes,
                    mbps,
                });
            }
        });

        // Upload until duration reached OR max_bytes (200 MB) sent
        while start.elapsed() < stop_after && total_sent.load(Ordering::Relaxed) < max_bytes {
            let total_sent_for_stream = Arc::clone(&total_sent);
            let chunk_for_stream = chunk.clone();
            let remaining = Arc::new(AtomicU64::new(request_bytes));

            // Fixed-size body stream so we can set Content-Length.
            let body_stream = stream::unfold((), move |_| {
                let total_sent_for_stream = Arc::clone(&total_sent_for_stream);
                let chunk_for_stream = chunk_for_stream.clone();
                let remaining = Arc::clone(&remaining);
                async move {
                    let current = remaining.load(Ordering::Relaxed);
                    if current == 0 {
                        return None;
                    }

                    let take = std::cmp::min(current, chunk_for_stream.len() as u64);
                    remaining.fetch_sub(take, Ordering::Relaxed);

                    // Note: we count bytes that were *polled* by reqwest from the stream.
                    // If the server closes early, the stream stops being polled and
                    // the count reflects what was actually attempted to send.
                    total_sent_for_stream.fetch_add(take, Ordering::Relaxed);

                    if take == chunk_for_stream.len() as u64 {
                        Some((Ok::<Bytes, std::convert::Infallible>(chunk_for_stream), ()))
                    } else {
                        Some((
                            Ok::<Bytes, std::convert::Infallible>(
                                chunk_for_stream.slice(0..(take as usize)),
                            ),
                            (),
                        ))
                    }
                }
            });

            let resp = match client
                .post(&url)
                .header("content-type", "application/octet-stream")
                .header("content-length", request_bytes)
                .body(reqwest::Body::wrap_stream(body_stream))
                .send()
                .await
            {
                Ok(r) => r,
                Err(_err) => {
                    // If we already pushed some bytes, finish the test with whatever we measured.
                    // This avoids losing the final result due to a late network hiccup.
                    break;
                }
            };

            if !resp.status().is_success() {
                // Don't surface HTTP codes to the user; treat this as a compatibility issue.
                // If possible, adapt to a smaller payload and keep measuring until duration ends.
                if request_bytes > 64 * 1024 {
                    request_bytes = std::cmp::max(64 * 1024, request_bytes / 2);
                    continue;
                }
                break;
            }
        }

        done.store(true, Ordering::Relaxed);

        // Give the progress task a moment to exit
        sleep(Duration::from_millis(50)).await;

        let elapsed_ms = start.elapsed().as_millis() as u64;
        let elapsed_secs = start.elapsed().as_secs_f64().max(0.001);
        let bytes = total_sent.load(Ordering::Relaxed);

        // Actual upload speed: total bytes sent / total elapsed time
        let avg_mbps = (bytes as f64 * 8.0) / (elapsed_secs * 1_000_000.0);

        let _ = on_event_progress.send(UploadSpeedEvent::Finished {
            elapsed_ms,
            bytes,
            avg_mbps,
        });
    });
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "event", content = "data")]
enum UploadSpeedEvent {
    Started {
        url: String,
        duration_ms: u64,
        chunk_size: usize,
    },
    Progress {
        elapsed_ms: u64,
        bytes: u64,
        mbps: f64,
    },
    Finished {
        elapsed_ms: u64,
        bytes: u64,
        avg_mbps: f64,
    },
    Error {
        message: String,
    },
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            download_speed_test,
            upload_speed_test
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
