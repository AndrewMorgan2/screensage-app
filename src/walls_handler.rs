use actix_web::{HttpResponse, Responder};

/// Serve the Walls & Doors authoring page
pub async fn walls_render() -> impl Responder {
    let html = crate::template_renderers::render_walls();

    HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .body(html)
}
