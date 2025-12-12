// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    println!("You are amazing {}", name.to_string().to_uppercase());

    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_download_speed() -> String {
    println!("Getting speed");

    format!("Speed: 100 Mbps")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
