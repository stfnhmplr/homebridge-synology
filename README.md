# Homebridge-Synology
homebridge-plugin. Control your Synology Diskstation with Apple-Homekit.

> support for DSM 5.x and 6.x

#Installation
Follow the instruction in [NPM](https://www.npmjs.com/package/homebridge) for the homebridge server installation. The plugin is published through [NPM](https://www.npmjs.com/package/homebridge-synology) and should be installed "globally" by typing:

    sudo npm install -g homebridge-synology

#Configuration

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
                "name": "Diskstation",
                "ip": "192.168.178.1",
                "mac": "A1:B3:C3:D4:E5:EX",
                "port": "port number",
                "secure": false,
                "account": "admin",
                "password": "supersecret",
                "version": 5 //DSM Version, default is 6
            }
        ]
    }

#Functions
- wake up (wake-on-lan has to be active) your diskstation
- shutdown your diskstation
- get the current system or average disk temperature
- get the current cpu load
- get the disk usage quote (it is the average usage if you have more than one volume)

more to come
