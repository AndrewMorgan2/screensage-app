---
title: "Node Setup"
---

# Commands to setup ScreenSage Node

```bash
sudo pacman -Sy
sudo pacman -S hostapd dnsmasq
sudo nano /etc/hostapd/hostapd.conf
```
interface=wlan0
driver=nl80211
ssid=YourHotspotName
hw_mode=g
channel=6
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0
wpa=2
wpa_passphrase=YourPassword
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP
```

sudo nano /etc/dnsmasq.conf
```
interface=wlan0
dhcp-range=192.168.50.10,192.168.50.50,255.255.255.0,24h
```

