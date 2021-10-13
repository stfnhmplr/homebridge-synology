<p align="center"><img src="https://socialify.git.ci/stfnhmplr/homebridge-synology/image?description=1&font=Inter&issues=1&language=1&pattern=Charlie%20Brown&stargazers=1&theme=Light" alt="project"></p>

## 🧐 Features
- Wake up (WOL has to be enabled) and shutdown your Synology Diskstation
- Get the current system temperature
- Supports 2-Factor-Authentication
- Configuration through homebridge-ui-x

**If you would like to support me or the further development, please consider buying me a coffee.**

<a href="https://www.buymeacoffee.com/himpler" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>

## 🚀 Installation
<p>Follow the instruction in NPM for the homebridge server installation. The plugin is published through NPM and should be installed "globally" by typing:</p>

```
sudo npm install -g homebridge-synology
```

## 🛠️ Configuration
Edit your `config.json` and add a new accessory. Example:

```json
{
    "bridge": {
        "name": "Homebridge",
        "username": "CC:22:3D:E3:CE:51",
        "port": 51826,
        "pin": "031-45-154"
    },
    "description": "This is an example configuration file for the homebridge synology plugin",
    "hint": "Always paste into jsonlint.com validation page before starting your homebridge, saves a lot of frustration",
    "accessories": [
        {
            "accessory": "synology",
            "name": "Diskstation",
            "host": "192.168.1.1",
            "mac": "A1:B2:C3:D4:E5:F6",
            "port": 5000,
            "protocol": "http",
            "username": "your-username",
            "password": "your-password",
            "version": "6.2.2",
            "otp": "otp-code for 2FA",
            "startupTime": 60,
            "shutdownTime": 60,
            "disabled": [],
        }
    ]
}
```
### Some explanations
- **Version:** Your current DSM Version. **Important:** If you are using DSM version > 6.2.2 or DSM 7, enter `6.2.2` here anyway.
- **OTP (optional):** If you have enabled 2-Factor-Authentication, the code must be entered here. For more information, see https://github.com/iobroker-community-adapters/ioBroker.synology/blob/HEAD/docs/en/template.md
- **Startup and shutdown time (optional):** You can specify a duration for the startup and the shutdown process. During this time, there is no status change due to polling. Both defaults to 60s.
- **disabled (optional):** You can disable features. The services to be deactivated must be specified as an array of strings, such as `["switch", "temperature"]`. If you disable the switch functionality, you can't start or stop your diskstation anymore.

## 🛡️ License
This project is licensed under the MIT
