#!/usr/bin/env python3
"""
Display Manager Module
Handles pygame display initialization, multi-monitor support, and window management.
"""
import os
import pygame
import subprocess


class DisplayManager:
    """
    Manages pygame display setup, multi-monitor support, and window management.
    """
    
    def __init__(self, config):
        """
        Initialize display manager with configuration.
        
        Args:
            config (dict): Display configuration
        """
        self.config = config
        self.screen = None
        self.window_width = 1920
        self.window_height = 1080
    
    def init_display(self):
        """
        Initialize SDL display with improved multi-monitor support for Ubuntu.
        
        Handles monitor selection, fullscreen/windowed modes, and Linux-specific
        window management with proper offset calculations.
        
        Returns:
            pygame.Surface: The display surface
        """
        pygame.init()
        
        # Get monitor configuration from config
        monitor = self.config.get('screen', {}).get('monitor', 0)
        
        # Get display information
        num_displays = pygame.display.get_num_displays()
        desktop_sizes = pygame.display.get_desktop_sizes()
        
        print(f"Available displays: {num_displays}")
        for i in range(num_displays):
            bounds = desktop_sizes[i]
            print(f"Display {i}: {bounds[0]}x{bounds[1]}")
        
        # Validate and adjust monitor selection
        if monitor >= num_displays:
            print(f"Warning: Monitor {monitor} not available, using monitor 0")
            monitor = 0
        
        # Get target monitor dimensions
        target_bounds = desktop_sizes[monitor]
        self.window_width = target_bounds[0]
        self.window_height = target_bounds[1]
        
        print(f"Target monitor {monitor}: {self.window_width}x{self.window_height}")
        
        # Calculate proper window position for the target monitor
        self._set_window_position(monitor, desktop_sizes)
        
        # Linux-specific optimizations
        os.environ['SDL_VIDEO_X11_NET_WM_BYPASS_COMPOSITOR'] = '0'
        
        # Display mode setup
        fullscreen = self.config.get('screen', {}).get('fullscreen', True)

        if fullscreen:
            # True fullscreen mode - use display parameter if available
            try:
                self.screen = pygame.display.set_mode(
                    (self.window_width, self.window_height), 
                    pygame.FULLSCREEN | pygame.HWSURFACE | pygame.DOUBLEBUF,
                    display=monitor
                )
                print("✓ Running in true fullscreen mode")
            except pygame.error as e:
                print(f"Fullscreen failed: {e}, falling back to borderless")
                self._create_borderless_window()
        else:
            # Borderless windowed mode (DEFAULT)
            self._create_borderless_window()
        
        return self.screen
    
    def _set_window_position(self, target_monitor, desktop_sizes):
        """
        Set SDL window position for specific monitor with improved offset calculation.
        
        Args:
            target_monitor (int): Target monitor index
            desktop_sizes (list): List of (width, height) tuples for each display
        """
        if target_monitor == 0:
            # Primary monitor - always use 0,0
            os.environ['SDL_VIDEO_WINDOW_POS'] = '0,0'
            print("✓ Window positioned on primary monitor at (0,0)")
        else:
            # Secondary monitor - calculate cumulative offset
            try:
                # Method 1: Try to get actual monitor positions using xrandr (Linux)
                x_offset, y_offset = self._get_monitor_position_xrandr(target_monitor)
                if x_offset is not None and y_offset is not None:
                    os.environ['SDL_VIDEO_WINDOW_POS'] = f'{x_offset},{y_offset}'
                    print(f"✓ Window positioned using xrandr at ({x_offset},{y_offset})")
                    return
            except Exception as e:
                print(f"xrandr positioning failed: {e}")
            
            # Method 2: Fallback to cumulative width calculation
            try:
                x_offset = sum(desktop_sizes[i][0] for i in range(target_monitor))
                y_offset = 0  # Assume horizontal layout
                os.environ['SDL_VIDEO_WINDOW_POS'] = f'{x_offset},{y_offset}'
                print(f"✓ Window positioned using cumulative offset at ({x_offset},{y_offset})")
            except Exception as e:
                print(f"Cumulative positioning failed: {e}, using default")
                os.environ['SDL_VIDEO_WINDOW_POS'] = '0,0'
    
    def _get_monitor_position_xrandr(self, target_monitor):
        """
        Get monitor position using xrandr (Linux only).
        
        Args:
            target_monitor (int): Target monitor index
            
        Returns:
            tuple: (x_offset, y_offset) or (None, None) if failed
        """
        try:
            result = subprocess.run(['xrandr', '--query'], 
                                capture_output=True, text=True, check=True)
            
            connected_displays = []
            for line in result.stdout.split('\n'):
                if ' connected' in line and 'primary' in line:
                    # Primary display
                    parts = line.split()
                    for part in parts:
                        if 'x' in part and '+' in part:
                            # Format: WIDTHxHEIGHT+X+Y
                            resolution_pos = part.split('+')
                            if len(resolution_pos) >= 3:
                                x_pos = int(resolution_pos[1])
                                y_pos = int(resolution_pos[2])
                                connected_displays.insert(0, (x_pos, y_pos))  # Primary first
                            break
                elif ' connected' in line and 'primary' not in line:
                    # Secondary display
                    parts = line.split()
                    for part in parts:
                        if 'x' in part and '+' in part:
                            resolution_pos = part.split('+')
                            if len(resolution_pos) >= 3:
                                x_pos = int(resolution_pos[1])
                                y_pos = int(resolution_pos[2])
                                connected_displays.append((x_pos, y_pos))
                            break
            
            if target_monitor < len(connected_displays):
                return connected_displays[target_monitor]
            
        except Exception as e:
            print(f"xrandr query failed: {e}")
        
        return None, None
    
    def _create_borderless_window(self):
        """Create borderless window with error handling."""
        try:
            self.screen = pygame.display.set_mode(
                (self.window_width, self.window_height),
                pygame.NOFRAME | pygame.HWSURFACE | pygame.DOUBLEBUF
            )
            print("✓ Running in borderless fullscreen windowed mode")
            
            # Linux window management for borderless mode
            self._setup_linux_window_management()
            
        except pygame.error as e:
            print(f"Borderless window creation failed: {e}")
            # Fallback to regular window
            self.screen = pygame.display.set_mode(
                (self.window_width, self.window_height),
                pygame.HWSURFACE | pygame.DOUBLEBUF
            )
            print("✓ Running in regular windowed mode (fallback)")
    
    def _setup_linux_window_management(self):
        """
        Setup Linux-specific window management with improved window detection.
        """
        try:
            # Wait for window creation
            pygame.time.wait(200)  # Increased wait time
            
            # Try multiple methods to find the window
            window_id = self._find_pygame_window()
            
            if not window_id:
                print("Could not find pygame window for advanced management")
                return
            
            print(f"Found pygame window: {window_id}")
            
            # Remove window decorations
            subprocess.run([
                'xprop', '-id', window_id, '-f', '_MOTIF_WM_HINTS', '32c', 
                '-set', '_MOTIF_WM_HINTS', '0x2, 0x0, 0x0, 0x0, 0x0'
            ], capture_output=True, check=False)
            
            # Set window properties
            subprocess.run(['xdotool', 'windowraise', window_id], 
                        capture_output=True, check=False)
            subprocess.run(['wmctrl', '-i', '-r', window_id, '-b', 'add,above,sticky'], 
                        capture_output=True, check=False)
            subprocess.run(['wmctrl', '-i', '-r', window_id, '-b', 'add,skip_taskbar,skip_pager'], 
                        capture_output=True, check=False)
            
            print("✓ Window configured: borderless, always on top")
            
        except Exception as e:
            print(f"Window management setup failed: {e}")
            print("For full borderless support, install: sudo apt install xdotool wmctrl")
    
    def _find_pygame_window(self):
        """
        Find the pygame window using multiple detection methods.
        
        Returns:
            str: Window ID or None if not found
        """
        methods = [
            # Method 1: Search by window title
            ['xdotool', 'search', '--name', 'pygame window'],
            ['xdotool', 'search', '--name', 'Display Engine'],
            
            # Method 2: Search by class
            ['xdotool', 'search', '--class', 'pygame'],
            
            # Method 3: Get active window (if pygame just opened)
            ['xdotool', 'getactivewindow'],
        ]
        
        for method in methods:
            try:
                result = subprocess.run(method, capture_output=True, text=True, check=False)
                if result.returncode == 0 and result.stdout.strip():
                    window_ids = result.stdout.strip().split('\n')
                    # Return the first valid window ID
                    for wid in window_ids:
                        if wid.strip().isdigit():
                            return wid.strip()
            except Exception:
                continue
        
        return None
    
    def debug_display_info(self):
        """Print detailed display information for debugging."""
        print("\n" + "="*50)
        print("DISPLAY DEBUG INFORMATION")
        print("="*50)
        
        # pygame display info
        num_displays = pygame.display.get_num_displays()
        desktop_sizes = pygame.display.get_desktop_sizes()
        
        print(f"Pygame detected displays: {num_displays}")
        for i, size in enumerate(desktop_sizes):
            print(f"  Display {i}: {size[0]}x{size[1]}")
        
        # Try xrandr for Linux
        try:
            result = subprocess.run(['xrandr', '--query'], 
                                capture_output=True, text=True, check=True)
            print("\nxrandr output:")
            for line in result.stdout.split('\n'):
                if ' connected' in line:
                    print(f"  {line.strip()}")
        except Exception as e:
            print(f"xrandr not available: {e}")
        
        # Environment variables
        print(f"\nSDL_VIDEO_WINDOW_POS: {os.environ.get('SDL_VIDEO_WINDOW_POS', 'not set')}")
        
        print("="*50 + "\n")
    
    @property
    def dimensions(self):
        """Get window dimensions as tuple."""
        return (self.window_width, self.window_height)