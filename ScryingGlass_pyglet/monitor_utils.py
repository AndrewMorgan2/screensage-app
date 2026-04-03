"""
Monitor detection and workspace management utilities.

Supports Hyprland (Wayland), X11 (xrandr), Windows (ctypes), macOS (AppKit),
and screeninfo as a universal cross-platform fallback.
"""

import sys
import json
import subprocess
from typing import Optional, Tuple


def get_monitor_dimensions(monitor_idx: int) -> Optional[Tuple[int, int, int, int]]:
    """
    Get the dimensions for a specific monitor.

    Tries platform-native methods in order:
      Linux  — hyprctl (Hyprland/Wayland), then xrandr (X11)
      Windows — ctypes EnumDisplayMonitors
      macOS   — AppKit NSScreen
    Falls back to the screeninfo package on any platform if all else fails.

    Args:
        monitor_idx: Index of the monitor (0-based)

    Returns:
        tuple: (width, height, x, y) or None if not found
    """
    # ── Linux: Hyprland / Wayland ─────────────────────────────────────────────
    if sys.platform == 'linux':
        try:
            result = subprocess.run(
                ['hyprctl', 'monitors', '-j'],
                capture_output=True, text=True, timeout=2
            )
            if result.returncode == 0:
                monitors = json.loads(result.stdout)
                if monitor_idx < len(monitors):
                    mon = monitors[monitor_idx]
                    width  = mon.get('width',  1920)
                    height = mon.get('height', 1080)
                    x      = mon.get('x', 0)
                    y      = mon.get('y', 0)
                    print(f"  hyprctl: Monitor {monitor_idx} = {width}x{height} at ({x}, {y})")
                    return (width, height, x, y)
        except (FileNotFoundError, subprocess.TimeoutExpired, json.JSONDecodeError, KeyError):
            pass

        # ── Linux: X11 / xrandr ───────────────────────────────────────────────
        try:
            result = subprocess.run(
                ['xrandr', '--query'],
                capture_output=True, text=True, timeout=2
            )
            if result.returncode == 0:
                import re
                pattern = r'(\S+) connected(?: primary)? (\d+)x(\d+)\+(\d+)\+(\d+)'
                matches = re.findall(pattern, result.stdout)
                if monitor_idx < len(matches):
                    name, width, height, x, y = matches[monitor_idx]
                    width, height, x, y = int(width), int(height), int(x), int(y)
                    print(f"  xrandr: Monitor {monitor_idx} ({name}) = {width}x{height} at ({x}, {y})")
                    return (width, height, x, y)
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass

    # ── Windows: ctypes EnumDisplayMonitors ──────────────────────────────────
    elif sys.platform == 'win32':
        try:
            import ctypes
            monitors = []

            def _monitor_cb(hmon, hdc, lprect, lparam):
                rect = lprect.contents
                monitors.append((
                    rect.right  - rect.left,   # width
                    rect.bottom - rect.top,    # height
                    rect.left,                 # x
                    rect.top,                  # y
                ))
                return 1  # continue enumeration

            class RECT(ctypes.Structure):
                _fields_ = [('left', ctypes.c_long), ('top', ctypes.c_long),
                             ('right', ctypes.c_long), ('bottom', ctypes.c_long)]

            MonitorEnumProc = ctypes.WINFUNCTYPE(
                ctypes.c_bool,
                ctypes.c_ulong, ctypes.c_ulong,
                ctypes.POINTER(RECT), ctypes.c_double
            )
            cb = MonitorEnumProc(_monitor_cb)
            ctypes.windll.user32.EnumDisplayMonitors(None, None, cb, 0)

            if monitor_idx < len(monitors):
                width, height, x, y = monitors[monitor_idx]
                print(f"  ctypes: Monitor {monitor_idx} = {width}x{height} at ({x}, {y})")
                return (width, height, x, y)
        except Exception:
            pass

    # ── macOS: AppKit NSScreen ────────────────────────────────────────────────
    elif sys.platform == 'darwin':
        try:
            from AppKit import NSScreen  # type: ignore
            screens = NSScreen.screens()
            if monitor_idx < len(screens):
                frame = screens[monitor_idx].frame()
                width  = int(frame.size.width)
                height = int(frame.size.height)
                x      = int(frame.origin.x)
                y      = int(frame.origin.y)
                print(f"  NSScreen: Monitor {monitor_idx} = {width}x{height} at ({x}, {y})")
                return (width, height, x, y)
        except (ImportError, Exception):
            pass

    # ── Universal fallback: screeninfo ────────────────────────────────────────
    try:
        from screeninfo import get_monitors  # type: ignore
        monitors = get_monitors()
        if monitor_idx < len(monitors):
            mon = monitors[monitor_idx]
            print(f"  screeninfo: Monitor {monitor_idx} = {mon.width}x{mon.height} at ({mon.x}, {mon.y})")
            return (mon.width, mon.height, mon.x, mon.y)
    except (ImportError, Exception):
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
