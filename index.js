var Service, Characteristic;
var Synology = require('./lib/synology');
var inherits = require('util').inherits;


module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    fixInheritance(SynologyAccessory.CpuLoad, Characteristic);
    fixInheritance(SynologyAccessory.DiskUsage, Characteristic);
    fixInheritance(SynologyAccessory.StatsService, Service);

    homebridge.registerAccessory('homebridge-synology', 'Synology', SynologyAccessory);
};


function fixInheritance(subclass, superclass) {
    var proto = subclass.prototype;
    inherits(subclass, superclass);
    subclass.prototype.parent = superclass.prototype;
    for (var mn in proto) {
        subclass.prototype[mn] = proto[mn];
    }
}


function SynologyAccessory(log, config) {
    this.log = log;
    this.config = config;
    this.port = config['port'] || (this.secure ? '5001' : '5000');
    this.name = config['name'];
    this.account = config['account'];
    this.passwd = config['password'];

    this.synology = new Synology({
      ip: config['ip'],
      mac: config['mac'],
      secure: config['secure'],
      port: this.port,
      version: config['version']
    });
}


SynologyAccessory.CpuLoad = function () {
    Characteristic.call(this, 'CPU Load', '12d21a89-9466-4548-8edd-b05e6b93c23e');
    this.setProps({
        format: Characteristic.Formats.UINT8,
        unit: Characteristic.Units.PERCENTAGE,
        perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
    });
    this.value = this.getDefaultValue();
};


SynologyAccessory.DiskUsage = function () {
    Characteristic.call(this, 'Disk Usage', 'de3c3d3d-6f86-446c-9dac-535858736ddd');
    this.setProps({
        format: Characteristic.Formats.UINT8,
        unit: Characteristic.Units.PERCENTAGE,
        perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY] //, Characteristic.Perms.NOTIFY
    });
    this.value = this.getDefaultValue();
};


SynologyAccessory.StatsService = function (displayName, subtype) {
    Service.call(this, displayName, '9d0ea4eb-31db-47e9-83ef-302193e669d8', subtype);
    this.addCharacteristic(SynologyAccessory.DiskUsage);
    this.addOptionalCharacteristic(SynologyAccessory.CpuLoad);
};


SynologyAccessory.prototype.getPowerState = function (callback) {
    this.synology.getPowerState(function (err, state) {
        if (!err) {
            this.log('current power state is: ' + state);
            callback(null, state);
        } else {
            this.log(err);
            callback(err);
        }
    }.bind(this));
};


SynologyAccessory.prototype.setPowerState = function (powerState, callback) {

    if (powerState) { //turn on
        this.synology.wakeUp(function (err) {
            if (!err) {
                this.log('Diskstation woked up!');
                callback(null);
            } else {
                this.log('Something went wrong: ' + err);
                callback(err);
            }
        }.bind(this));
    }

    else { //turn off
        this.synology.login(this.account, this.passwd, function (err) {
            if (!err) {
                this.synology.shutdown(function (err) {
                    (err) ? callback(err) : callback(null);
                });
            } else {
                callback(err);
            }
        }.bind(this));
    }
};


SynologyAccessory.prototype.getCpuLoad = function (callback) {
    this.synology.login(this.account, this.passwd, function (err) {
        if (!err) {
            this.synology.getCpuLoad(function (err, data) {
                if (!err) {
                    this.log('current cpu load: %s %', data);
                    callback(null, data);
                } else {
                    this.log('Something went wrong: ' + data);
                    callback(err);
                }
            }.bind(this));
        }
    }.bind(this));
};


SynologyAccessory.prototype.getDiskUsage = function (callback) {
    this.synology.login(this.account, this.passwd, function (err) {
        if (!err) {
            this.synology.getDiskUsage(function (err, data) {
                if (!err) {
                    this.log('current volume usage: %s %', data);
                    callback(null, data);
                } else {
                    this.log('Something went wrong: ' + data);
                    callback(err);
                }
            }.bind(this));
        }
    }.bind(this));
};


SynologyAccessory.prototype.getSystemTemp = function (callback) {
    this.synology.login(this.account, this.passwd, function (err) {
        if (!err) {
            this.synology.getSystemTemp(function (err, data) {
                if (!err) {
                    this.log('current system temp: %s °C', data);
                    callback(null, data);
                } else {
                    this.log('Something went wrong: ' + data);
                    callback(err);
                }
            }.bind(this));
        }
    }.bind(this));
};


SynologyAccessory.prototype.getServices = function () {
    var informationService = new Service.AccessoryInformation();

    informationService
        .setCharacteristic(Characteristic.Name, this.name)
        .setCharacteristic(Characteristic.Manufacturer, 'Synology');

    var switchService = new Service.Switch(this.name);
    switchService.getCharacteristic(Characteristic.On)
        .on('get', this.getPowerState.bind(this))
        .on('set', this.setPowerState.bind(this));

    var statsService = new SynologyAccessory.StatsService('Stats Service');
    statsService.getCharacteristic(SynologyAccessory.DiskUsage)
        .on('get', this.getDiskUsage.bind(this));
    statsService.getCharacteristic(SynologyAccessory.CpuLoad)
        .on('get', this.getCpuLoad.bind(this));

    var tempService = new Service.TemperatureSensor('System Temperature');
    tempService.getCharacteristic(Characteristic.CurrentTemperature)
        .on('get', this.getSystemTemp.bind(this));

    return [informationService, switchService, tempService, statsService];
};
