"""
Debug statistics and logging configuration for the Pyglet Display Engine.
"""

import sys
import time
import logging
from pathlib import Path
from datetime import datetime
from collections import deque
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from display_engine_pyglet import PygletDisplayEngine

# =============================================================================
# LOGGING CONFIGURATION
# =============================================================================

LOG_FORMAT = '%(asctime)s.%(msecs)03d [%(levelname)s] [%(name)s] %(message)s'
DATE_FORMAT = '%Y-%m-%d %H:%M:%S'

# Create logger
logger = logging.getLogger('ScreenSage.DisplayEngine')
logger.setLevel(logging.DEBUG)

# Console handler
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(logging.DEBUG)
console_handler.setFormatter(logging.Formatter(LOG_FORMAT, DATE_FORMAT))
logger.addHandler(console_handler)

# File handler for persistent logs
log_dir = None
log_file = None
try:
    log_dir = Path(__file__).parent / 'logs'
    log_dir.mkdir(exist_ok=True)
    log_file = log_dir / f'display_engine_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log'
    file_handler = logging.FileHandler(log_file)
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(logging.Formatter(LOG_FORMAT, DATE_FORMAT))
    logger.addHandler(file_handler)
    logger.info(f"Log file created: {log_file}")
except Exception as e:
    logger.warning(f"Could not create log file: {e}")


class DebugStats:
    """
    Tracks runtime statistics and resource usage for debugging crashes.
    """

    def __init__(self):
        self.start_time = time.time()
        self.frame_count = 0
        self.reload_count = 0
        self.last_frame_time = time.time()
        self.frame_times = deque(maxlen=120)  # Last 2 seconds at 60fps
        self.error_log = deque(maxlen=100)  # Last 100 errors

        # Resource tracking
        self.sprites_created = 0
        self.sprites_deleted = 0
        self.videos_created = 0
        self.videos_deleted = 0
        self.textures_loaded = 0

        # Memory tracking (requires psutil)
        self._psutil_available = False
        self._process = None
        try:
            import psutil
            self._psutil_available = True
            self._process = psutil.Process()
            logger.info("psutil available - memory tracking enabled")
        except ImportError:
            logger.warning("psutil not installed - memory tracking disabled (pip install psutil)")

        # Peak tracking
        self.peak_memory_mb = 0
        self.peak_sprites = 0
        self.peak_videos = 0
        self.peak_fog_areas = 0

        # Timing tracking
        self.last_report_time = time.time()
        self.report_interval = 30.0  # Report every 30 seconds

    def get_memory_mb(self) -> float:
        """Get current memory usage in MB."""
        if self._psutil_available and self._process:
            try:
                mem_info = self._process.memory_info()
                return mem_info.rss / (1024 * 1024)
            except Exception:
                pass
        return 0.0

    def record_frame(self, dt: float):
        """Record frame timing."""
        self.frame_count += 1
        self.frame_times.append(dt)
        self.last_frame_time = time.time()

    def record_error(self, error_type: str, message: str, stack_trace: str = None):
        """Record an error for debugging."""
        self.error_log.append({
            'time': datetime.now().isoformat(),
            'uptime': time.time() - self.start_time,
            'frame': self.frame_count,
            'type': error_type,
            'message': message,
            'stack': stack_trace
        })
        logger.error(f"[{error_type}] {message}")
        if stack_trace:
            logger.debug(f"Stack trace:\n{stack_trace}")

    def update_resource_counts(self, sprites: int, videos: int, shapes: int,
                               animations: int, fog_areas: int):
        """Update current resource counts and track peaks."""
        total_sprites = sprites + shapes + animations
        self.peak_sprites = max(self.peak_sprites, total_sprites)
        self.peak_videos = max(self.peak_videos, videos)
        self.peak_fog_areas = max(self.peak_fog_areas, fog_areas)

        mem = self.get_memory_mb()
        self.peak_memory_mb = max(self.peak_memory_mb, mem)

    def get_fps(self) -> float:
        """Calculate current FPS from recent frame times."""
        if len(self.frame_times) < 2:
            return 0.0
        return len(self.frame_times) / sum(self.frame_times)

    def should_report(self) -> bool:
        """Check if it's time to generate a periodic report."""
        return time.time() - self.last_report_time >= self.report_interval

    def generate_report(self, engine: 'PygletDisplayEngine') -> str:
        """Generate a comprehensive debug report."""
        self.last_report_time = time.time()

        uptime = time.time() - self.start_time
        uptime_str = f"{int(uptime // 3600)}h {int((uptime % 3600) // 60)}m {int(uptime % 60)}s"

        mem_mb = self.get_memory_mb()
        fps = self.get_fps()

        # Get fog area count
        fog_areas = 0
        if engine.fog_manager:
            fog_areas = len(engine.fog_manager.fog_cleared_areas)

        report = f"""
================================================================================
SCREENSAGE DEBUG REPORT - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
================================================================================
UPTIME: {uptime_str} | FRAMES: {self.frame_count:,} | RELOADS: {self.reload_count}

PERFORMANCE:
  Current FPS: {fps:.1f}
  Avg Frame Time: {sum(self.frame_times) / len(self.frame_times) * 1000:.2f}ms (last {len(self.frame_times)} frames)

MEMORY:
  Current: {mem_mb:.1f} MB | Peak: {self.peak_memory_mb:.1f} MB

RESOURCES (Current / Peak):
  Sprites:    {len(engine.sprites):4d} / {self.peak_sprites}
  Videos:     {len(engine.video_players):4d} / {self.peak_videos}
  Shapes:     {len(engine.shapes):4d}
  Animations: {len(engine.animations):4d}
  Fog Areas:  {fog_areas:4d} / {self.peak_fog_areas}

RESOURCE LIFECYCLE:
  Sprites created/deleted: {self.sprites_created} / {self.sprites_deleted}
  Videos created/deleted:  {self.videos_created} / {self.videos_deleted}
  Textures loaded:         {self.textures_loaded}

RECENT ERRORS: {len(self.error_log)} logged
"""
        if self.error_log:
            report += "\nLast 5 errors:\n"
            for err in list(self.error_log)[-5:]:
                report += f"  [{err['time']}] {err['type']}: {err['message'][:80]}\n"

        report += "================================================================================\n"
        return report

    def log_periodic_status(self, engine: 'PygletDisplayEngine'):
        """Log periodic status if interval has passed."""
        if self.should_report():
            report = self.generate_report(engine)
            logger.info(report)

            # Check for potential issues
            mem_mb = self.get_memory_mb()
            if mem_mb > 500:
                logger.warning(f"HIGH MEMORY USAGE: {mem_mb:.1f} MB")

            fog_areas = 0
            if engine.fog_manager:
                fog_areas = len(engine.fog_manager.fog_cleared_areas)
            if fog_areas > 500:
                logger.warning(f"HIGH FOG AREA COUNT: {fog_areas} - may cause slowdown")


# Global debug stats instance
debug_stats = DebugStats()
