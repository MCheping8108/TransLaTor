// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn translate_request(
    text: String,
    source_lang: String,
    target_lang: String,
    api_key: String,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let response = client
        .post("https://api-fanyi.qzhua.net/api/v1/translate")
        .bearer_auth(api_key)
        .json(&serde_json::json!({
            "text": text,
            "sourceLang": source_lang,
            "targetLang": target_lang,
            "stream": false
        }))
        .send()
        .await
        .map_err(|error| format!("网络请求失败：{error}"))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| format!("读取响应失败：{error}"))?;
    if !status.is_success() {
        return Err(format!("请求失败（{}）：{}", status.as_u16(), body));
    }

    serde_json::from_str(&body).map_err(|error| format!("响应格式错误：{error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, translate_request])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
