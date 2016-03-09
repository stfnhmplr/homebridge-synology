var Service, Characteristic;
var request = require('request');
var wol = require('wake_on_lan');

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory('homebridge-synology', 'Synology', SynologyAccessory);
};

function SynologyAccessory(log, config) {
    this.log = log;
    this.config = config;
    this.ip = config['ip'];
    this.secure = config['secure'];
    this.name = config['name'];
    this.synoport = config['port'] || (this.secure ? ':5001' : ':5000');
    this.mac = config['mac'];
    this.url = 'http' + (this.secure ? 's' : '') + '://' + this.ip + this.synoport;
    this.params = {
        login: {
            api: 'SYNO.API.Auth',
            method: 'login',
            version: 3,
            account: config['account'],
            passwd: config['password'],
            session: 'homebridge-synology-' + Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 10),
            format: 'sid'
        },
        logout: {
            api: 'SYNO.API.Auth',
            method: 'login',
            version: 3
        },
        shutdown: {
            api: 'SYNO.DSM.System',
            version: 1,
            method: 'shutdown',
            _sid: '' //available after login
        }
    };

    this.service = new Service.Switch('Power');
}

SynologyAccessory.prototype.getPowerState = function (callback) {
    request({url: this.url + '/webman/index.cgi', method: 'GET', timeout: 3000}, function (error, response) {
        if (!error && response.statusCode == 200) {
            callback(null, true);
        } else {
            callback(null, false);
        }
    }.bind(this));
};

SynologyAccessory.prototype.setPowerState = function (powerState, callback) {

    if (powerState) { //turn on
        wol.wake(this.mac, function (error) {
            if (!error) {
                this.log('Diskstation woken up');
                callback(null)
            } else {
                this.log(error);
                callback(error);
            }
        }.bind(this));
    }

    else { //turn off
        request({url: this.url + '/webapi/auth.cgi', qs: this.params.login, method: 'GET', timeout: 3000},
            function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    var res = JSON.parse(body);

                    if (res.success) {
                        this.params.shutdown._sid = res.data.sid;
                        request({url: this.url + '/webapi/dsm/system.cgi', qs: this.params.shutdown, method: 'GET'},
                            function (error, response, body) {
                                if (!error && response.statusCode == 200 && JSON.parse(body).success) {
                                    this.log('Diskstation shuts down.');
                                    callback(null);
                                } else {
                                    this.log(error || new Error('undefinied error'));
                                    callback(error);
                                }
                            }.bind(this));
                    }
                } else {
                    this.log(error || new Error('Can not connect to Diskstation'));
                    callback(error);
                }
            }.bind(this));
    }
};

SynologyAccessory.prototype.getServices = function () {
    var informationService = new Service.AccessoryInformation();

    informationService
        .setCharacteristic(Characteristic.Name, this.name)
        .setCharacteristic(Characteristic.Manufacturer, 'Synology')
        .setCharacteristic(Characteristic.Model, this.name)
        .setCharacteristic(Characteristic.SerialNumber, 'synology-serial-number');

    this.service.getCharacteristic(Characteristic.On)
        .on('get', this.getPowerState.bind(this))
        .on('set', this.setPowerState.bind(this));

    return [informationService, this.service];
};
