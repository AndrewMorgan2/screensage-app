use actix_web::{web, HttpRequest, HttpResponse};
use actix_ws::Message;
use tokio::sync::broadcast::Sender;

pub type WsBroadcast = Sender<String>;

pub async fn ws_handler(
    req: HttpRequest,
    body: web::Payload,
    tx: web::Data<WsBroadcast>,
) -> actix_web::Result<HttpResponse> {
    let (response, mut session, mut stream) = actix_ws::handle(&req, body)?;

    let mut rx = tx.subscribe();

    actix_web::rt::spawn(async move {
        loop {
            tokio::select! {
                // Forward broadcast events to this WebSocket client
                Ok(msg) = rx.recv() => {
                    if session.text(msg).await.is_err() {
                        break;
                    }
                }
                // Handle incoming messages from the client (ping/close)
                Some(Ok(msg)) = stream.recv() => {
                    match msg {
                        Message::Ping(bytes) => {
                            if session.pong(&bytes).await.is_err() {
                                break;
                            }
                        }
                        Message::Close(_) => break,
                        _ => {}
                    }
                }
                else => break,
            }
        }
    });

    Ok(response)
}
