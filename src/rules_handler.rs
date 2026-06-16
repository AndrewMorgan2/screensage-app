use actix_web::{HttpResponse, Responder};

/// Path to the rules database used by the Rules Assistant page
pub const RULES_DB_PATH: &str = "./storage/rules/rules.json";

/// Serve the rules assistant page
pub async fn rules_render() -> impl Responder {
    let html = crate::template_renderers::render_rules();

    HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .body(html)
}
