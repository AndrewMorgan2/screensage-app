#!/bin/bash
#
# ScreenSage Environment Setup
# Optional file - commands will source this if it exists
#
# On ISO: This file is auto-generated with proper display settings
# On Dev PC: You can customize these for your environment
#

# Display settings (adjust for your setup)
export DISPLAY="${DISPLAY:-:0}"

# XDG Runtime directory (Linux desktop standard)
if [ -z "$XDG_RUNTIME_DIR" ]; then
    if [ -d "/run/user/$UID" ]; then
        export XDG_RUNTIME_DIR="/run/user/$UID"
    elif [ "$UID" = "0" ]; then
        export XDG_RUNTIME_DIR="/run/user/0"
    fi
fi

# Ensure XDG directory exists (if we have permission)
if [ -n "$XDG_RUNTIME_DIR" ]; then
    mkdir -p "$XDG_RUNTIME_DIR" 2>/dev/null || true
    chmod 700 "$XDG_RUNTIME_DIR" 2>/dev/null || true
fi

# SDL settings for pygame
export SDL_VIDEODRIVER="${SDL_VIDEODRIVER:-x11}"
export SDL_AUDIODRIVER="${SDL_AUDIODRIVER:-pulseaudio}"

# Suppress pygame AVX2 warning (cosmetic)
export PYGAME_DETECT_AVX2=0
