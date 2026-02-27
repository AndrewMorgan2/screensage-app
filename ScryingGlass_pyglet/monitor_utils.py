"""
Monitor detection and workspace management utilities.

Supports Hyprland (Wayland) and X11 (xrandr) for multi-monitor setups.
"""

import json
import subprocess
from typing import Optional, Tuple


def get_monitor_dimensions(monitor_idx: int) -> Optional[Tuple[int, int, int, int]]:
    """
    Get the dimensions for a specific monitor using system tools.
    Tries hyprctl first (Wayland/Hyprland), then xrandr (X11), then returns None.

    Args:
        monitor_idx: Index of the monitor (0-based)

    Returns:
        tuple: (width, height, x, y) or None if not found
    """
    # Try hyprctl first (Hyprland/Wayland)
    try:
        result = subprocess.run(
            ['hyprctl', 'monitors', '-j'],
            capture_output=True,
            text=True,
            timeout=2
        )
        if result.returncode == 0:
            monitors = json.loads(result.stdout)
            if monitor_idx < len(monitors):
                mon = monitors[monitor_idx]
                width = mon.get('width', 1920)
                height = mon.get('height', 1080)
                x = mon.get('x', 0)
                y = mon.get('y', 0)
                print(f"  hyprctl: Monitor {monitor_idx} = {width}x{height} at ({x}, {y})")
                return (width, height, x, y)
    except (FileNotFoundError, subprocess.TimeoutExpired, json.JSONDecodeError, KeyError):
        pass

    # Try xrandr (X11)
    try:
        result = subprocess.run(
            ['xrandr', '--query'],
            capture_output=True,
            text=True,
            timeout=2
        )
        if result.returncode == 0:
            import re
            # Parse xrandr output: "HDMI-1 connected 1920x1080+0+0"
            pattern = r'(\S+) connected(?: primary)? (\d+)x(\d+)\+(\d+)\+(\d+)'
            matches = re.findall(pattern, result.stdout)
            if monitor_idx < len(matches):
                name, width, height, x, y = matches[monitor_idx]
                width, height, x, y = int(width), int(height), int(x), int(y)
                print(f"  xrandr: Monitor {monitor_idx} ({name}) = {width}x{height} at ({x}, {y})")
                return (width, height, x, y)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    return None


def get_hyprland_workspace_for_monitor(monitor_idx: int) -> Optional[int]:
    """
    Get the workspace number for a specific monitor in Hyprland.

    Args:
        monitor_idx: Index of the monitor (0-based)

    Returns:
        Workspace ID or None if not running on Hyprland or if monitor not found
    """
    try:
        result = subprocess.run(
            ['hyprctl', 'monitors', '-j'],
            capture_output=True,
            text=True,
            timeout=2
        )
        if result.returncode != 0:
            return None

        monitors = json.loads(result.stdout)
        if monitor_idx < len(monitors):
            workspace_id = monitors[monitor_idx]['activeWorkspace']['id']
            print(f"  Hyprland: Monitor {monitor_idx} → Workspace {workspace_id}")
            return workspace_id
    except (FileNotFoundError, subprocess.TimeoutExpired, json.JSONDecodeError, KeyError):
        pass
    return None


def switch_hyprland_workspace(workspace_id: int, restore_workspace: Optional[int] = None) -> bool:
    """
    Switch to a specific Hyprland workspace.

    Args:
        workspace_id: Target workspace ID
        restore_workspace: If provided, schedules a return to that workspace after a delay

    Returns:
        True if successful, False otherwise
    """
    try:
        result = subprocess.run(
            ['hyprctl', 'dispatch', 'workspace', str(workspace_id)],
            capture_output=True,
            text=True,
            timeout=2
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def get_current_hyprland_workspace() -> Optional[int]:
    """
    Get the currently focused workspace in Hyprland.

    Returns:
        Current workspace ID or None if not on Hyprland
    """
    try:
        result = subprocess.run(
            ['hyprctl', 'monitors', '-j'],
            capture_output=True,
            text=True,
            timeout=2
        )
        if result.returncode == 0:
            monitors = json.loads(result.stdout)
            for mon in monitors:
                if mon.get('focused'):
                    return mon['activeWorkspace']['id']
    except (FileNotFoundError, subprocess.TimeoutExpired, json.JSONDecodeError, KeyError):
        pass
    return None
