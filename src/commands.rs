use crate::models::PredefinedCommand;
use std::collections::HashMap;

/// Initialize the predefined commands available in the UI
pub fn initialize_commands() -> HashMap<String, PredefinedCommand> {
    let mut commands = HashMap::new();

    commands.insert(
        "stop-vtt".to_string(),
        PredefinedCommand {
            name: "VTT OBS".to_string(),
            command: "bash".to_string(),
            args: vec![
                "-c".to_string(),
                "pkill -f ./python-env/bin/python || echo 'VTT is not currently running'".to_string(),
            ],
        },
    );

    commands.insert(
        "vtt-status".to_string(),
        PredefinedCommand {
            name: "VTT Status".to_string(),
            command: "bash".to_string(),
            args: vec![
                "-c".to_string(),
                "COUNT=$(pgrep -f ./python-env/bin/python | wc -l); if [ $COUNT -gt 0 ]; then echo \"$COUNT VTT instance(s) running:\"; ps aux | grep obs | grep -v grep; else echo 'OBS is not running'; fi".to_string(),
            ],
        }
    );

    // Command to list available monitors using hyprctl (Wayland) or xrandr (X11)
    commands.insert(
        "list-monitors".to_string(),
        PredefinedCommand {
            name: "List Available Monitors".to_string(),
            command: "bash".to_string(),
            args: vec![
                "-c".to_string(),
                "if command -v hyprctl &> /dev/null; then hyprctl monitors -j | jq -r '.[] | \"\\(.id): \\(.name) - \\(.width)x\\(.height)\"'; elif command -v xrandr &> /dev/null; then xrandr | grep ' connected' | awk '{print NR-1 \": \" $1 \" - \" $3}'; else echo 'No display detection tool available'; fi".to_string(),
            ],
        },
    );

    // Display engine commands with environment sourcing
    // Use setsid -f to make Python survive server shutdown
    commands.insert(
        "start-battlemap-screen".to_string(),
        PredefinedCommand {
            name: "Start Battle".to_string(),
            command: "bash".to_string(),
            args: vec![
                "-c".to_string(),
                "[ -f ./screensage-env.sh ] && source ./screensage-env.sh; setsid -f ./python-env/bin/python ./ScryingGlass_pyglet/display_engine_pyglet.py ./storage/scrying_glasses/battlemap.json".to_string(),
            ],
        },
    );

    commands.insert(
        "start-display-screen".to_string(),
        PredefinedCommand {
            name: "Start Display Screen".to_string(),
            command: "bash".to_string(),
            args: vec![
                "-c".to_string(),
                "[ -f ./screensage-env.sh ] && source ./screensage-env.sh; setsid -f ./python-env/bin/python ./ScryingGlass_pyglet/display_engine_pyglet.py ./storage/scrying_glasses/display.json".to_string(),
            ],
        },
    );

    // Stop all display engines
    commands.insert(
        "stop-display".to_string(),
        PredefinedCommand {
            name: "Stop Display".to_string(),
            command: "bash".to_string(),
            args: vec![
                "-c".to_string(),
                "pkill -f 'display_engine_pyglet.py' || echo 'No display engines running'".to_string(),
            ],
        },
    );

    commands
}
