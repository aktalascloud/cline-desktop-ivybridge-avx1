use std::sync::atomic::{AtomicBool, Ordering};
static RUSSIAN: AtomicBool = AtomicBool::new(false);
pub fn is_russian() -> bool {
    RUSSIAN.load(Ordering::Relaxed)
}
pub fn set(language: &str) {
    RUSSIAN.store(language == "ru", Ordering::Relaxed);
}
pub fn text(en: &'static str) -> &'static str {
    if !is_russian() {
        return en;
    }
    match en {
        "New Session" => "Новый сеанс",
        "Settings" => "Настройки",
        "Quit" => "Выйти",
        "Status: Checking for Updates" => "Проверка обновлений",
        "Status: Downloading Update" => "Загрузка обновления",
        "Status: Update Available" => "Доступно обновление",
        "Status: Update Check Failed" => "Ошибка проверки обновлений",
        "Status: Healthy" => "Работает",
        "Status: Hub Disconnected" => "Hub отключён",
        _ => en,
    }
}
pub fn update_label(en: String) -> String {
    if !is_russian() {
        return en;
    }
    en.replace("Checking for Updates", "Проверка обновлений")
        .replace("Downloading Update", "Загрузка обновления")
        .replace("Restart to Update to", "Перезапустить для обновления до")
        .replace("Restart to Update", "Перезапустить для обновления")
        .replace("Check for Updates", "Проверить обновления")
}
pub fn sessions(count: u32) -> String {
    let word = if count % 10 == 1 && count % 100 != 11 {
        "сеанс"
    } else if (2..=4).contains(&(count % 10)) && !(12..=14).contains(&(count % 100)) {
        "сеанса"
    } else {
        "сеансов"
    };
    format!("Активно: {count} {word}")
}
#[cfg(test)]
mod tests {
    #[test]
    fn russian_plural_forms() {
        assert_eq!(super::sessions(1), "Активно: 1 сеанс");
        assert_eq!(super::sessions(2), "Активно: 2 сеанса");
        assert_eq!(super::sessions(11), "Активно: 11 сеансов");
        assert_eq!(super::sessions(21), "Активно: 21 сеанс");
    }
}
