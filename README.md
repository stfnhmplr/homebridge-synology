# Homebridge-Synology
homebridge-plugin for using Synology Diskstations with Apple-Homekit.

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
                "port": "port number";
                "secure": false,
                "account": "admin",
                "password": "supersecret"
            }
        ]
    }
  
#Functions
for now you can only wake up (wake-on-lan has to be active) and shutdown your diskstation

