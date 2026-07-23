"""
Raw multitouch input for touch-overlay hardware (Linux evdev, multitouch
Protocol B - ABS_MT_SLOT / ABS_MT_TRACKING_ID / ABS_MT_POSITION_X/Y).

Why this exists: Pyglet's window only ever exposes a single OS-emulated mouse
pointer (on_mouse_press/on_mouse_drag/on_mouse_release). X11/Wayland collapse
all simultaneous touches down to that one pointer, so a second mini placed on
the board while the first is still down never generates its own event - it's
just invisible to the app, no matter what the touch hardware itself supports.

This module reads the touch device directly, bypassing that single-pointer
funnel entirely, and tracks each simultaneous contact (finger or mini base)
as its own independent touch with a stable ID for its whole down->move->up
lifetime.
"""

import logging
import queue
import threading

try:
    import evdev
    from evdev import ecodes
    EVDEV_AVAILABLE = True
except ImportError:
    EVDEV_AVAILABLE = False

logger = logging.getLogger('ScreenSage.TouchInput')

# Devices whose name contains one of these (case-insensitive) are treated as
# touchscreens. Laptop trackpads also report ABS_MT_SLOT, so capability alone
# isn't enough to pick the right device - "touchpad" is explicitly excluded.
_NAME_INCLUDE = ('touch',)
_NAME_EXCLUDE = ('touchpad', 'trackpad')


def find_touchscreen_device():
    """
    Find the first connected evdev device that looks like a multitouch
    touchscreen (has ABS_MT_SLOT + ABS_MT_TRACKING_ID, name suggests a
    touchscreen rather than a trackpad). Returns an evdev.InputDevice, or
    None if nothing suitable is found.
    """
    if not EVDEV_AVAILABLE:
        return None

    for path in evdev.list_devices():
        try:
            device = evdev.InputDevice(path)
        except OSError as e:
            logger.warning(f"Could not open input device {path}: {e}")
            continue

        name_lower = device.name.lower()
        if any(bad in name_lower for bad in _NAME_EXCLUDE):
            continue
        if not any(good in name_lower for good in _NAME_INCLUDE):
            continue

        abs_caps = dict(device.capabilities().get(ecodes.EV_ABS, []))
        if ecodes.ABS_MT_SLOT in abs_caps and ecodes.ABS_MT_TRACKING_ID in abs_caps:
            logger.info(f"Found touchscreen: {device.name} ({path})")
            return device

    return None


class MultiTouchReader:
    """
    Reads a multitouch device on a background thread and makes touch
    down/move/up events available to the main (Pyglet) thread via a queue.

    Events are tuples: ('down'|'move'|'up', touch_id, raw_x, raw_y).
    raw_x/raw_y are in the device's own coordinate range (see x_range/y_range)
    - normalize() converts them into Pyglet window pixel space.
    """

    def __init__(self, device=None):
        self.device = device if device is not None else find_touchscreen_device()
        self._thread = None
        self._running = False
        self._events = queue.Queue()

        # Protocol B touch-tracking state (see process_event())
        self._current_slot = 0
        self._slots = {}  # slot -> {'id': tracking_id, 'x', 'y', 'new'/'moved' flags}

        self.x_range = (0, 1)
        self.y_range = (0, 1)

        if self.device is not None:
            abs_caps = dict(self.device.capabilities().get(ecodes.EV_ABS, []))
            x_info = abs_caps.get(ecodes.ABS_MT_POSITION_X)
            y_info = abs_caps.get(ecodes.ABS_MT_POSITION_Y)
            if x_info:
                self.x_range = (x_info.min, x_info.max)
            if y_info:
                self.y_range = (y_info.min, y_info.max)

    @property
    def available(self):
        return self.device is not None

    def start(self):
        if not self.available or self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._read_loop, daemon=True)
        self._thread.start()
        logger.info(f"Multitouch reader started on {self.device.name}")

    def stop(self):
        self._running = False
        if self.device is not None:
            try:
                self.device.close()
            except Exception:
                pass

    def drain_events(self):
        """Pop all queued touch events since the last call. Call once per frame."""
        events = []
        while True:
            try:
                events.append(self._events.get_nowait())
            except queue.Empty:
                break
        return events

    def normalize(self, raw_x, raw_y, window_width, window_height):
        """
        Convert a raw device coordinate to Pyglet window pixel space
        (bottom-left origin, y up - matching on_mouse_press coordinates).
        Touch digitizers report y top-down like most screen conventions, so
        this flips y the same way the rest of the engine does for anything
        coming from "web/screen space".
        """
        x_min, x_max = self.x_range
        y_min, y_max = self.y_range
        x_span = (x_max - x_min) or 1
        y_span = (y_max - y_min) or 1

        fx = (raw_x - x_min) / x_span
        fy = (raw_y - y_min) / y_span

        px = fx * window_width
        py = window_height - (fy * window_height)
        return px, py

    def _read_loop(self):
        try:
            for event in self.device.read_loop():
                if not self._running:
                    break
                self.process_event(event.type, event.code, event.value)
        except Exception as e:
            logger.error(f"Touch device read loop stopped: {e}")

    def process_event(self, ev_type, ev_code, ev_value):
        """
        Process a single (type, code, value) evdev event and update touch
        state, pushing any resulting down/move/up events to the queue.
        Protocol B multitouch: ABS_MT_SLOT selects which contact subsequent
        ABS_MT_* events apply to; each contact keeps reporting under the same
        slot until it lifts (ABS_MT_TRACKING_ID goes to -1), at which point
        the slot is free to be reused by a later, unrelated touch.

        Split out from _read_loop so the state machine can be driven directly
        with synthetic events in tests, without a real device.
        """
        if ev_type == ecodes.EV_ABS:
            if ev_code == ecodes.ABS_MT_SLOT:
                self._current_slot = ev_value
            elif ev_code == ecodes.ABS_MT_TRACKING_ID:
                if ev_value == -1:
                    slot = self._slots.pop(self._current_slot, None)
                    if slot is not None:
                        self._events.put(('up', slot['id'], slot['x'], slot['y']))
                else:
                    self._slots[self._current_slot] = {
                        'id': ev_value, 'x': 0, 'y': 0, 'new': True
                    }
            elif ev_code == ecodes.ABS_MT_POSITION_X:
                slot = self._slots.setdefault(
                    self._current_slot, {'id': self._current_slot, 'x': 0, 'y': 0, 'new': True})
                slot['x'] = ev_value
                slot['moved'] = True
            elif ev_code == ecodes.ABS_MT_POSITION_Y:
                slot = self._slots.setdefault(
                    self._current_slot, {'id': self._current_slot, 'x': 0, 'y': 0, 'new': True})
                slot['y'] = ev_value
                slot['moved'] = True

        elif ev_type == ecodes.EV_SYN and ev_code == ecodes.SYN_REPORT:
            for slot in self._slots.values():
                # Pop both flags unconditionally (not via if/elif short-circuit)
                # so a stale 'moved' from a down-and-positioned-in-one-frame
                # touch can't leak into a future frame as a phantom move.
                is_new = slot.pop('new', False)
                moved = slot.pop('moved', False)
                if is_new:
                    self._events.put(('down', slot['id'], slot['x'], slot['y']))
                elif moved:
                    self._events.put(('move', slot['id'], slot['x'], slot['y']))
