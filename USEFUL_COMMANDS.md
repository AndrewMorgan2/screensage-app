# Useful Commands Reference

Quick reference guide for common Screen Sage commands and system configuration.

## Useful commands

Place where I keep commands I use regualy and therefore find useful.

Installing python dependencies
```bash
/home/amorgan/GitHub/ScreenSage/python-env/bin/python -m pip install requests
```

No Wi-Fi should be on.
```bash
sudo rfkill unblock wifi
# or
sudo rfkill unblock all 
sudo /usr/bin/wihotspot
```
## Related Documentation

- [Installation Guide](INSTALLATION.md) - System setup and installation
- [Touchscreen Setup](TOUCHSCREEN_SETUP.md) - Configure touchscreen displays
- [WiFi Hotspot Setup](WIFI_HOTSPOT_SETUP.md) - Mobile hotspot configuration

---

*For more information, see the main [README](README.md) or visit the [GitHub repository](https://github.com/AndrewMorgan2/ScreenSage).*
