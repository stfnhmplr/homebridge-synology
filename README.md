# Homebridge-Synology

[![Package Quality](http://npm.packagequality.com/shield/homebridge-synology.svg)](http://packagequality.com/#?package=homebridge-synology)

homebridge-plugin. Control your Synology Diskstation with Apple-Homekit.

> supports DSM 5.x and 6.x

# Installation
Follow the instruction in [NPM](https://www.npmjs.com/package/homebridge) for the homebridge server installation. The plugin is published through [NPM](https://www.npmjs.com/package/homebridge-synology) and should be installed "globally" by typing:

    sudo npm install -g homebridge-synology

# Configuration

config.json

Example:

    {
        "bridge": {
            "name": "Homebridge",
            "username": "CC:22:3D:E3:CE:51",
            "port": 51826,
            "pin": "031-45-154"
        },
        "description": "This is an example configuration file for homebridge synology plugin",
        "hint": "Always paste into jsonlint.com validation page before starting your homebridge, saves a lot of frustration",
        "accessories": [
            {
                "accessory": "Synology",
                "name": "Diskstation", // the name is displayed in homekit
                "ip": "192.168.178.1", // ip of your diskstation
                "mac": "A1:B3:C3:D4:E5:EX", // mac of your diskstation
                "port": "port number", // (optional) port number of the webinterface, default 5000 (or 5001 if you set secure=true)
                "secure": false, // set this to true if you use a secure connection (https)
                "account": "admin",
                "password": "supersecret",
                "version": 5, // (optional) DSM Version, default is 6
                "timeout": 5000, // (optional) in ms, increase this value for slow network connections
                "disabled": ["switch", "temp"], // (optional) see "disable services"
                "doPolling": true, // (optional) default is false
                "pollingInterval": 60 // (optional) in s, default is 60
            }
        ]
    }


## Disable services
You can disable services of your Synology accessory. Add a `disabled` property with an array to your config.json. You can add the following parameters:
- `switch` to disable the On/Off switch
- `temp` to disable the temperature
- `stats` to disable the custom characeristics cpu load and disk usage quote.
**Note** This accessory will only appear as switch at the Apple Home App. Use the EVE App instead to get all services.

## Two factor authentification (2FA)
This plugin does not support 2FA. If you have enabled 2FA, you can't use this plugin.

# Functions
- wake up (wake-on-lan has to be active) your diskstation
- shutdown your diskstation
- get the current system or average disk temperature
- get the current cpu load
- get the disk usage quote (it is the average usage if you have more than one volume)

# Issues
Please double check your config.json before opening an issue.
When you open an issue provide a detailed description of your problem and add your config.json (without password).

# Roadmap
- Polling feature with ping
